'use client'

import { toast, useListQuery, useSelection } from '@payloadcms/ui'
import React, { useMemo, useState } from 'react'

type Props = {
  collection: 'qas' | 'sections'
  label: string
}

const parseIds = (raw: string): number[] => {
  const unique = new Set<number>()

  for (const token of raw.split(',')) {
    const trimmed = token.trim()
    if (!trimmed) continue

    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isInteger(parsed) || parsed <= 0) continue

    unique.add(parsed)
  }

  return [...unique]
}

export const CollectionVectorActions: React.FC<Props> = ({ collection, label }) => {
  const { query } = useListQuery()
  const { selectedIDs, selectAll } = useSelection()

  const [idsInput, setIdsInput] = useState('')
  const [isReindexing, setIsReindexing] = useState(false)
  const [isSyncingIds, setIsSyncingIds] = useState(false)
  const [isSyncingSelected, setIsSyncingSelected] = useState(false)

  const parsedIds = useMemo(() => parseIds(idsInput), [idsInput])
  const selectedRowIds = useMemo(
    () =>
      selectedIDs
        .map((value: number | string) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value > 0),
    [selectedIDs],
  )
  const isAllMatchingSelected = selectAll === 'allAvailable'

  const onReindex = async () => {
    if (isReindexing) return

    setIsReindexing(true)

    try {
      const response = await fetch('/api/handbook/vector/reindex?reset=true', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        toast.error('Failed to reindex handbook vectors.')
        return
      }

      const payload = (await response.json()) as {
        stats?: {
          vectorsUpserted?: number
        }
      }

      const vectors = payload.stats?.vectorsUpserted ?? 0
      toast.success(`Reindex done. Upserted ${vectors} vectors.`)
    } catch {
      toast.error('Failed to reindex handbook vectors.')
    } finally {
      setIsReindexing(false)
    }
  }

  const onSyncIds = async () => {
    if (isSyncingIds) return

    if (parsedIds.length === 0) {
      toast.error('Please enter valid IDs (comma separated).')
      return
    }

    setIsSyncingIds(true)

    try {
      const response = await fetch('/api/handbook/vector/sync', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collection,
          ids: parsedIds,
        }),
      })

      if (!response.ok) {
        toast.error(`Failed to sync selected ${label.toLowerCase()}.`)
        return
      }

      const payload = (await response.json()) as {
        successCount?: number
        failureCount?: number
        vectorsUpserted?: number
      }

      const successCount = payload.successCount ?? 0
      const failureCount = payload.failureCount ?? 0
      const vectors = payload.vectorsUpserted ?? 0

      if (failureCount > 0) {
        toast.warning(
          `Synced ${successCount}/${parsedIds.length} ${label.toLowerCase()} IDs. Upserted ${vectors} vectors.`,
        )
      } else {
        toast.success(
          `Synced ${successCount} ${label.toLowerCase()} IDs. Upserted ${vectors} vectors.`,
        )
      }
    } catch {
      toast.error(`Failed to sync selected ${label.toLowerCase()}.`)
    } finally {
      setIsSyncingIds(false)
    }
  }

  const onSyncSelectedRows = async () => {
    if (isSyncingSelected) return

    if (!isAllMatchingSelected && selectedRowIds.length === 0) {
      toast.error(`Please select at least one ${label.toLowerCase()} row.`)
      return
    }

    setIsSyncingSelected(true)

    try {
      const response = await fetch('/api/handbook/vector/sync', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collection,
          ids: selectedRowIds,
          selectAllMatchingFilters: isAllMatchingSelected,
          where: isAllMatchingSelected ? query.where : undefined,
        }),
      })

      if (!response.ok) {
        toast.error(`Failed to sync selected ${label.toLowerCase()} rows.`)
        return
      }

      const payload = (await response.json()) as {
        ids?: number[]
        successCount?: number
        failureCount?: number
        vectorsUpserted?: number
      }

      const totalRows = payload.ids?.length ?? selectedRowIds.length
      const successCount = payload.successCount ?? 0
      const failureCount = payload.failureCount ?? 0
      const vectors = payload.vectorsUpserted ?? 0

      if (failureCount > 0) {
        toast.warning(
          `Synced ${successCount}/${totalRows} selected ${label.toLowerCase()} rows. Upserted ${vectors} vectors.`,
        )
      } else {
        toast.success(
          `Synced ${successCount} selected ${label.toLowerCase()} rows. Upserted ${vectors} vectors.`,
        )
      }
    } catch {
      toast.error(`Failed to sync selected ${label.toLowerCase()} rows.`)
    } finally {
      setIsSyncingSelected(false)
    }
  }

  return (
    <div
      style={{
        marginBottom: '12px',
        border: '1px solid var(--theme-elevation-200)',
        borderRadius: '8px',
        padding: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <button disabled={isReindexing} onClick={onReindex} type="button">
          {isReindexing ? 'Reindexing...' : 'Reindex All Handbook Vectors'}
        </button>

        <button disabled={isSyncingSelected} onClick={onSyncSelectedRows} type="button">
          {isSyncingSelected ? 'Syncing Selected...' : `Sync Selected ${label} Rows`}
        </button>

        <input
          aria-label={`Comma separated ${label} IDs`}
          onChange={(event) => {
            setIdsInput(event.target.value)
          }}
          placeholder={`Sync specific ${label} IDs, e.g. 1,2,3`}
          style={{
            minWidth: '280px',
            flex: '1 1 320px',
          }}
          value={idsInput}
        />

        <button disabled={isSyncingIds} onClick={onSyncIds} type="button">
          {isSyncingIds ? 'Syncing...' : `Sync ${label} IDs`}
        </button>
      </div>
    </div>
  )
}
