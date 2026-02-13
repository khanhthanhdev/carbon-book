import { draftMode } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { getDefaultHandbookBookSlug } from '@/utilities/handbook/queries'

export default async function HandbookEntryPage() {
  const { isEnabled: draft } = await draftMode()
  const defaultBookSlug = await getDefaultHandbookBookSlug({ draft })

  if (!defaultBookSlug) {
    notFound()
  }

  redirect(`/handbook/${encodeURIComponent(defaultBookSlug)}`)
}
