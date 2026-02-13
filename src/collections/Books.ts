import type { CollectionConfig } from 'payload'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { slugField } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { adminOrPublished } from '@/access/adminOrPublished'
import { generateSeoMeta } from '@/hooks/generateSeoMeta'

export const Books: CollectionConfig = {
  slug: 'books',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: adminOrPublished,
    update: adminOnly,
  },
  admin: {
    defaultColumns: ['title_vi', 'title_en', 'slug', 'updatedAt'],
    useAsTitle: 'title_vi',
  },
  fields: [
    {
      name: 'title_vi',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'title_en',
              type: 'text',
              required: true,
            },
            {
              name: 'summary_vi',
              type: 'textarea',
            },
            {
              name: 'summary_en',
              type: 'textarea',
            },
            slugField({
              fieldToUse: 'title_en',
            }),
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),
            MetaDescriptionField({ hasGenerateFn: true }),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [generateSeoMeta],
  },
  versions: {
    drafts: {
      schedulePublish: true,
    },
  },
}
