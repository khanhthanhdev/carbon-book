import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Book, Qa, Search, Section } from '@/payload-types'
import {
  pickLocalizedRichText,
  pickLocalizedString,
  type SupportedLanguage,
} from '@/utilities/localization'
import { resolveHandbookSelection } from './selection'
import type {
  HandbookBookView,
  HandbookPageData,
  HandbookQaView,
  HandbookSearchResult,
  HandbookSectionView,
} from './types'

export const HANDBOOK_SEARCH_MIN_QUERY_LENGTH = 2

const HANDBOOK_SEARCH_DEFAULT_LIMIT = 8
const HANDBOOK_SEARCH_MAX_LIMIT = 20

const asRelationId = <T extends { id: number }>(
  value: number | T | null | undefined,
): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'number') {
    return value.id
  }

  return null
}

const toBookView = (book: Book, language: SupportedLanguage): HandbookBookView => {
  return {
    id: book.id,
    slug: book.slug,
    title: pickLocalizedString(language, book.title_vi, book.title_en),
  }
}

export const clampHandbookSearchLimit = (value: number | null | undefined): number => {
  if (!value || Number.isNaN(value)) return HANDBOOK_SEARCH_DEFAULT_LIMIT
  return Math.min(Math.max(value, 1), HANDBOOK_SEARCH_MAX_LIMIT)
}

const getOrderedQaIdsFromSearchDocs = (docs: Search[], limit: number): number[] => {
  const seenQaIds = new Set<number>()
  const orderedQaIds: number[] = []

  for (const searchDoc of docs) {
    if (searchDoc.doc.relationTo !== 'qas') continue

    const value = searchDoc.doc.value
    const qaId = typeof value === 'number' ? value : value?.id

    if (!qaId || seenQaIds.has(qaId)) continue

    seenQaIds.add(qaId)
    orderedQaIds.push(qaId)

    if (orderedQaIds.length >= limit) break
  }

  return orderedQaIds
}

export const getDefaultHandbookBookSlug = async ({ draft }: { draft: boolean }): Promise<string | null> => {
  const payload = await getPayload({ config: configPromise })

  const configuredSlug =
    process.env.HANDBOOK_DEFAULT_BOOK_SLUG || process.env.NEXT_PUBLIC_HANDBOOK_DEFAULT_BOOK_SLUG

  if (configuredSlug) {
    const configuredBook = await payload.find({
      collection: 'books',
      draft,
      limit: 1,
      overrideAccess: draft,
      pagination: false,
      where: {
        slug: {
          equals: configuredSlug,
        },
      },
    })

    if (configuredBook.docs[0]?.slug) {
      return configuredBook.docs[0].slug
    }
  }

  const fallbackBook = await payload.find({
    collection: 'books',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    sort: 'createdAt',
    select: {
      slug: true,
    },
  })

  return fallbackBook.docs[0]?.slug || null
}

export const getHandbookPageData = async ({
  bookSlug,
  draft,
  language,
  selectedQaId,
  selectedSectionId,
}: {
  bookSlug: string
  draft: boolean
  language: SupportedLanguage
  selectedQaId: number | null
  selectedSectionId: number | null
}): Promise<HandbookPageData | null> => {
  const payload = await getPayload({ config: configPromise })

  const books = await payload.find({
    collection: 'books',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: {
      slug: {
        equals: bookSlug,
      },
    },
  })

  const book = books.docs[0]
  if (!book) return null

  const sectionsResult = await payload.find({
    collection: 'sections',
    draft,
    limit: 300,
    overrideAccess: draft,
    pagination: false,
    sort: 'order',
    where: {
      book: {
        equals: book.id,
      },
    },
  })

  const sectionIds = sectionsResult.docs.map((section) => section.id)
  const qasResult =
    sectionIds.length > 0
      ? await payload.find({
          collection: 'qas',
          draft,
          limit: 2000,
          overrideAccess: draft,
          pagination: false,
          sort: 'order',
          where: {
            section: {
              in: sectionIds,
            },
          },
        })
      : { docs: [] as Qa[] }

  const qasBySectionId = new Map<number, HandbookQaView[]>()
  for (const qa of qasResult.docs) {
    const sectionId = asRelationId(qa.section)
    if (!sectionId) continue

    const sectionQas = qasBySectionId.get(sectionId) || []
    sectionQas.push({
      id: qa.id,
      order: qa.order,
      question: pickLocalizedString(language, qa.question_vi, qa.question_en),
      answer: pickLocalizedRichText(language, qa.answer_vi, qa.answer_en),
      sectionId,
      sources: (qa.sources || [])
        .filter((source) => Boolean(source.label) && Boolean(source.url))
        .map((source) => ({
          label: source.label,
          url: source.url,
        })),
    })
    qasBySectionId.set(sectionId, sectionQas)
  }

  const sections: HandbookSectionView[] = sectionsResult.docs
    .map((section) => ({
      id: section.id,
      order: section.order,
      title: pickLocalizedString(language, section.title_vi, section.title_en),
      qas: (qasBySectionId.get(section.id) || []).sort(
        (left, right) => left.order - right.order || left.id - right.id,
      ),
    }))
    .sort((left, right) => left.order - right.order || left.id - right.id)

  const selection = resolveHandbookSelection({
    sections,
    selectedQaId,
    selectedSectionId,
  })

  return {
    book: toBookView(book, language),
    sections,
    selection,
  }
}

export const searchHandbook = async ({
  query,
  draft,
  language,
  limit,
}: {
  query: string
  draft: boolean
  language: SupportedLanguage
  limit: number
}): Promise<HandbookSearchResult[]> => {
  const trimmedQuery = query.trim()
  if (trimmedQuery.length < HANDBOOK_SEARCH_MIN_QUERY_LENGTH) return []

  const payload = await getPayload({ config: configPromise })
  const safeLimit = clampHandbookSearchLimit(limit)

  const searchDocs = await payload.find({
    collection: 'search',
    draft,
    depth: 0,
    limit: Math.min(safeLimit * 10, 100),
    overrideAccess: draft,
    pagination: false,
    where: {
      or: [
        {
          title: {
            like: trimmedQuery,
          },
        },
        {
          'meta.description': {
            like: trimmedQuery,
          },
        },
        {
          'meta.title': {
            like: trimmedQuery,
          },
        },
        {
          slug: {
            like: trimmedQuery,
          },
        },
      ],
    },
  })

  const orderedQaIds = getOrderedQaIdsFromSearchDocs(searchDocs.docs, safeLimit)
  if (orderedQaIds.length === 0) return []

  const qasResult = await payload.find({
    collection: 'qas',
    draft,
    depth: 0,
    limit: orderedQaIds.length,
    overrideAccess: draft,
    pagination: false,
    where: {
      id: {
        in: orderedQaIds,
      },
    },
  })

  const qasById = new Map<number, Qa>(qasResult.docs.map((qa) => [qa.id, qa]))
  const sectionIds = [...new Set(qasResult.docs.map((qa) => asRelationId(qa.section)).filter(Boolean))]

  const sectionsResult =
    sectionIds.length > 0
      ? await payload.find({
          collection: 'sections',
          draft,
          depth: 0,
          limit: sectionIds.length,
          overrideAccess: draft,
          pagination: false,
          where: {
            id: {
              in: sectionIds,
            },
          },
        })
      : { docs: [] as Section[] }

  const sectionsById = new Map<number, Section>(sectionsResult.docs.map((section) => [section.id, section]))

  const bookIds = [
    ...new Set(sectionsResult.docs.map((section) => asRelationId(section.book)).filter(Boolean)),
  ]

  const booksResult =
    bookIds.length > 0
      ? await payload.find({
          collection: 'books',
          draft,
          depth: 0,
          limit: bookIds.length,
          overrideAccess: draft,
          pagination: false,
          where: {
            id: {
              in: bookIds,
            },
          },
        })
      : { docs: [] as Book[] }

  const booksById = new Map<number, Book>(booksResult.docs.map((book) => [book.id, book]))

  const results: HandbookSearchResult[] = []
  for (const qaId of orderedQaIds) {
    const qa = qasById.get(qaId)
    if (!qa) continue

    const sectionId = asRelationId(qa.section)
    if (!sectionId) continue

    const section = sectionsById.get(sectionId)
    if (!section) continue

    const bookId = asRelationId(section.book)
    if (!bookId) continue

    const book = booksById.get(bookId)
    if (!book) continue

    results.push({
      qaId: qa.id,
      question: pickLocalizedString(language, qa.question_vi, qa.question_en),
      sectionId: section.id,
      sectionTitle: pickLocalizedString(language, section.title_vi, section.title_en),
      sectionSlug: section.slug,
      bookId: book.id,
      bookTitle: pickLocalizedString(language, book.title_vi, book.title_en),
      bookSlug: book.slug,
    })

    if (results.length >= safeLimit) break
  }

  return results
}
