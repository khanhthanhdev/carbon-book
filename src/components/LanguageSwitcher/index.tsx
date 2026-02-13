'use client'

import { cn } from '@/utilities/ui'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

type SupportedLanguage = 'vi' | 'en'

const langCookieName = 'lang'

const isSupportedLanguage = (value: string | null | undefined): value is SupportedLanguage => {
  return value === 'vi' || value === 'en'
}

const readLangFromCookie = (): SupportedLanguage | null => {
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${langCookieName}=`))
    ?.split('=')[1]

  return isSupportedLanguage(cookie) ? cookie : null
}

const detectLangFromBrowser = (): SupportedLanguage => {
  const language = navigator.language.toLowerCase()
  return language.includes('vi') ? 'vi' : 'en'
}

const setLangCookie = (lang: SupportedLanguage): void => {
  document.cookie = `${langCookieName}=${lang}; path=/; max-age=31536000; samesite=lax`
}

export const LanguageSwitcher: React.FC = () => {
  const router = useRouter()
  const [language, setLanguage] = useState<SupportedLanguage>('en')

  useEffect(() => {
    const initialLang = readLangFromCookie() || detectLangFromBrowser()

    setLanguage(initialLang)
    setLangCookie(initialLang)
  }, [])

  const onLanguageChange = (nextLanguage: SupportedLanguage) => {
    if (nextLanguage === language) return

    setLanguage(nextLanguage)
    setLangCookie(nextLanguage)
    router.refresh()
  }

  return (
    <div className="inline-flex items-center rounded-md border border-border p-0.5">
      <button
        aria-label="Switch to Vietnamese"
        className={cn(
          'rounded px-2 py-1 text-xs font-medium transition-colors',
          language === 'vi'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onLanguageChange('vi')}
        type="button"
      >
        VI
      </button>
      <button
        aria-label="Switch to English"
        className={cn(
          'rounded px-2 py-1 text-xs font-medium transition-colors',
          language === 'en'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onLanguageChange('en')}
        type="button"
      >
        EN
      </button>
    </div>
  )
}
