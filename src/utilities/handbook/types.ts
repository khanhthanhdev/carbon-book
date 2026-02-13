export type HandbookSourceView = {
  label: string
  url: string
}

export type HandbookQaView = {
  id: number
  order: number
  question: string
  answer: unknown | null
  sectionId: number
  sources: HandbookSourceView[]
}

export type HandbookSectionView = {
  id: number
  order: number
  title: string
  qas: HandbookQaView[]
}

export type HandbookBookView = {
  id: number
  slug: string
  title: string
}

export type HandbookSelection = {
  sectionId: number | null
  qaId: number | null
}

export type HandbookPageData = {
  book: HandbookBookView
  sections: HandbookSectionView[]
  selection: HandbookSelection
}

export type HandbookSearchResult = {
  qaId: number
  question: string
  sectionId: number
  sectionTitle: string
  sectionSlug: string
  bookId: number
  bookTitle: string
  bookSlug: string
}

export type HandbookRetrievedChunk = {
  id: string
  score: number
  docType: 'qa' | 'section'
  lang: 'vi' | 'en'
  text: string
  question?: string
  qaId: number | null
  sectionId: number
  sectionSlug: string
  sectionTitle: string
  bookId: number
  bookSlug: string
  bookTitle: string
}

export type HandbookRagResponse = {
  answer: string
  language: 'vi' | 'en'
  citations: HandbookRetrievedChunk[]
  results: HandbookRetrievedChunk[]
  suggestions: string[]
}
