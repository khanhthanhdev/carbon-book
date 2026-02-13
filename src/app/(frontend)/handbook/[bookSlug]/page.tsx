import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'

import { getHandbookPageData } from '@/utilities/handbook/queries'
import { getUserLanguage } from '@/utilities/localization'
import HandbookPageClient from './page.client'

const parsePositiveInteger = (value: string | string[] | undefined): number | null => {
  const normalizedValue = Array.isArray(value) ? value[0] : value
  if (!normalizedValue) return null

  const parsedValue = Number.parseInt(normalizedValue, 10)
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) return null

  return parsedValue
}

type Args = {
  params: Promise<{
    bookSlug: string
  }>
  searchParams: Promise<{
    qa?: string | string[]
    section?: string | string[]
  }>
}

export default async function HandbookBookPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: Args) {
  const { isEnabled: draft } = await draftMode()
  const language = await getUserLanguage()
  const { bookSlug } = await paramsPromise
  const searchParams = await searchParamsPromise

  const decodedBookSlug = decodeURIComponent(bookSlug)

  const data = await getHandbookPageData({
    bookSlug: decodedBookSlug,
    draft,
    language,
    selectedQaId: parsePositiveInteger(searchParams.qa),
    selectedSectionId: parsePositiveInteger(searchParams.section),
  })

  if (!data) {
    notFound()
  }

  return (
    <div className="w-full px-2 py-4 sm:px-4 lg:px-6 lg:py-5 xl:px-8">
      <HandbookPageClient initialData={data} language={language} />
    </div>
  )
}
