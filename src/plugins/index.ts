import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { Plugin } from 'payload'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateDescription, GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

import { Book, Page, Post, Qa, Section } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { generateSeoMetadata } from '@/utilities/ai/seoMetadata'
import { extractLexicalText } from '@/utilities/richText/extractLexicalText'

const localePriority = ['vi', 'en']

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const getLocalizedString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value
  if (!isRecord(value) || 'root' in value) return undefined

  for (const localeCode of localePriority) {
    const localizedValue = value[localeCode]
    if (typeof localizedValue === 'string' && localizedValue.trim()) {
      return localizedValue
    }
  }

  for (const localizedValue of Object.values(value)) {
    if (typeof localizedValue === 'string' && localizedValue.trim()) {
      return localizedValue
    }
  }

  return undefined
}

const getSplitString = (doc: Record<string, unknown>, baseField: string): string | undefined => {
  for (const localeCode of localePriority) {
    const value = doc?.[`${baseField}_${localeCode}`]
    if (typeof value === 'string' && value.trim()) return value
  }

  return undefined
}

const getSplitStrings = (doc: Record<string, unknown>, baseField: string): string[] => {
  return localePriority
    .map((localeCode) => doc?.[`${baseField}_${localeCode}`])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

const getSplitRichText = (doc: Record<string, unknown>, baseField: string): string[] => {
  return localePriority
    .map((localeCode) => extractLexicalText(doc?.[`${baseField}_${localeCode}`]))
    .filter(Boolean)
}

const getLocalizedStrings = (value: unknown): string[] => {
  if (typeof value === 'string' && value.trim()) return [value]
  if (!isRecord(value) || 'root' in value) return []

  const localizedEntries = Object.entries(value).filter(
    ([, localizedValue]) => typeof localizedValue === 'string' && localizedValue.trim(),
  )

  if (localizedEntries.length === 0) return []

  return [...localizedEntries]
    .sort(([a], [b]) => {
      const aIndex = localePriority.indexOf(a)
      const bIndex = localePriority.indexOf(b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
    .map(([, localizedValue]) => localizedValue as string)
}

const getLocalizedRichText = (value: unknown): string[] => {
  if (!value) return []
  if (isRecord(value) && 'root' in value) {
    const text = extractLexicalText(value)
    return text ? [text] : []
  }
  if (!isRecord(value)) return []

  const entries = Object.entries(value)
    .map(([localeCode, localizedValue]) => ({
      localeCode,
      text: extractLexicalText(localizedValue),
    }))
    .filter((entry) => entry.text)

  return entries
    .sort((a, b) => {
      const aIndex = localePriority.indexOf(a.localeCode)
      const bIndex = localePriority.indexOf(b.localeCode)
      if (aIndex === -1 && bIndex === -1) return a.localeCode.localeCompare(b.localeCode)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
    .map((entry) => entry.text)
}

const getDocContent = (doc: Record<string, unknown>): string => {
  const parts: string[] = []
  const title =
    getLocalizedString(doc?.title) ||
    getLocalizedString(doc?.question) ||
    getSplitString(doc, 'title') ||
    getSplitString(doc, 'question')
  if (title) parts.push(`Title: ${title}`)

  for (const summary of [...getSplitStrings(doc, 'summary'), ...getLocalizedStrings(doc?.summary)]) {
    parts.push(`Summary: ${summary}`)
  }

  const content = doc?.content as unknown
  if (content) {
    const text = extractLexicalText(content)
    if (text) parts.push(`Content: ${text.slice(0, 2000)}`)
  }

  for (const question of [...getSplitStrings(doc, 'question'), ...getLocalizedStrings(doc?.question)]) {
    parts.push(`Question: ${question}`)
  }

  for (const answer of [...getSplitRichText(doc, 'answer'), ...getLocalizedRichText(doc?.answer)]) {
    if (answer) {
      parts.push(`Answer: ${answer.slice(0, 1500)}`)
    }
  }

  for (const splitContent of getSplitRichText(doc, 'content')) {
    parts.push(`Content: ${splitContent.slice(0, 2000)}`)
  }

  return parts.join('\n')
}

const generateTitle: GenerateTitle<Post | Page | Book | Section | Qa> = async ({
  doc,
  collectionSlug,
}) => {
  const d = doc as unknown as Record<string, unknown>
  const content = getDocContent(d)
  if (!content) {
    const title =
      getLocalizedString(d?.title) ||
      getLocalizedString(d?.question) ||
      getSplitString(d, 'title') ||
      getSplitString(d, 'question')
    return title ? `${title} | Carbon Book` : 'Carbon Book'
  }

  try {
    const seo = await generateSeoMetadata({ content, collectionSlug: collectionSlug || 'pages' })
    return seo.title
  } catch {
    const title =
      getLocalizedString(d?.title) ||
      getLocalizedString(d?.question) ||
      getSplitString(d, 'title') ||
      getSplitString(d, 'question')
    return title ? `${title} | Carbon Book` : 'Carbon Book'
  }
}

const generateDescription: GenerateDescription<Post | Page | Book | Section | Qa> = async ({
  doc,
  collectionSlug,
}) => {
  const d = doc as unknown as Record<string, unknown>
  const content = getDocContent(d)
  if (!content) return ''

  try {
    const seo = await generateSeoMetadata({ content, collectionSlug: collectionSlug || 'pages' })
    return seo.description
  } catch {
    return getLocalizedString(d?.summary) || getSplitString(d, 'summary') || ''
  }
}

const generateURL: GenerateURL<Post | Page | Book | Section | Qa> = ({
  doc,
  collectionSlug,
}) => {
  const url = getServerSideURL()
  const d = doc as unknown as Record<string, unknown>
  const slug = d?.slug as string | undefined

  if (slug) return `${url}/${collectionSlug}/${slug}`
  return url
}

export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    uploadsCollection: 'media',
    generateTitle,
    generateDescription,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formOverrides: {
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  searchPlugin({
    collections: ['posts', 'books', 'sections', 'qas'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
]
