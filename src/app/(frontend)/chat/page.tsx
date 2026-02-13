import type { Metadata } from 'next'

import { ChatPageClient } from './page.client'
import { getUserLanguage } from '@/utilities/localization'

export const metadata: Metadata = {
  title: 'AI Chat — Carbon Book',
  description: 'Ask questions about the Carbon Book handbook with AI-powered answers.',
}

export default async function ChatPage() {
  const language = await getUserLanguage()

  return (
    <div className="container py-6">
      <ChatPageClient language={language} />
    </div>
  )
}
