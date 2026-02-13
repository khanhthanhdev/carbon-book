import type { CollectionBeforeChangeHook } from 'payload'

import { hasAdminRole } from '@/access/roles'
import { extractLexicalText } from '@/utilities/richText/extractLexicalText'
import { generateSeoMetadata } from '@/utilities/ai/seoMetadata'

const resolveString = (value: unknown, fallback?: string | null): string => {
  if (typeof value === 'string') return value
  return fallback ?? ''
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

type LocalizedText = {
  locale?: string
  text: string
}

const getLocalePriority = (locale?: string): string[] => {
  const normalized = typeof locale === 'string' ? locale.toLowerCase() : undefined
  return [normalized, 'vi', 'en'].filter((value): value is string => Boolean(value))
}

const sortByLocalePriority = (
  values: Array<{ locale: string; text: string }>,
  locale?: string,
): Array<{ locale: string; text: string }> => {
  const priority = getLocalePriority(locale)

  return [...values].sort((a, b) => {
    const aIndex = priority.indexOf(a.locale)
    const bIndex = priority.indexOf(b.locale)

    if (aIndex === -1 && bIndex === -1) return a.locale.localeCompare(b.locale)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
}

const getLocalizedStrings = (value: unknown, locale?: string): LocalizedText[] => {
  if (typeof value === 'string') {
    return value ? [{ text: value }] : []
  }

  if (!isRecord(value) || 'root' in value) return []

  const entries: Array<{ locale: string; text: string }> = Object.entries(value)
    .filter(([, localizedValue]) => typeof localizedValue === 'string' && localizedValue.trim().length > 0)
    .map(([localeCode, localizedValue]) => ({
      locale: localeCode,
      text: localizedValue as string,
    }))

  return sortByLocalePriority(entries, locale)
}

const getLocalizedRichText = (value: unknown, locale?: string): LocalizedText[] => {
  if (!value) return []

  if (isRecord(value) && 'root' in value) {
    const text = extractLexicalText(value)
    return text ? [{ text }] : []
  }

  if (!isRecord(value)) return []

  const entries: Array<{ locale: string; text: string }> = []

  for (const [localeCode, localizedValue] of Object.entries(value)) {
    const text = extractLexicalText(localizedValue)
    if (text) {
      entries.push({
        locale: localeCode,
        text,
      })
    }
  }

  return sortByLocalePriority(entries, locale)
}

const withLocale = (label: string, locale?: string): string => {
  if (!locale) return label
  return `${label} (${locale.toUpperCase()})`
}

const getSplitLocaleValues = (
  data: DocData,
  originalDoc: DocData | undefined,
  baseField: string,
): Array<{ locale: string; value: unknown }> => {
  return ['vi', 'en']
    .map((localeCode) => ({
      locale: localeCode,
      value:
        data[`${baseField}_${localeCode}`] !== undefined
          ? data[`${baseField}_${localeCode}`]
          : originalDoc?.[`${baseField}_${localeCode}`],
    }))
    .filter((entry) => entry.value !== undefined && entry.value !== null)
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

type DocData = Record<string, unknown>

const extractDocContent = (
  data: DocData,
  originalDoc: DocData | undefined,
  slug: string,
  locale?: string,
): string => {
  const parts: string[] = []

  switch (slug) {
    case 'posts': {
      for (const titleField of getSplitLocaleValues(data, originalDoc, 'title')) {
        const title = resolveString(titleField.value)
        if (title) parts.push(`${withLocale('Title', titleField.locale)}: ${title}`)
      }

      for (const contentField of getSplitLocaleValues(data, originalDoc, 'content')) {
        const text = extractLexicalText(contentField.value)
        if (text) parts.push(`${withLocale('Content', contentField.locale)}: ${text.slice(0, 2000)}`)
      }

      const legacyTitle = resolveString(data.title, originalDoc?.title as string)
      if (legacyTitle) parts.push(`Title: ${legacyTitle}`)

      const legacyContent = data.content ?? originalDoc?.content
      if (legacyContent) {
        const text = extractLexicalText(legacyContent)
        if (text) parts.push(`Content: ${text.slice(0, 2000)}`)
      }
      break
    }
    case 'pages': {
      const title = resolveString(data.title, originalDoc?.title as string)
      if (title) parts.push(`Title: ${title}`)
      break
    }
    case 'books': {
      for (const titleField of getSplitLocaleValues(data, originalDoc, 'title')) {
        const title = resolveString(titleField.value)
        if (title) parts.push(`${withLocale('Title', titleField.locale)}: ${title}`)
      }

      for (const summaryField of getSplitLocaleValues(data, originalDoc, 'summary')) {
        const summary = resolveString(summaryField.value)
        if (summary) parts.push(`${withLocale('Summary', summaryField.locale)}: ${summary}`)
      }

      const localizedTitle = data.title ?? originalDoc?.title
      const localizedSummary = data.summary ?? originalDoc?.summary
      for (const titleValue of getLocalizedStrings(localizedTitle, locale)) {
        parts.push(`${withLocale('Title', titleValue.locale)}: ${titleValue.text}`)
      }
      for (const summaryValue of getLocalizedStrings(localizedSummary, locale)) {
        parts.push(`${withLocale('Summary', summaryValue.locale)}: ${summaryValue.text}`)
      }
      break
    }
    case 'sections': {
      for (const titleField of getSplitLocaleValues(data, originalDoc, 'title')) {
        const title = resolveString(titleField.value)
        if (title) parts.push(`${withLocale('Title', titleField.locale)}: ${title}`)
      }

      for (const summaryField of getSplitLocaleValues(data, originalDoc, 'summary')) {
        const summary = resolveString(summaryField.value)
        if (summary) parts.push(`${withLocale('Summary', summaryField.locale)}: ${summary}`)
      }

      const localizedTitle = data.title ?? originalDoc?.title
      const localizedSummary = data.summary ?? originalDoc?.summary
      for (const titleValue of getLocalizedStrings(localizedTitle, locale)) {
        parts.push(`${withLocale('Title', titleValue.locale)}: ${titleValue.text}`)
      }
      for (const summaryValue of getLocalizedStrings(localizedSummary, locale)) {
        parts.push(`${withLocale('Summary', summaryValue.locale)}: ${summaryValue.text}`)
      }
      break
    }
    case 'qas': {
      for (const questionField of getSplitLocaleValues(data, originalDoc, 'question')) {
        const question = resolveString(questionField.value)
        if (question) parts.push(`${withLocale('Question', questionField.locale)}: ${question}`)
      }

      for (const answerField of getSplitLocaleValues(data, originalDoc, 'answer')) {
        const text = extractLexicalText(answerField.value)
        if (text) parts.push(`${withLocale('Answer', answerField.locale)}: ${text.slice(0, 1500)}`)
      }

      const localizedQuestion = data.question ?? originalDoc?.question
      const localizedAnswer = data.answer ?? originalDoc?.answer
      for (const questionValue of getLocalizedStrings(localizedQuestion, locale)) {
        parts.push(`${withLocale('Question', questionValue.locale)}: ${questionValue.text}`)
      }
      for (const answerValue of getLocalizedRichText(localizedAnswer, locale)) {
        parts.push(`${withLocale('Answer', answerValue.locale)}: ${answerValue.text.slice(0, 1500)}`)
      }
      break
    }
  }

  return parts.join('\n')
}

const hasMeta = (data: DocData): boolean => {
  const meta = data.meta as DocData | undefined
  if (!meta) return false
  return Boolean(meta.title) && Boolean(meta.description)
}

export const generateSeoMeta: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
  collection,
}) => {
  if (!data) return data
  if (!hasAdminRole(req.user)) return data
  if (hasMeta(data as DocData)) return data

  const slug = collection.slug
  const requestLocale =
    typeof req.locale === 'string' && req.locale !== 'all' ? req.locale : undefined
  const content = extractDocContent(data as DocData, originalDoc as DocData | undefined, slug, requestLocale)
  if (!content) return data

  try {
    const seo = await generateSeoMetadata({
      content,
      collectionSlug: slug,
      locale: requestLocale,
    })

    const existingMeta = ((data as DocData).meta as DocData) ?? {}

    return {
      ...data,
      meta: {
        ...existingMeta,
        title: existingMeta.title || seo.title,
        description: existingMeta.description || seo.description,
      },
    }
  } catch (error) {
    req.payload.logger.warn(
      `Skipping SEO meta generation (${operation}) for ${slug} ${String((originalDoc as DocData)?.id ?? 'new')}: ${getErrorMessage(error)}`,
    )
    return data
  }
}
