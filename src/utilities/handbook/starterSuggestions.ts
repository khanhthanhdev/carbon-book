import type { SupportedLanguage } from '@/utilities/localization'

type BuildHandbookStarterSuggestionsArgs = {
  question: string | null | undefined
  language: SupportedLanguage
}

export const buildHandbookStarterSuggestions = ({
  question,
  language,
}: BuildHandbookStarterSuggestionsArgs): string[] => {
  const normalizedQuestion = question?.trim()
  if (!normalizedQuestion) return []

  if (language === 'vi') {
    return [
      normalizedQuestion,
      'Bạn có thể giải thích nội dung này theo cách đơn giản hơn không?',
      'Tôi nên bắt đầu áp dụng nội dung này như thế nào trong thực tế?',
    ]
  }

  return [
    normalizedQuestion,
    'Can you explain this in simpler terms?',
    'What practical steps should I take based on this?',
  ]
}
