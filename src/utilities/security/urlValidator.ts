/**
 * URL validation utilities for security
 * Prevents XSS via malicious URLs (javascript:, data:, etc.)
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Validates and sanitizes external URLs
 * Returns null if URL is unsafe or invalid
 */
export const safeExternalHref = (url: unknown): string | null => {
  // Type guard
  if (typeof url !== 'string') return null

  const trimmed = url.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)

    // Only allow http and https
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
      return null
    }

    return parsed.toString()
  } catch {
    // Invalid URL
    return null
  }
}

/**
 * Validates a URL is safe before rendering in anchor tag
 */
export const isValidExternalUrl = (url: unknown): url is string => {
  return safeExternalHref(url) !== null
}
