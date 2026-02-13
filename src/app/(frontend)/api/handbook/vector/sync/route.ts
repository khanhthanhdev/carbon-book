import config from '@payload-config'
import { NextRequest } from 'next/server'
import { getPayload, type Where } from 'payload'

import { hasAdminRole } from '@/access/roles'
import { isHandbookVectorConfigured } from '@/utilities/handbook/vector/client'
import { syncQaVectorByID, syncSectionAndQasBySectionID } from '@/utilities/handbook/vector/ingestion'

type SyncCollection = 'qas' | 'sections'

type SyncBody = {
  collection?: SyncCollection
  ids?: number[]
  selectAllMatchingFilters?: boolean
  where?: Where
}

const isValidCollection = (value: unknown): value is SyncCollection => {
  return value === 'qas' || value === 'sections'
}

const sanitizeIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []

  const seen = new Set<number>()
  const ids: number[] = []

  for (const item of value) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item <= 0) continue
    if (seen.has(item)) continue

    seen.add(item)
    ids.push(item)
  }

  return ids
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isHandbookVectorConfigured()) {
    return Response.json(
      {
        error: 'Upstash vector is not configured.',
      },
      { status: 503 },
    )
  }

  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })

  if (!hasAdminRole(user)) {
    return new Response('Action forbidden.', { status: 403 })
  }

  let body: SyncBody

  try {
    body = (await request.json()) as SyncBody
  } catch {
    return Response.json(
      {
        error: 'Invalid JSON body.',
      },
      { status: 400 },
    )
  }

  if (!isValidCollection(body.collection)) {
    return Response.json(
      {
        error: 'collection must be either "qas" or "sections".',
      },
      { status: 400 },
    )
  }

  const directIds = sanitizeIds(body.ids)
  const shouldSelectAllMatchingFilters = body.selectAllMatchingFilters === true
  const ids = [...directIds]

  if (shouldSelectAllMatchingFilters) {
    let page = 1
    let hasNextPage = true
    const seen = new Set<number>(ids)

    while (hasNextPage) {
      const docs = await payload.find({
        collection: body.collection,
        depth: 0,
        draft: true,
        limit: 100,
        page,
        pagination: true,
        where: body.where,
      })

      for (const doc of docs.docs) {
        const id = Number(doc.id)
        if (!Number.isInteger(id) || id <= 0) continue
        if (seen.has(id)) continue

        seen.add(id)
        ids.push(id)
      }

      hasNextPage = docs.hasNextPage
      page += 1
    }
  }

  if (ids.length === 0) {
    return Response.json(
      {
        error: 'ids must contain at least one positive integer.',
      },
      { status: 400 },
    )
  }

  const results: {
    id: number
    success: boolean
    vectorsUpserted: number
    error?: string
  }[] = []

  for (const id of ids) {
    try {
      const vectorsUpserted =
        body.collection === 'qas'
          ? await syncQaVectorByID({ qaId: id, payload })
          : await syncSectionAndQasBySectionID({ sectionId: id, payload })

      results.push({
        id,
        success: true,
        vectorsUpserted,
      })
    } catch (error) {
      results.push({
        id,
        success: false,
        vectorsUpserted: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const successCount = results.filter((result) => result.success).length
  const failureCount = results.length - successCount
  const vectorsUpserted = results.reduce((sum, item) => sum + item.vectorsUpserted, 0)

  return Response.json({
    success: failureCount === 0,
    collection: body.collection,
    selectAllMatchingFilters: shouldSelectAllMatchingFilters,
    ids,
    successCount,
    failureCount,
    vectorsUpserted,
    results,
  })
}
