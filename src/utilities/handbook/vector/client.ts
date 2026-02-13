import { Index } from '@upstash/vector'

import type { HandbookVectorMetadata } from './types'

export const HANDBOOK_VECTOR_NAMESPACE = process.env.UPSTASH_VECTOR_NAMESPACE || 'handbook'

let cachedIndex: Index<HandbookVectorMetadata> | null = null

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 100

export const isHandbookVectorConfigured = (): boolean => {
  return Boolean(process.env.UPSTASH_VECTOR_REST_URL && process.env.UPSTASH_VECTOR_REST_TOKEN)
}

export const getHandbookVectorIndex = (): Index<HandbookVectorMetadata> => {
  if (cachedIndex) return cachedIndex

  const url = process.env.UPSTASH_VECTOR_REST_URL
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN

  if (!url || !token) {
    throw new Error('Missing UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN')
  }

  cachedIndex = new Index<HandbookVectorMetadata>({
    url,
    token,
  })

  return cachedIndex
}

export const getHandbookVectorNamespace = () => {
  return getHandbookVectorIndex().namespace(HANDBOOK_VECTOR_NAMESPACE)
}

/**
 * Retry wrapper with exponential backoff.
 * Retries on transient errors (network, 429, 5xx).
 * Does NOT retry on permanent errors (4xx except 429, auth failures).
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  context: string = 'Upstash operation',
): Promise<T> => {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error

      // Check if error is retryable
      const isRetryable = isRetryableError(lastError)
      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        throw lastError
      }

      // Exponential backoff with jitter
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
      const jitter = Math.random() * 0.1 * backoff // 0-10% jitter
      const delayMs = Math.min(backoff + jitter, 1000) // Cap at 1 second

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError || new Error(`${context} failed after ${MAX_RETRIES} retries`)
}

/**
 * Determine if an error is retryable.
 * Retryable: network errors, timeouts, 429 (rate limit), 5xx
 * Non-retryable: 4xx (except 429), auth failures, validation errors
 */
const isRetryableError = (error: Error): boolean => {
  const message = error.message.toLowerCase()

  // Network and timeout errors
  if (
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('ehostunreach') ||
    message.includes('network') ||
    message.includes('timeout')
  ) {
    return true
  }

  // HTTP status code patterns
  if (message.includes('429')) return true // Rate limit
  if (message.includes('503')) return true // Service unavailable
  if (message.includes('502')) return true // Bad gateway
  if (message.includes('504')) return true // Gateway timeout
  if (message.includes('500')) return true // Internal server error

  // Default: don't retry unknown errors
  return false
}
