'use client'

import React, { createContext, use, useMemo, useState } from 'react'

export type HandbookCurrentQaContext = {
  bookSlug: string
  sectionId: number | null
  qaId: number | null
  question: string | null
  sectionTitle: string | null
}

type HandbookReadingContextValue = {
  currentQa: HandbookCurrentQaContext | null
  setCurrentQa: (value: HandbookCurrentQaContext | null) => void
}

const initialContext: HandbookReadingContextValue = {
  currentQa: null,
  setCurrentQa: () => null,
}

const HandbookReadingContext = createContext<HandbookReadingContextValue>(initialContext)

export const HandbookReadingProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentQa, setCurrentQa] = useState<HandbookCurrentQaContext | null>(null)

  const value = useMemo(
    (): HandbookReadingContextValue => ({
      currentQa,
      setCurrentQa,
    }),
    [currentQa],
  )

  return <HandbookReadingContext value={value}>{children}</HandbookReadingContext>
}

export const useHandbookReading = (): HandbookReadingContextValue => use(HandbookReadingContext)
