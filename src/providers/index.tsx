import React from 'react'

import { HandbookReadingProvider } from './HandbookReadingProvider'
import { HeaderThemeProvider } from './HeaderTheme'
import { ThemeProvider } from './Theme'

export const Providers: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  return (
    <ThemeProvider>
      <HeaderThemeProvider>
        <HandbookReadingProvider>{children}</HandbookReadingProvider>
      </HeaderThemeProvider>
    </ThemeProvider>
  )
}
