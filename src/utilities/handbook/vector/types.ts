export type HandbookVectorDocumentType = 'qa' | 'section'

export type HandbookVectorLanguage = 'vi' | 'en'

export type HandbookVectorMetadata = {
  docType: HandbookVectorDocumentType
  lang: HandbookVectorLanguage
  docId: number
  qaId?: number
  sectionId: number
  bookId: number
  bookSlug: string
  bookTitle?: string
  sectionSlug: string
  sectionTitle?: string
  published: boolean
  tags: string[]
  keywords: string[]
  updatedAt: string
  question?: string
  title?: string
  recordVersion: string
}

export type HandbookVectorRecord = {
  id: string
  data: string
  metadata: HandbookVectorMetadata
}

export type HandbookVectorSyncStats = {
  booksScanned: number
  sectionsScanned: number
  qasScanned: number
  sectionsUpserted: number
  qasUpserted: number
  vectorsUpserted: number
  skipped: number
  resetPerformed: boolean
}
