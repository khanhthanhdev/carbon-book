import type { CollectionConfig, Field } from 'payload'

import { slugField } from 'payload'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

import { adminOnly } from '@/access/adminOnly'
import { adminOrPublished } from '@/access/adminOrPublished'
import { generateSectionMetadata } from './Sections/hooks/generateMetadata'
import { generateSeoMeta } from '@/hooks/generateSeoMeta'
import {
  deleteSectionVectorAfterDelete,
  syncSectionVectorAfterChange,
} from './Sections/hooks/syncVector'

const handbookMetadataFields: Field[] = [
  {
    name: 'tags',
    type: 'array',
    fields: [
      {
        name: 'value',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    name: 'keywords',
    type: 'array',
    fields: [
      {
        name: 'value',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    name: 'ai_notes',
    type: 'textarea',
  },
  {
    name: 'ai_embeddings',
    type: 'json',
    admin: {
      hidden: true,
    },
  },
]

export const Sections: CollectionConfig = {
  slug: 'sections',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: adminOrPublished,
    update: adminOnly,
  },
  admin: {
    defaultColumns: ['title_vi', 'title_en', 'book', 'slug', 'updatedAt'],
    useAsTitle: 'title_vi',
    components: {
      beforeList: ['@/components/HandbookVectorActions/SectionListActions'],
    },
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'title_vi',
              type: 'text',
              required: true,
            },
            {
              name: 'order',
              type: 'number',
              required: true,
              min: 1,
            },
            {
              name: 'title_en',
              type: 'text',
              required: true,
            },
            {
              name: 'book',
              type: 'relationship',
              relationTo: 'books',
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
          label: 'Metadata',
          name: 'metadata',
          fields: handbookMetadataFields,
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
    beforeChange: [generateSectionMetadata, generateSeoMeta],
    afterChange: [syncSectionVectorAfterChange],
    afterDelete: [deleteSectionVectorAfterDelete],
  },
  versions: {
    drafts: {
      schedulePublish: true,
    },
  },
}
