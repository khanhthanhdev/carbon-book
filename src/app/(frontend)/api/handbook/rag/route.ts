import { NextRequest } from 'next/server'

import { HANDBOOK_SEARCH_MIN_QUERY_LENGTH } from '@/utilities/handbook/queries'
import type { HandbookRagResponse } from '@/utilities/handbook/types'
import type { SupportedLanguage } from '@/utilities/localization'
import { generateHandbookRagResponse } from '@/utilities/handbook/vector/rag'

const DEFAULT_TOP_K = 6
const MAX_TOP_K = 12

const isSupportedLanguage = (value: string | null | undefined): value is SupportedLanguage => {
  return value === 'vi' || value === 'en'
}

const resolveLanguage = ({
  explicitLanguage,
  request,
}: {
  explicitLanguage?: string | null
  request: NextRequest
}): SupportedLanguage => {
  if (isSupportedLanguage(explicitLanguage)) return explicitLanguage

  const header = request.headers.get('accept-language')?.toLowerCase() || ''
  if (header.includes('vi')) return 'vi'
  if (header.includes('en')) return 'en'

  return 'en'
}

const clampTopK = (value: unknown): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_TOP_K
  return Math.min(Math.max(Math.round(value), 1), MAX_TOP_K)
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: {
    query?: string
    lang?: SupportedLanguage
    bookSlug?: string
    sectionId?: number
    topK?: number
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json(
      {
        error: 'Invalid JSON body.',
      },
      { status: 400 },
    )
  }

  const query = body.query?.trim() || ''
  const language = resolveLanguage({
    explicitLanguage: body.lang,
    request,
  })

  if (query.length < HANDBOOK_SEARCH_MIN_QUERY_LENGTH) {
    const empty: HandbookRagResponse = {
      answer:
        language === 'vi'
          ? 'Vui lòng nhập câu hỏi dài hơn để tìm kiếm trong cẩm nang.'
          : 'Please enter a longer query to search the handbook.',
      language,
      citations: [],
      results: [],
      suggestions: [],
    }

    return Response.json(empty)
  }

  const response = await generateHandbookRagResponse({
    query,
    language,
    topK: clampTopK(body.topK),
    bookSlug: body.bookSlug,
    sectionId: typeof body.sectionId === 'number' ? body.sectionId : undefined,
  })

  return Response.json(response)
}
