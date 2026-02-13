import type { CollectionConfig, Field } from 'payload'

import {
  BlocksFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

import { MediaBlock } from '@/blocks/MediaBlock/config'
import { adminOnly } from '@/access/adminOnly'
import { adminOrPublished } from '@/access/adminOrPublished'
import { generateQaMetadata } from './QAs/hooks/generateMetadata'
import { generateSeoMeta } from '@/hooks/generateSeoMeta'
import { deleteQaVectorAfterDelete, syncQaVectorAfterChange } from './QAs/hooks/syncVector'

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

const answerEditor = lexicalEditor({
  features: ({ rootFeatures }) => {
    return [
      ...rootFeatures,
      BlocksFeature({
        blocks: [MediaBlock],
      }),
      EXPERIMENTAL_TableFeature(),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
    ]
  },
})

export const QAs: CollectionConfig = {
  slug: 'qas',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: adminOrPublished,
    update: adminOnly,
  },
  admin: {
    defaultColumns: ['question_vi', 'question_en', 'section', 'updatedAt'],
    useAsTitle: 'question_vi',
    components: {
      beforeList: ['@/components/HandbookVectorActions/QAListActions'],
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
              name: 'question_vi',
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
              name: 'question_en',
              type: 'text',
              required: true,
            },
            {
              name: 'answer_vi',
              type: 'richText',
              editor: answerEditor,
              required: true,
            },
            {
              name: 'answer_en',
              type: 'richText',
              editor: answerEditor,
              required: true,
            },
            {
              name: 'section',
              type: 'relationship',
              relationTo: 'sections',
              required: true,
            },
          ],
        },
        {
          label: 'Sources',
          fields: [
            {
              name: 'sources',
              type: 'array',
              fields: [
                {
                  name: 'label',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'url',
                  type: 'text',
                  required: true,
                  validate: (value: string | null | undefined) => {
                    if (!value) return 'URL is required'

                    try {
                      new URL(value)
                      return true
                    } catch {
                      return 'Please enter a valid URL'
                    }
                  },
                },
                {
                  name: 'notes_vi',
                  type: 'textarea',
                },
                {
                  name: 'notes_en',
                  type: 'textarea',
                },
              ],
            },
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
    beforeChange: [generateQaMetadata, generateSeoMeta],
    afterChange: [syncQaVectorAfterChange],
    afterDelete: [deleteQaVectorAfterDelete],
  },
  versions: {
    drafts: {
      schedulePublish: true,
    },
  },
}
