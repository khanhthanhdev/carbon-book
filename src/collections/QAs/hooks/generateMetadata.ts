import type { CollectionBeforeChangeHook } from 'payload'

import { hasAdminRole } from '@/access/roles'
import type { Qa } from '@/payload-types'
import {
  generateHandbookMetadata,
  toMetadataRows,
} from '@/utilities/ai/handbookMetadata'
import { extractLexicalText } from '@/utilities/richText/extractLexicalText'

const resolveString = (value: unknown, fallback: string | null | undefined): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const localized = value as Record<string, unknown>
    for (const localeCode of ['vi', 'en']) {
      const candidate = localized[localeCode]
      if (typeof candidate === 'string') return candidate
    }

    for (const candidate of Object.values(localized)) {
      if (typeof candidate === 'string') return candidate
    }
  }

  return fallback ?? ''
}

const stableStringify = (value: unknown): string => {
  if (value === undefined || value === null) return ''

  return JSON.stringify(value)
}

const extractAnswerText = (value: unknown): string => {
  if (!value || typeof value !== 'object') {
    return extractLexicalText(value)
  }

  if ('root' in value) {
    return extractLexicalText(value)
  }

  const localized = value as Record<string, unknown>

  for (const localeCode of ['vi', 'en']) {
    const candidate = localized[localeCode]
    const text = extractLexicalText(candidate)
    if (text) return text
  }

  for (const candidate of Object.values(localized)) {
    const text = extractLexicalText(candidate)
    if (text) return text
  }

  return ''
}

const getNextQaContent = (data: Partial<Qa>, originalDoc?: Qa) => {
  return {
    question_vi: resolveString(data.question_vi, originalDoc?.question_vi),
    question_en: resolveString(data.question_en, originalDoc?.question_en),
    answer_vi: data.answer_vi ?? originalDoc?.answer_vi,
    answer_en: data.answer_en ?? originalDoc?.answer_en,
  }
}

const hasQaContentChanged = (
  nextContent: ReturnType<typeof getNextQaContent>,
  originalDoc?: Qa,
): boolean => {
  if (!originalDoc) return true

  return (
    nextContent.question_vi !== (originalDoc.question_vi ?? '') ||
    nextContent.question_en !== (originalDoc.question_en ?? '') ||
    stableStringify(nextContent.answer_vi) !== stableStringify(originalDoc.answer_vi) ||
    stableStringify(nextContent.answer_en) !== stableStringify(originalDoc.answer_en)
  )
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message

  return 'Unknown error'
}

export const generateQaMetadata: CollectionBeforeChangeHook<Qa> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data
  if (!hasAdminRole(req.user)) return data

  const nextData = data as Partial<Qa>
  const existingDoc = originalDoc as Qa | undefined
  const nextContent = getNextQaContent(nextData, existingDoc)

  if (operation === 'update' && !hasQaContentChanged(nextContent, existingDoc)) {
    return data
  }

  const answerViText = extractAnswerText(nextContent.answer_vi)
  const answerEnText = extractAnswerText(nextContent.answer_en)

  const content = [
    nextContent.question_vi ? `Question (VI): ${nextContent.question_vi}` : '',
    nextContent.question_en ? `Question (EN): ${nextContent.question_en}` : '',
    answerViText ? `Answer (VI): ${answerViText}` : '',
    answerEnText ? `Answer (EN): ${answerEnText}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  if (!content) return data

  try {
    const generatedMetadata = await generateHandbookMetadata({
      content,
      documentType: 'qa',
    })

    return {
      ...nextData,
      metadata: {
        ...(existingDoc?.metadata ?? {}),
        ...(nextData.metadata ?? {}),
        tags: toMetadataRows(generatedMetadata.tags),
        keywords: toMetadataRows(generatedMetadata.keywords),
      },
    }
  } catch (error) {
    req.payload.logger.warn(
      `Skipping QA metadata generation (${operation}) for QA ${String(existingDoc?.id ?? 'new')}: ${getErrorMessage(error)}`,
    )

    return data
  }
}
