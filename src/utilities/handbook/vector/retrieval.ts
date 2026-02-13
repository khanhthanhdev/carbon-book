import { FusionAlgorithm, QueryMode } from '@upstash/vector'

import type { HandbookSearchResult, HandbookRetrievedChunk } from '@/utilities/handbook/types'
import type { SupportedLanguage } from '@/utilities/localization'

import { getHandbookVectorNamespace, isHandbookVectorConfigured, retryWithBackoff } from './client'
import type { HandbookVectorDocumentType, HandbookVectorMetadata } from './types'

const DEFAULT_TOP_K = 12
const MAX_TOP_K = 40

const parseQuestionFromData = (value: string): string => {
  const line = value
    .split('\n')
    .find((item) => item.toLowerCase().startsWith('question:'))

  if (!line) return ''
  return line.replace(/^question:\s*/i, '').trim()
}

const SLUG_ALLOWLIST = /^[a-z0-9\-_/]+$/i

const sanitizeSlug = (slug: string): string => {
  if (!SLUG_ALLOWLIST.test(slug)) {
    throw new Error(`Invalid slug format: ${slug}. Only alphanumeric, hyphens, underscores, and slashes allowed.`)
  }
  return slug
}

const quote = (value: string): string => {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const buildHybridFilter = ({
  language,
  documentTypes,
  bookSlug,
  sectionId,
}: {
  language: SupportedLanguage
  documentTypes: HandbookVectorDocumentType[]
  bookSlug?: string
  sectionId?: number
}): string => {
  const clauses: string[] = [`published = true`, `lang = ${quote(language)}`]

  if (documentTypes.length === 1) {
    clauses.push(`docType = ${quote(documentTypes[0])}`)
  } else if (documentTypes.length > 1) {
    clauses.push(`(${documentTypes.map((docType) => `docType = ${quote(docType)}`).join(' OR ')})`)
  }

  if (bookSlug) {
    clauses.push(`bookSlug = ${quote(sanitizeSlug(bookSlug))}`)
  }

  if (Number.isFinite(sectionId)) {
    clauses.push(`sectionId = ${sectionId}`)
  }

  return clauses.join(' AND ')
}

const toChunk = (match: {
  id: string | number
  score: number
  data?: string
  metadata?: HandbookVectorMetadata
}): HandbookRetrievedChunk | null => {
  const metadata = match.metadata
  if (!metadata) return null

  const text = (match.data || '').trim()
  const question = metadata.question?.trim() || parseQuestionFromData(text)

  return {
    id: String(match.id),
    score: match.score,
    docType: metadata.docType,
    lang: metadata.lang,
    text,
    question: question || undefined,
    qaId: metadata.qaId ?? null,
    sectionId: metadata.sectionId,
    sectionSlug: metadata.sectionSlug,
    sectionTitle: metadata.sectionTitle || '',
    bookId: metadata.bookId,
    bookSlug: metadata.bookSlug,
    bookTitle: metadata.bookTitle || '',
    ...(metadata.docType === 'qa' && question ? { text: text || `question: ${question}` } : {}),
  }
}

export const retrieveHandbookHybrid = async ({
  query,
  language,
  topK,
  bookSlug,
  sectionId,
  documentTypes = ['qa', 'section'],
}: {
  query: string
  language: SupportedLanguage
  topK?: number
  bookSlug?: string
  sectionId?: number
  documentTypes?: HandbookVectorDocumentType[]
}): Promise<HandbookRetrievedChunk[]> => {
  if (!isHandbookVectorConfigured()) return []

  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const safeTopK = Math.min(Math.max(topK || DEFAULT_TOP_K, 1), MAX_TOP_K)

  const results = await retryWithBackoff(
    () =>
      getHandbookVectorNamespace().query<HandbookVectorMetadata>({
        data: trimmedQuery,
        topK: safeTopK,
        includeData: true,
        includeMetadata: true,
        filter: buildHybridFilter({
          language,
          documentTypes,
          bookSlug,
          sectionId,
        }),
        queryMode: QueryMode.HYBRID,
        fusionAlgorithm: FusionAlgorithm.DBSF,
      }),
    `hybrid search query (${trimmedQuery.substring(0, 50)})`,
  )

  const chunks: HandbookRetrievedChunk[] = []

  for (const result of results) {
    const chunk = toChunk(result)
    if (!chunk) continue

    chunks.push(chunk)
  }

  return chunks
}

export const searchHandbookWithHybrid = async ({
  query,
  language,
  limit,
}: {
  query: string
  language: SupportedLanguage
  limit: number
}): Promise<HandbookSearchResult[]> => {
  const chunks = await retrieveHandbookHybrid({
    query,
    language,
    topK: Math.min(limit * 4, MAX_TOP_K),
    documentTypes: ['qa'],
  })

  const seenQaIds = new Set<number>()
  const results: HandbookSearchResult[] = []

  for (const chunk of chunks) {
    if (chunk.docType !== 'qa' || !chunk.qaId) continue
    if (!chunk.sectionSlug || !chunk.bookSlug) continue
    if (seenQaIds.has(chunk.qaId)) continue

    const question = chunk.question || (chunk.text ? parseQuestionFromData(chunk.text) : '')

    if (!question || !chunk.sectionTitle || !chunk.bookTitle) {
      continue
    }

    seenQaIds.add(chunk.qaId)

    results.push({
      qaId: chunk.qaId,
      question,
      sectionId: chunk.sectionId,
      sectionTitle: chunk.sectionTitle,
      sectionSlug: chunk.sectionSlug,
      bookId: chunk.bookId,
      bookTitle: chunk.bookTitle,
      bookSlug: chunk.bookSlug,
    })

    if (results.length >= limit) break
  }

  return results
}
