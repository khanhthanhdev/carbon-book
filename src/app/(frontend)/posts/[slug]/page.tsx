import type { Metadata } from 'next'

import { RelatedPosts } from '@/blocks/RelatedPosts/Component'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import React, { cache } from 'react'
import RichText from '@/components/RichText'

import type { Post } from '@/payload-types'

import { PostHero } from '@/heros/PostHero'
import { generateMeta } from '@/utilities/generateMeta'
import PageClient from './page.client'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import {
  getUserLanguage,
  pickLocalizedRichText,
  pickLocalizedString,
  type SupportedLanguage,
} from '@/utilities/localization'

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const posts = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: {
      slug: true,
    },
  })

  const params = posts.docs.map(({ slug }) => {
    return { slug }
  })

  return params
}

type Args = {
  params: Promise<{
    slug?: string
  }>
  searchParams: Promise<{
    lang?: string
  }>
}

type LocalizedPost = Post & {
  title: string
  content: Post['content_vi'] | Post['content_en'] | null
}

export default async function Post({ params: paramsPromise, searchParams: searchParamsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = '' } = await paramsPromise
  const { lang } = await searchParamsPromise
  const language = await getUserLanguage(lang)
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const url = '/posts/' + decodedSlug
  const post = await queryPostBySlug({ slug: decodedSlug, language })

  if (!post) return <PayloadRedirects url={url} />

  return (
    <article className="pt-16 pb-16">
      <PageClient />

      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <PostHero post={post} />

      <div className="flex flex-col items-center gap-4 pt-8">
        <div className="container">
          {post.content && (
            <RichText
              className="max-w-[48rem] mx-auto"
              data={post.content}
              enableGutter={false}
              lang={language}
            />
          )}
          {post.relatedPosts && post.relatedPosts.length > 0 && (
            <RelatedPosts
              className="mt-12 max-w-[52rem] lg:grid lg:grid-cols-subgrid col-start-1 col-span-3 grid-rows-[2fr]"
              docs={post.relatedPosts
                .filter((post) => typeof post === 'object')
                .map((relatedPost) => ({
                  ...relatedPost,
                  title: pickLocalizedString(
                    language,
                    relatedPost.title_vi,
                    relatedPost.title_en,
                  ),
                }))}
            />
          )}
        </div>
      </div>
    </article>
  )
}

export async function generateMetadata({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: Args): Promise<Metadata> {
  const { slug = '' } = await paramsPromise
  const { lang } = await searchParamsPromise
  const language = await getUserLanguage(lang)
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const post = await queryPostBySlug({ slug: decodedSlug, language })

  return generateMeta({ doc: post })
}

const queryPostBySlug = cache(
  async ({ slug, language }: { slug: string; language: SupportedLanguage }): Promise<LocalizedPost | null> => {
    const { isEnabled: draft } = await draftMode()

    const payload = await getPayload({ config: configPromise })

    const result = await payload.find({
      collection: 'posts',
      draft,
      limit: 1,
      overrideAccess: draft,
      pagination: false,
      select: {
        title_vi: true,
        title_en: true,
        content_vi: true,
        content_en: true,
        slug: true,
        categories: true,
        heroImage: true,
        populatedAuthors: true,
        publishedAt: true,
        relatedPosts: true,
        meta: true,
      },
      where: {
        slug: {
          equals: slug,
        },
      },
    })

    const doc = result.docs?.[0]
    if (!doc) return null

    return {
      ...doc,
      title: pickLocalizedString(language, doc.title_vi, doc.title_en),
      content: pickLocalizedRichText(language, doc.content_vi, doc.content_en),
    } as LocalizedPost
  },
)
