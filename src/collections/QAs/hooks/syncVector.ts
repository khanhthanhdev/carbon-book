import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Qa } from '@/payload-types'
import { deleteQaVectorsByID, syncQaVectorByID } from '@/utilities/handbook/vector/ingestion'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export const syncQaVectorAfterChange: CollectionAfterChangeHook<Qa> = async ({ doc, req }) => {
  try {
    await syncQaVectorByID({
      qaId: doc.id,
      req,
    })
  } catch (error) {
    req.payload.logger.warn(
      `Failed to sync QA vector for QA ${String(doc.id)}: ${getErrorMessage(error)}`,
    )
  }

  return doc
}

export const deleteQaVectorAfterDelete: CollectionAfterDeleteHook<Qa> = async ({ doc, req }) => {
  if (!doc?.id) return doc

  try {
    await deleteQaVectorsByID(doc.id)
  } catch (error) {
    req.payload.logger.warn(
      `Failed to delete QA vector for QA ${String(doc.id)}: ${getErrorMessage(error)}`,
    )
  }

  return doc
}
