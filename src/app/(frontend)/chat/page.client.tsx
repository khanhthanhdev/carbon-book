'use client'

import { ChatAssistant } from '@/components/chat/ChatAssistant'
import type { SupportedLanguage } from '@/utilities/localization'

type Props = {
  language: SupportedLanguage
}

export function ChatPageClient({ language }: Props) {
  return <ChatAssistant language={language} variant="page" />
}
