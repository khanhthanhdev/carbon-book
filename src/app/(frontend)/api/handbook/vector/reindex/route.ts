import config from '@payload-config'
import { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { hasAdminRole } from '@/access/roles'
import {
  isHandbookVectorConfigured,
  HANDBOOK_VECTOR_NAMESPACE,
} from '@/utilities/handbook/vector/client'
import { reindexHandbookVectorsFromDatabase } from '@/utilities/handbook/vector/ingestion'

export const maxDuration = 300

const isTruthy = (value: string | null): boolean => {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
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
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCronRequest = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!isCronRequest) {
    const { user } = await payload.auth({ headers: request.headers })

    if (!hasAdminRole(user)) {
      return new Response('Action forbidden.', { status: 403 })
    }
  }

  const { searchParams } = new URL(request.url)
  const reset = isTruthy(searchParams.get('reset'))

  try {
    const stats = await reindexHandbookVectorsFromDatabase({
      payload,
      reset,
    })

    return Response.json({
      success: true,
      namespace: HANDBOOK_VECTOR_NAMESPACE,
      stats,
    })
  } catch (error) {
    payload.logger.error({
      err: error,
      message: 'Failed to reindex handbook vectors',
    })

    return Response.json(
      {
        success: false,
        error: 'Failed to reindex handbook vectors.',
      },
      {
        status: 500,
      },
    )
  }
}
