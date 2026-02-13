import { describe, expect, it } from 'vitest'

import { resolveHandbookSelection } from '@/utilities/handbook/selection'
import type { HandbookSectionView } from '@/utilities/handbook/types'

const makeSections = (): HandbookSectionView[] => [
  {
    id: 1,
    order: 1,
    title: 'Section 1',
    qas: [
      {
        id: 11,
        order: 1,
        question: 'Question 1',
        answer: null,
        sectionId: 1,
        sources: [],
      },
      {
        id: 12,
        order: 2,
        question: 'Question 2',
        answer: null,
        sectionId: 1,
        sources: [],
      },
    ],
  },
  {
    id: 2,
    order: 2,
    title: 'Section 2',
    qas: [
      {
        id: 21,
        order: 1,
        question: 'Question 3',
        answer: null,
        sectionId: 2,
        sources: [],
      },
    ],
  },
]

describe('resolveHandbookSelection', () => {
  it('selects QA directly when qa ID is valid', () => {
    const selection = resolveHandbookSelection({
      sections: makeSections(),
      selectedQaId: 21,
      selectedSectionId: 1,
    })

    expect(selection).toEqual({
      sectionId: 2,
      qaId: 21,
    })
  })

  it('falls back to first QA of selected section', () => {
    const selection = resolveHandbookSelection({
      sections: makeSections(),
      selectedQaId: 999,
      selectedSectionId: 1,
    })

    expect(selection).toEqual({
      sectionId: 1,
      qaId: 11,
    })
  })

  it('falls back to first section with QAs', () => {
    const selection = resolveHandbookSelection({
      sections: makeSections(),
      selectedQaId: null,
      selectedSectionId: null,
    })

    expect(selection).toEqual({
      sectionId: 1,
      qaId: 11,
    })
  })

  it('returns section with null QA when selected section has no questions', () => {
    const selection = resolveHandbookSelection({
      sections: [
        {
          id: 5,
          order: 1,
          title: 'Empty section',
          qas: [],
        },
      ],
      selectedQaId: null,
      selectedSectionId: 5,
    })

    expect(selection).toEqual({
      sectionId: 5,
      qaId: null,
    })
  })
})
