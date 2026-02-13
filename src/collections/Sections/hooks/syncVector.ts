import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Section } from '@/payload-types'
import {
  deleteSectionAndQaVectorsBySectionID,
  syncSectionAndQasBySectionID,
} from '@/utilities/handbook/vector/ingestion'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export const syncSectionVectorAfterChange: CollectionAfterChangeHook<Section> = async ({ doc, req }) => {
  try {
    await syncSectionAndQasBySectionID({
      sectionId: doc.id,
      req,
    })
  } catch (error) {
    req.payload.logger.warn(
      `Failed to sync section vectors for section ${String(doc.id)}: ${getErrorMessage(error)}`,
    )
  }

  return doc
}

export const deleteSectionVectorAfterDelete: CollectionAfterDeleteHook<Section> = async ({
  doc,
  req,
}) => {
  if (!doc?.id) return doc

  try {
    await deleteSectionAndQaVectorsBySectionID({
      sectionId: doc.id,
      req,
    })
  } catch (error) {
    req.payload.logger.warn(
      `Failed to delete section vectors for section ${String(doc.id)}: ${getErrorMessage(error)}`,
    )
  }

  return doc
}
