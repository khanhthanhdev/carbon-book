import type { Book, Qa, Section } from '@/payload-types'
import { extractLexicalText } from '@/utilities/richText/extractLexicalText'

import type { HandbookVectorLanguage, HandbookVectorRecord } from './types'

export const RECORD_VERSION = 'v1'
const MAX_DATA_LENGTH = 8000

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim()
}

const truncate = (value: string): string => {
  if (value.length <= MAX_DATA_LENGTH) return value
  return value.slice(0, MAX_DATA_LENGTH)
}

const normalizeTerm = (value: string): string => {
  return normalizeWhitespace(value)
}

const toMetadataTerms = (
  rows?:
    | {
        value: string
        id?: string | null
      }[]
    | null,
): string[] => {
  if (!rows || rows.length === 0) return []

  const dedupe = new Set<string>()
  const terms: string[] = []

  for (const row of rows) {
    const normalized = normalizeTerm(row.value)
    if (!normalized) continue

    const key = normalized.toLocaleLowerCase()
    if (dedupe.has(key)) continue

    dedupe.add(key)
    terms.push(normalized)
  }

  return terms
}

const pickLocalized = (
  language: HandbookVectorLanguage,
  vietnamese?: string | null,
  english?: string | null,
): string => {
  if (language === 'vi') return normalizeWhitespace(vietnamese || english || '')
  return normalizeWhitespace(english || vietnamese || '')
}

const resolveRelationId = <T extends { id: number }>(
  value: number | T | null | undefined,
): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'number') {
    return value.id
  }

  return null
}

const buildSectionData = ({
  section,
  book,
  language,
}: {
  section: Section
  book: Book
  language: HandbookVectorLanguage
}): string => {
  const title = pickLocalized(language, section.title_vi, section.title_en)
  const summary = pickLocalized(language, section.summary_vi, section.summary_en)
  const bookTitle = pickLocalized(language, book.title_vi, book.title_en)
  const tags = toMetadataTerms(section.metadata?.tags || null)
  const keywords = toMetadataTerms(section.metadata?.keywords || null)

  const rows = [
    `type: section`,
    `language: ${language}`,
    `book: ${bookTitle}`,
    `section: ${title}`,
    summary ? `summary: ${summary}` : '',
    tags.length > 0 ? `tags: ${tags.join(', ')}` : '',
    keywords.length > 0 ? `keywords: ${keywords.join(', ')}` : '',
    keywords.length > 0 ? `keyword_terms: ${keywords.join(' ')}` : '',
  ].filter(Boolean)

  return truncate(rows.join('\n'))
}

const buildQaData = ({
  qa,
  section,
  book,
  language,
}: {
  qa: Qa
  section: Section
  book: Book
  language: HandbookVectorLanguage
}): string => {
  const question = pickLocalized(language, qa.question_vi, qa.question_en)
  const answer =
    language === 'vi' ? extractLexicalText(qa.answer_vi) : extractLexicalText(qa.answer_en)
  const sectionTitle = pickLocalized(language, section.title_vi, section.title_en)
  const bookTitle = pickLocalized(language, book.title_vi, book.title_en)
  const tags = toMetadataTerms(qa.metadata?.tags || null)
  const keywords = toMetadataTerms(qa.metadata?.keywords || null)

  const rows = [
    `type: qa`,
    `language: ${language}`,
    `book: ${bookTitle}`,
    `section: ${sectionTitle}`,
    question ? `question: ${question}` : '',
    answer ? `answer: ${normalizeWhitespace(answer)}` : '',
    tags.length > 0 ? `tags: ${tags.join(', ')}` : '',
    keywords.length > 0 ? `keywords: ${keywords.join(', ')}` : '',
    keywords.length > 0 ? `keyword_terms: ${keywords.join(' ')}` : '',
  ].filter(Boolean)

  return truncate(rows.join('\n'))
}

const createVectorRecordId = ({
  docType,
  id,
  language,
}: {
  docType: 'qa' | 'section'
  id: number
  language: HandbookVectorLanguage
}): string => {
  return `${docType}:${id}:${language}`
}

export const buildQaRecordIds = (qaId: number): string[] => {
  return [
    createVectorRecordId({ docType: 'qa', id: qaId, language: 'vi' }),
    createVectorRecordId({ docType: 'qa', id: qaId, language: 'en' }),
  ]
}

export const buildSectionRecordIds = (sectionId: number): string[] => {
  return [
    createVectorRecordId({ docType: 'section', id: sectionId, language: 'vi' }),
    createVectorRecordId({ docType: 'section', id: sectionId, language: 'en' }),
  ]
}

export const buildSectionVectorRecords = ({
  section,
  book,
}: {
  section: Section
  book: Book
}): HandbookVectorRecord[] => {
  const tags = toMetadataTerms(section.metadata?.tags || null)
  const keywords = toMetadataTerms(section.metadata?.keywords || null)

  return (['vi', 'en'] as const).map((language) => {
    const title = pickLocalized(language, section.title_vi, section.title_en)
    const bookTitle = pickLocalized(language, book.title_vi, book.title_en)

    return {
      id: createVectorRecordId({
        docType: 'section',
        id: section.id,
        language,
      }),
      data: buildSectionData({
        section,
        book,
        language,
      }),
      metadata: {
        docType: 'section',
        lang: language,
        docId: section.id,
        sectionId: section.id,
        bookId: book.id,
        bookSlug: book.slug,
        bookTitle,
        sectionSlug: section.slug,
        sectionTitle: title,
        published: section._status === 'published',
        tags,
        keywords,
        updatedAt: section.updatedAt,
        title,
        recordVersion: RECORD_VERSION,
      },
    }
  })
}

export const buildQaVectorRecords = ({
  qa,
  section,
  book,
}: {
  qa: Qa
  section: Section
  book: Book
}): HandbookVectorRecord[] => {
  const tags = toMetadataTerms(qa.metadata?.tags || null)
  const keywords = toMetadataTerms(qa.metadata?.keywords || null)

  return (['vi', 'en'] as const).map((language) => {
    const question = pickLocalized(language, qa.question_vi, qa.question_en)
    const bookTitle = pickLocalized(language, book.title_vi, book.title_en)
    const sectionTitle = pickLocalized(language, section.title_vi, section.title_en)

    return {
      id: createVectorRecordId({
        docType: 'qa',
        id: qa.id,
        language,
      }),
      data: buildQaData({
        qa,
        section,
        book,
        language,
      }),
      metadata: {
        docType: 'qa',
        lang: language,
        docId: qa.id,
        qaId: qa.id,
        sectionId: section.id,
        bookId: book.id,
        bookSlug: book.slug,
        bookTitle,
        sectionSlug: section.slug,
        sectionTitle,
        published: qa._status === 'published',
        tags,
        keywords,
        updatedAt: qa.updatedAt,
        question,
        recordVersion: RECORD_VERSION,
      },
    }
  })
}

export const getSectionIdFromQa = (qa: Qa): number | null => {
  return resolveRelationId(qa.section)
}

export const getBookIdFromSection = (section: Section): number | null => {
  return resolveRelationId(section.book)
}
