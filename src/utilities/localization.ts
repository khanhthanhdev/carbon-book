import { cookies, headers } from 'next/headers'

export type SupportedLanguage = 'vi' | 'en'

const supportedLanguages: SupportedLanguage[] = ['vi', 'en']

const isSupportedLanguage = (value: string | null | undefined): value is SupportedLanguage => {
  if (!value) return false
  return supportedLanguages.includes(value as SupportedLanguage)
}

const parseAcceptLanguage = (value: string | null): SupportedLanguage | null => {
  if (!value) return null

  const normalized = value.toLowerCase()
  if (normalized.includes('vi')) return 'vi'
  if (normalized.includes('en')) return 'en'
  return null
}

export const getUserLanguage = async (
  searchParamLang?: string | string[] | null,
  options?: {
    fallbackFromRequest?: boolean
  },
): Promise<SupportedLanguage> => {
  const langFromSearch = Array.isArray(searchParamLang) ? searchParamLang[0] : searchParamLang
  if (isSupportedLanguage(langFromSearch)) {
    return langFromSearch
  }

  if (options?.fallbackFromRequest === false) {
    return 'en'
  }

  const cookieStore = await cookies()
  const langFromCookie = cookieStore.get('lang')?.value
  if (isSupportedLanguage(langFromCookie)) {
    return langFromCookie
  }

  const headerStore = await headers()
  const langFromHeader = parseAcceptLanguage(headerStore.get('accept-language'))
  if (langFromHeader) {
    return langFromHeader
  }

  return 'en'
}

export const pickLocalizedString = (
  language: SupportedLanguage,
  vietnamese?: string | null,
  english?: string | null,
): string => {
  if (language === 'vi') return vietnamese || english || ''
  return english || vietnamese || ''
}

export const pickLocalizedRichText = <T>(
  language: SupportedLanguage,
  vietnamese?: T | null,
  english?: T | null,
): T | null => {
  if (language === 'vi') return vietnamese ?? english ?? null
  return english ?? vietnamese ?? null
}
