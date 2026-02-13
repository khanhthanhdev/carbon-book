'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { ChatAssistant } from './ChatAssistant'
import { useHandbookReading } from '@/providers/HandbookReadingProvider'
import type { SupportedLanguage } from '@/utilities/localization'
import { cn } from '@/utilities/ui'

type Props = {
  language: SupportedLanguage
}

export function FloatingChatAssistant({ language }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const { currentQa } = useHandbookReading()

  const handleOpenChat = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleCloseChat = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Generate starter suggestions from current handbook QA
  const starterSuggestions = useMemo(() => {
    if (!currentQa?.question) return []
    return [currentQa.question]
  }, [currentQa?.question])

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={handleOpenChat}
        className={cn(
          'fixed bottom-6 right-6 z-40',
          'size-14 rounded-full',
          'bg-primary hover:bg-primary/90',
          'text-primary-foreground',
          'shadow-lg hover:shadow-xl',
          'transition-all duration-200',
          'flex items-center justify-center',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary',
        )}
        aria-label={language === 'vi' ? 'Mở trợ lý AI' : 'Open AI Assistant'}
        title={language === 'vi' ? 'Trợ lý AI' : 'AI Assistant'}
      >
        <MessageSquare className="size-6" />
      </button>

      {/* Modal Overlay and Content */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={handleCloseChat}
            aria-hidden="true"
          />

          {/* Chat Modal */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={handleCloseChat}
          >
            <div
              className={cn(
                'bg-card rounded-lg border border-border shadow-2xl',
                'w-full max-w-5xl h-[90vh] max-h-[900px]',
                'flex flex-col',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold">
                    {language === 'vi' ? 'Trợ lý AI Carbon Book' : 'Carbon Book AI Assistant'}
                  </h2>
                  {currentQa?.question && (
                    <p className="mt-1 text-sm text-muted-foreground truncate">
                      {language === 'vi' ? 'Đang xem: ' : 'Currently viewing: '}
                      <span className="font-medium">{currentQa.question}</span>
                    </p>
                  )}
                </div>
                <button
                  onClick={handleCloseChat}
                  className={cn(
                    'ml-4 p-2 rounded-md',
                    'hover:bg-muted',
                    'transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary',
                  )}
                  aria-label={language === 'vi' ? 'Đóng' : 'Close'}
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Chat Content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatAssistant
                  language={language}
                  variant="modal"
                  bookSlug={currentQa?.bookSlug}
                  starterSuggestions={starterSuggestions}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
