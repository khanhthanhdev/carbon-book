import { BeforeSync, DocToSync } from '@payloadcms/plugin-search/types'

const localePriority = ['vi', 'en']

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const getLocalizedString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value
  if (!isRecord(value) || 'root' in value) return undefined

  for (const localeCode of localePriority) {
    const localizedValue = value[localeCode]
    if (typeof localizedValue === 'string' && localizedValue.trim()) return localizedValue
  }

  for (const localizedValue of Object.values(value)) {
    if (typeof localizedValue === 'string' && localizedValue.trim()) return localizedValue
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

export const beforeSyncWithSearch: BeforeSync = async ({ req, originalDoc, searchDoc }) => {
  const {
    doc: { relationTo: collection },
  } = searchDoc

  const { slug, id, categories, title, meta } = originalDoc

  const docTitle =
    getLocalizedString(title) ||
    getLocalizedString(originalDoc.question) ||
    getSplitString(originalDoc as Record<string, unknown>, 'title') ||
    getSplitString(originalDoc as Record<string, unknown>, 'question')
  const docSlug = slug || String(id)
  const docDescription =
    meta?.description ||
    getLocalizedString(originalDoc.summary) ||
    getSplitString(originalDoc as Record<string, unknown>, 'summary')

  const modifiedDoc: DocToSync = {
    ...searchDoc,
    title: searchDoc.title || docTitle || '',
    slug: docSlug,
    meta: {
      ...meta,
      title: meta?.title || docTitle,
      image: meta?.image?.id || meta?.image,
      description: docDescription,
    },
    categories: [],
  }

  if (categories && Array.isArray(categories) && categories.length > 0) {
    const populatedCategories: { id: string | number; title: string }[] = []
    for (const category of categories) {
      if (!category) {
        continue
      }

      if (typeof category === 'object') {
        populatedCategories.push(category)
        continue
      }

      const doc = await req.payload.findByID({
        collection: 'categories',
        id: category,
        disableErrors: true,
        depth: 0,
        select: { title: true },
        req,
      })

      if (doc !== null) {
        populatedCategories.push(doc)
      } else {
        console.error(
          `Failed. Category not found when syncing collection '${collection}' with id: '${id}' to search.`,
        )
      }
    }

    modifiedDoc.categories = populatedCategories.map((each) => ({
      relationTo: 'categories',
      categoryID: String(each.id),
      title: each.title,
    }))
  }

  return modifiedDoc
}
