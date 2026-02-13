import type { HandbookRetrievedChunk } from '@/utilities/handbook/types'

export type RagSourceMetadata = {
  index: number
  docType: HandbookRetrievedChunk['docType']
  qaId: number | null
  sectionId: number
  bookSlug: string
  bookTitle: string
  sectionTitle: string
  question?: string
  text: string
}

export type ChatMessageMetadata = {
  ragSources?: RagSourceMetadata[]
  suggestions?: string[]
}

const STRUCTURED_METADATA_PREFIX = /^(type|language|book|section|question|tags|keywords|keyword_terms)\s*:/i
const INLINE_STRUCTURED_PREFIX =
  /\b(?:type|language|book|section|question|answer|summary|content|tags|keywords|keyword_terms)\s*:/i
const INLINE_FIELD_DELIMITER =
  /\s+\b(?:type|language|book|section|question|answer|summary|content|tags|keywords|keyword_terms)\s*:/i

const normalizeExcerpt = (text: string, maxLength = 320): string => {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact
}

const getLineFieldValue = (text: string, label: string): string | undefined => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const line = lines.find((item) => item.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  if (!line) return undefined
  return line.replace(new RegExp(`^${label}\\s*:\\s*`, 'i'), '').trim()
}

const getInlineFieldValue = (text: string, label: string): string | undefined => {
  const match = text.match(new RegExp(`\\b${label}\\s*:\\s*([\\s\\S]+)$`, 'i'))
  if (!match?.[1]) return undefined

  const segment = match[1].split(INLINE_FIELD_DELIMITER, 1)[0]?.trim()
  return segment || undefined
}

const getFieldValue = (text: string, label: string): string | undefined => {
  return getLineFieldValue(text, label) || getInlineFieldValue(text, label)
}

export const cleanRagSourcePreview = (
  text: string,
  docType: HandbookRetrievedChunk['docType'],
): string => {
  const raw = text.trim()
  if (!raw) return ''

  const preferredLabels =
    docType === 'qa' ? ['answer', 'summary', 'content'] : ['summary', 'content', 'answer']

  for (const label of preferredLabels) {
    const value = getFieldValue(raw, label)
    if (value) return normalizeExcerpt(value)
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const firstNonMetadataLine = lines.find((line) => !STRUCTURED_METADATA_PREFIX.test(line))
  if (firstNonMetadataLine) return normalizeExcerpt(firstNonMetadataLine)

  if (INLINE_STRUCTURED_PREFIX.test(raw)) {
    return ''
  }

  return normalizeExcerpt(raw)
}

export const toRagSourceMetadata = (chunks: HandbookRetrievedChunk[]): RagSourceMetadata[] => {
  return chunks.map((chunk, index) => ({
    index: index + 1,
    docType: chunk.docType,
    qaId: chunk.qaId,
    sectionId: chunk.sectionId,
    bookSlug: chunk.bookSlug,
    bookTitle: chunk.bookTitle,
    sectionTitle: chunk.sectionTitle,
    question: chunk.question,
    text: cleanRagSourcePreview(chunk.text, chunk.docType),
  }))
}

export const buildHandbookSourceHref = (source: Pick<RagSourceMetadata, 'bookSlug' | 'sectionId' | 'qaId'>): string => {
  const params = new URLSearchParams({
    section: String(source.sectionId),
  })

  if (source.qaId) {
    params.set('qa', String(source.qaId))
  }

  return `/handbook/${encodeURIComponent(source.bookSlug)}?${params.toString()}`
}
