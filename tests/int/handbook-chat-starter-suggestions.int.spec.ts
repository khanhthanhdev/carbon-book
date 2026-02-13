import { describe, expect, it } from 'vitest'

import { buildHandbookStarterSuggestions } from '@/utilities/handbook/starterSuggestions'

describe('buildHandbookStarterSuggestions', () => {
  it('returns exactly 3 English suggestions with the current question first', () => {
    const suggestions = buildHandbookStarterSuggestions({
      question: 'How do I calculate Scope 3 emissions?',
      language: 'en',
    })

    expect(suggestions).toHaveLength(3)
    expect(suggestions[0]).toBe('How do I calculate Scope 3 emissions?')
    expect(suggestions[1]).toBe('Can you explain this in simpler terms?')
    expect(suggestions[2]).toBe('What practical steps should I take based on this?')
  })

  it('returns exactly 3 Vietnamese suggestions with the current question first', () => {
    const suggestions = buildHandbookStarterSuggestions({
      question: 'Làm sao để đo phát thải phạm vi 3?',
      language: 'vi',
    })

    expect(suggestions).toHaveLength(3)
    expect(suggestions[0]).toBe('Làm sao để đo phát thải phạm vi 3?')
    expect(suggestions[1]).toBe('Bạn có thể giải thích nội dung này theo cách đơn giản hơn không?')
    expect(suggestions[2]).toBe('Tôi nên bắt đầu áp dụng nội dung này như thế nào trong thực tế?')
  })

  it('returns an empty list when the question is missing or blank', () => {
    expect(
      buildHandbookStarterSuggestions({
        question: '',
        language: 'en',
      }),
    ).toEqual([])

    expect(
      buildHandbookStarterSuggestions({
        question: '   ',
        language: 'vi',
      }),
    ).toEqual([])

    expect(
      buildHandbookStarterSuggestions({
        question: null,
        language: 'en',
      }),
    ).toEqual([])
  })
})
