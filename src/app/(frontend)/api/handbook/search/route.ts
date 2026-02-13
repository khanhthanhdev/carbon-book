import { draftMode } from 'next/headers'
import { NextRequest } from 'next/server'

import {
  HANDBOOK_SEARCH_MIN_QUERY_LENGTH,
  clampHandbookSearchLimit,
  searchHandbook,
} from '@/utilities/handbook/queries'
import type { HandbookSearchResult } from '@/utilities/handbook/types'
import type { SupportedLanguage } from '@/utilities/localization'
import { searchHandbookWithHybrid } from '@/utilities/handbook/vector/retrieval'

const isSupportedLanguage = (value: string | null): value is SupportedLanguage => {
  return value === 'vi' || value === 'en'
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() || ''
  const limitParam = Number.parseInt(searchParams.get('limit') || '', 10)
  const limit = clampHandbookSearchLimit(Number.isNaN(limitParam) ? null : limitParam)

  const languageParam = searchParams.get('lang')
  const language: SupportedLanguage = isSupportedLanguage(languageParam) ? languageParam : 'en'

  if (query.length < HANDBOOK_SEARCH_MIN_QUERY_LENGTH) {
    return Response.json({
      results: [],
      total: 0,
    })
  }

  const { isEnabled: draft } = await draftMode()
  let results: HandbookSearchResult[] = []

  if (!draft) {
    try {
      results = await searchHandbookWithHybrid({
        query,
        language,
        limit,
      })
    } catch {
      results = []
    }
  }

  if (results.length === 0) {
    results = await searchHandbook({
      query,
      draft,
      language,
      limit,
    })
  }

  return Response.json({
    results,
    total: results.length,
  })
}
