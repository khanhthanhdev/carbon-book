import type { Metadata } from 'next/types'

import { CollectionArchive } from '@/components/CollectionArchive'
import { PageRange } from '@/components/PageRange'
import { Pagination } from '@/components/Pagination'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'
import PageClient from './page.client'
import { getUserLanguage, pickLocalizedString } from '@/utilities/localization'

type Args = {
  searchParams: Promise<{
    lang?: string
  }>
}

export const revalidate = 600

export default async function Page({ searchParams: searchParamsPromise }: Args) {
  const { lang } = await searchParamsPromise
  const language = await getUserLanguage(lang)
  const payload = await getPayload({ config: configPromise })

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 12,
    overrideAccess: false,
    select: {
      title_vi: true,
      title_en: true,
      slug: true,
      categories: true,
      meta: true,
    },
  })

  const localizedPosts = posts.docs.map((post) => ({
    ...post,
    title: pickLocalizedString(language, post.title_vi, post.title_en),
  }))

  return (
    <div className="pt-24 pb-24">
      <PageClient />
      <div className="container mb-16">
        <div className="prose dark:prose-invert max-w-none">
          <h1>Posts</h1>
        </div>
      </div>

      <div className="container mb-8">
        <PageRange
          collection="posts"
          currentPage={posts.page}
          limit={12}
          totalDocs={posts.totalDocs}
        />
      </div>

      <CollectionArchive posts={localizedPosts} />

      <div className="container">
        {posts.totalPages > 1 && posts.page && (
          <Pagination page={posts.page} totalPages={posts.totalPages} />
        )}
      </div>
    </div>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: `Payload Website Template Posts`,
  }
}
