import type { CollectionBeforeChangeHook } from 'payload'

import { hasAdminRole } from '@/access/roles'
import type { Section } from '@/payload-types'
import {
  generateHandbookMetadata,
  toMetadataRows,
} from '@/utilities/ai/handbookMetadata'

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

const getNextSectionContent = (data: Partial<Section>, originalDoc?: Section) => {
  return {
    title_vi: resolveString(data.title_vi, originalDoc?.title_vi),
    title_en: resolveString(data.title_en, originalDoc?.title_en),
    summary_vi: resolveString(data.summary_vi, originalDoc?.summary_vi),
    summary_en: resolveString(data.summary_en, originalDoc?.summary_en),
  }
}

const hasSectionContentChanged = (
  nextContent: ReturnType<typeof getNextSectionContent>,
  originalDoc?: Section,
): boolean => {
  if (!originalDoc) return true

  return (
    nextContent.title_vi !== (originalDoc.title_vi ?? '') ||
    nextContent.title_en !== (originalDoc.title_en ?? '') ||
    nextContent.summary_vi !== (originalDoc.summary_vi ?? '') ||
    nextContent.summary_en !== (originalDoc.summary_en ?? '')
  )
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message

  return 'Unknown error'
}

export const generateSectionMetadata: CollectionBeforeChangeHook<Section> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data
  if (!hasAdminRole(req.user)) return data

  const nextData = data as Partial<Section>
  const existingDoc = originalDoc as Section | undefined
  const nextContent = getNextSectionContent(nextData, existingDoc)

  if (operation === 'update' && !hasSectionContentChanged(nextContent, existingDoc)) {
    return data
  }

  const content = [
    nextContent.title_vi ? `Title (VI): ${nextContent.title_vi}` : '',
    nextContent.title_en ? `Title (EN): ${nextContent.title_en}` : '',
    nextContent.summary_vi ? `Summary (VI): ${nextContent.summary_vi}` : '',
    nextContent.summary_en ? `Summary (EN): ${nextContent.summary_en}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  if (!content) return data

  try {
    const generatedMetadata = await generateHandbookMetadata({
      content,
      documentType: 'section',
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
      `Skipping section metadata generation (${operation}) for section ${String(existingDoc?.id ?? 'new')}: ${getErrorMessage(error)}`,
    )

    return data
  }
}
