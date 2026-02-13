import type { Payload, PayloadRequest, Where } from 'payload'

import type { Book, Qa, Section } from '@/payload-types'

import { getHandbookVectorNamespace, isHandbookVectorConfigured, retryWithBackoff } from './client'
import {
  buildQaRecordIds,
  buildQaVectorRecords,
  buildSectionRecordIds,
  buildSectionVectorRecords,
  getBookIdFromSection,
  getSectionIdFromQa,
} from './mapping'
import type { HandbookVectorRecord, HandbookVectorSyncStats } from './types'

const VECTOR_UPSERT_BATCH_SIZE = 64
const VECTOR_DELETE_BATCH_SIZE = 64
const FETCH_PAGE_SIZE = 100

type Context = {
  payload?: Payload
  req?: PayloadRequest
}

type SupportedCollection = 'books' | 'sections' | 'qas'

const resolvePayload = ({ payload, req }: Context): Payload => {
  if (req) return req.payload
  if (payload) return payload

  throw new Error('Missing Payload instance')
}

const runFindByID = async <T>({
  collection,
  id,
  payload,
  req,
  draft,
}: {
  collection: SupportedCollection
  id: number
  payload: Payload
  req?: PayloadRequest
  draft: boolean
}): Promise<T | null> => {
  if (req) {
    return (await payload.findByID({
      collection,
      id,
      depth: 0,
      disableErrors: true,
      draft,
      overrideAccess: false,
      req,
    })) as T | null
  }

  return (await payload.findByID({
    collection,
    id,
    depth: 0,
    disableErrors: true,
    draft,
  })) as T | null
}

const runFindPage = async <T>({
  collection,
  page,
  limit,
  where,
  payload,
  req,
}: {
  collection: SupportedCollection
  page: number
  limit: number
  where?: Where
  payload: Payload
  req?: PayloadRequest
}): Promise<{
  docs: T[]
  hasNextPage: boolean
}> => {
  if (req) {
    const result = await payload.find({
      collection,
      depth: 0,
      draft: false,
      limit,
      overrideAccess: false,
      page,
      pagination: true,
      req,
      where,
    })

    return {
      docs: result.docs as T[],
      hasNextPage: result.hasNextPage,
    }
  }

  const result = await payload.find({
    collection,
    depth: 0,
    draft: false,
    limit,
    page,
    pagination: true,
    where,
  })

  return {
    docs: result.docs as T[],
    hasNextPage: result.hasNextPage,
  }
}

const getPublishedById = async <T>({
  collection,
  id,
  payload,
  req,
}: {
  collection: SupportedCollection
  id: number
  payload: Payload
  req?: PayloadRequest
}): Promise<T | null> => {
  return runFindByID<T>({
    collection,
    id,
    payload,
    req,
    draft: false,
  })
}

const getPublishedWhere = (andConditions: Where[] = []): Where => {
  return {
    and: [{ _status: { equals: 'published' } }, ...andConditions],
  }
}

const collectPublishedDocs = async <T>({
  collection,
  payload,
  req,
  where,
}: {
  collection: SupportedCollection
  payload: Payload
  req?: PayloadRequest
  where?: Where
}): Promise<T[]> => {
  const docs: T[] = []
  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const pageResult = await runFindPage<T>({
      collection,
      page,
      limit: FETCH_PAGE_SIZE,
      where,
      payload,
      req,
    })

    docs.push(...pageResult.docs)
    hasNextPage = pageResult.hasNextPage
    page += 1
  }

  return docs
}

const upsertVectorRecords = async (records: HandbookVectorRecord[]): Promise<number> => {
  if (records.length === 0) return 0

  const namespace = getHandbookVectorNamespace()
  let total = 0

  for (let index = 0; index < records.length; index += VECTOR_UPSERT_BATCH_SIZE) {
    const batch = records.slice(index, index + VECTOR_UPSERT_BATCH_SIZE)
    await retryWithBackoff(
      () => namespace.upsert(batch),
      `upsert vector batch (${batch.length} records)`,
    )
    total += batch.length
  }

  return total
}

const deleteVectorRecordsByIds = async (ids: string[]): Promise<number> => {
  if (ids.length === 0) return 0

  const namespace = getHandbookVectorNamespace()
  let total = 0

  for (let index = 0; index < ids.length; index += VECTOR_DELETE_BATCH_SIZE) {
    const batch = ids.slice(index, index + VECTOR_DELETE_BATCH_SIZE)
    const { deleted } = await retryWithBackoff(
      () => namespace.delete(batch),
      `delete vector batch (${batch.length} records)`,
    )
    total += deleted
  }

  return total
}

const getPublishedQasBySectionId = async ({
  sectionId,
  payload,
  req,
}: {
  sectionId: number
  payload: Payload
  req?: PayloadRequest
}): Promise<Qa[]> => {
  return collectPublishedDocs<Qa>({
    collection: 'qas',
    payload,
    req,
    where: getPublishedWhere([{ section: { equals: sectionId } }]),
  })
}

const deleteQaVectorsBySectionId = async ({
  sectionId,
  payload,
  req,
}: {
  sectionId: number
  payload: Payload
  req?: PayloadRequest
}): Promise<number> => {
  const qas = await getPublishedQasBySectionId({ sectionId, payload, req })
  const qaVectorIds = qas.flatMap((qa) => buildQaRecordIds(qa.id))
  return deleteVectorRecordsByIds(qaVectorIds)
}

export const syncQaVectorByID = async ({
  qaId,
  payload,
  req,
}: {
  qaId: number
  payload?: Payload
  req?: PayloadRequest
}): Promise<number> => {
  if (!isHandbookVectorConfigured()) return 0

  const resolvedPayload = resolvePayload({ payload, req })

  const qa = await getPublishedById<Qa>({
    collection: 'qas',
    id: qaId,
    payload: resolvedPayload,
    req,
  })

  if (!qa) {
    await deleteVectorRecordsByIds(buildQaRecordIds(qaId))
    return 0
  }

  const sectionId = getSectionIdFromQa(qa)
  if (!sectionId) {
    await deleteVectorRecordsByIds(buildQaRecordIds(qa.id))
    return 0
  }

  const section = await getPublishedById<Section>({
    collection: 'sections',
    id: sectionId,
    payload: resolvedPayload,
    req,
  })

  if (!section) {
    await deleteVectorRecordsByIds(buildQaRecordIds(qa.id))
    return 0
  }

  const bookId = getBookIdFromSection(section)
  if (!bookId) {
    await deleteVectorRecordsByIds(buildQaRecordIds(qa.id))
    return 0
  }

  const book = await getPublishedById<Book>({
    collection: 'books',
    id: bookId,
    payload: resolvedPayload,
    req,
  })

  if (!book) {
    await deleteVectorRecordsByIds(buildQaRecordIds(qa.id))
    return 0
  }

  return upsertVectorRecords(
    buildQaVectorRecords({
      qa,
      section,
      book,
    }),
  )
}

export const deleteQaVectorsByID = async (qaId: number): Promise<number> => {
  if (!isHandbookVectorConfigured()) return 0
  return deleteVectorRecordsByIds(buildQaRecordIds(qaId))
}

export const syncSectionAndQasBySectionID = async ({
  sectionId,
  payload,
  req,
}: {
  sectionId: number
  payload?: Payload
  req?: PayloadRequest
}): Promise<number> => {
  if (!isHandbookVectorConfigured()) return 0

  const resolvedPayload = resolvePayload({ payload, req })

  const section = await getPublishedById<Section>({
    collection: 'sections',
    id: sectionId,
    payload: resolvedPayload,
    req,
  })

  if (!section) {
    await deleteVectorRecordsByIds(buildSectionRecordIds(sectionId))
    await deleteQaVectorsBySectionId({
      sectionId,
      payload: resolvedPayload,
      req,
    })
    return 0
  }

  const bookId = getBookIdFromSection(section)
  if (!bookId) {
    await deleteVectorRecordsByIds(buildSectionRecordIds(section.id))
    await deleteQaVectorsBySectionId({
      sectionId: section.id,
      payload: resolvedPayload,
      req,
    })
    return 0
  }

  const book = await getPublishedById<Book>({
    collection: 'books',
    id: bookId,
    payload: resolvedPayload,
    req,
  })

  if (!book) {
    await deleteVectorRecordsByIds(buildSectionRecordIds(section.id))
    await deleteQaVectorsBySectionId({
      sectionId: section.id,
      payload: resolvedPayload,
      req,
    })
    return 0
  }

  let upserted = await upsertVectorRecords(
    buildSectionVectorRecords({
      section,
      book,
    }),
  )

  const qas = await getPublishedQasBySectionId({
    sectionId: section.id,
    payload: resolvedPayload,
    req,
  })

  const qaRecords = qas.flatMap((qa) =>
    buildQaVectorRecords({
      qa,
      section,
      book,
    }),
  )

  upserted += await upsertVectorRecords(qaRecords)
  return upserted
}

export const deleteSectionAndQaVectorsBySectionID = async ({
  sectionId,
  payload,
  req,
}: {
  sectionId: number
  payload?: Payload
  req?: PayloadRequest
}): Promise<number> => {
  if (!isHandbookVectorConfigured()) return 0

  const resolvedPayload = resolvePayload({ payload, req })

  const sectionDeleted = await deleteVectorRecordsByIds(buildSectionRecordIds(sectionId))
  const qaDeleted = await deleteQaVectorsBySectionId({
    sectionId,
    payload: resolvedPayload,
    req,
  })

  return sectionDeleted + qaDeleted
}

export const reindexHandbookVectorsFromDatabase = async ({
  payload,
  reset,
}: {
  payload: Payload
  reset?: boolean
}): Promise<HandbookVectorSyncStats> => {
  if (!isHandbookVectorConfigured()) {
    throw new Error('Upstash vector environment is not configured')
  }

  const stats: HandbookVectorSyncStats = {
    booksScanned: 0,
    sectionsScanned: 0,
    qasScanned: 0,
    sectionsUpserted: 0,
    qasUpserted: 0,
    vectorsUpserted: 0,
    skipped: 0,
    resetPerformed: false,
  }

  const namespace = getHandbookVectorNamespace()

  if (reset) {
    await retryWithBackoff(
      () => namespace.reset(),
      'reset vector namespace',
    )
    stats.resetPerformed = true
  }

  const books = await collectPublishedDocs<Book>({
    collection: 'books',
    payload,
    where: getPublishedWhere(),
  })

  stats.booksScanned = books.length

  const booksById = new Map<number, Book>()
  for (const book of books) {
    booksById.set(book.id, book)
  }

  const sections = await collectPublishedDocs<Section>({
    collection: 'sections',
    payload,
    where: getPublishedWhere(),
  })

  stats.sectionsScanned = sections.length

  const sectionsById = new Map<number, Section>()
  const sectionRecords: HandbookVectorRecord[] = []

  for (const section of sections) {
    const bookId = getBookIdFromSection(section)
    if (!bookId) {
      stats.skipped += 1
      continue
    }

    const book = booksById.get(bookId)
    if (!book) {
      stats.skipped += 1
      continue
    }

    sectionsById.set(section.id, section)
    sectionRecords.push(...buildSectionVectorRecords({ section, book }))
    stats.sectionsUpserted += 1
  }

  stats.vectorsUpserted += await upsertVectorRecords(sectionRecords)

  const qas = await collectPublishedDocs<Qa>({
    collection: 'qas',
    payload,
    where: getPublishedWhere(),
  })

  stats.qasScanned = qas.length

  const qaRecords: HandbookVectorRecord[] = []

  for (const qa of qas) {
    const sectionId = getSectionIdFromQa(qa)
    if (!sectionId) {
      stats.skipped += 1
      continue
    }

    const section = sectionsById.get(sectionId)
    if (!section) {
      stats.skipped += 1
      continue
    }

    const bookId = getBookIdFromSection(section)
    if (!bookId) {
      stats.skipped += 1
      continue
    }

    const book = booksById.get(bookId)
    if (!book) {
      stats.skipped += 1
      continue
    }

    qaRecords.push(
      ...buildQaVectorRecords({
        qa,
        section,
        book,
      }),
    )

    stats.qasUpserted += 1
  }

  stats.vectorsUpserted += await upsertVectorRecords(qaRecords)

  return stats
}
