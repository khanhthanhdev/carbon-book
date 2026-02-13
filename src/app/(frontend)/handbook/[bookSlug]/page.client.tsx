'use client'

import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

import { Input } from '@/components/ui/input'
import { useHandbookReading } from '@/providers/HandbookReadingProvider'
import RichText from '@/components/RichText'
import type { SupportedLanguage } from '@/utilities/localization'
import type { HandbookPageData, HandbookSearchResult } from '@/utilities/handbook/types'
import { cn } from '@/utilities/ui'
import { useDebounce } from '@/utilities/useDebounce'
import { ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useMemo, useState } from 'react'

const isRichText = (value: unknown): value is DefaultTypedEditorState => {
  if (!value || typeof value !== 'object') return false
  return 'root' in value
}

type Props = {
  initialData: HandbookPageData
  language: SupportedLanguage
}

export default function HandbookPageClient({ initialData, language }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setCurrentQa } = useHandbookReading()
  const [expandedSectionId, setExpandedSectionId] = useState<number | null>(
    initialData.selection.sectionId,
  )
  const [selectedQaId, setSelectedQaId] = useState<number | null>(initialData.selection.qaId)
  const [searchValue, setSearchValue] = useState('')
  const [searchResults, setSearchResults] = useState<HandbookSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const debouncedSearchValue = useDebounce(searchValue, 300)
  const isSearchOpen = searchValue.trim().length >= 2
  const isWaitingForDebounce =
    isSearchOpen && debouncedSearchValue.trim() !== searchValue.trim()

  const qaLookup = useMemo(() => {
    const lookup = new Map<
      number,
      { qa: HandbookPageData['sections'][number]['qas'][number]; section: HandbookPageData['sections'][number] }
    >()

    for (const section of initialData.sections) {
      for (const qa of section.qas) {
        lookup.set(qa.id, {
          qa,
          section,
        })
      }
    }

    return lookup
  }, [initialData.sections])

  const selectedEntry = selectedQaId ? qaLookup.get(selectedQaId) : null
  const selectedSection = useMemo(() => {
    if (selectedEntry?.section) return selectedEntry.section
    if (!expandedSectionId) return null
    return initialData.sections.find((section) => section.id === expandedSectionId) || null
  }, [expandedSectionId, initialData.sections, selectedEntry?.section])

  useEffect(() => {
    setCurrentQa({
      bookSlug: initialData.book.slug,
      sectionId: selectedSection?.id ?? null,
      qaId: selectedEntry?.qa.id ?? null,
      question: selectedEntry?.qa.question ?? null,
      sectionTitle: selectedSection?.title ?? null,
    })
  }, [
    initialData.book.slug,
    selectedEntry?.qa.id,
    selectedEntry?.qa.question,
    selectedSection?.id,
    selectedSection?.title,
    setCurrentQa,
  ])

  useEffect(() => {
    return () => {
      setCurrentQa(null)
    }
  }, [setCurrentQa])

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString())

    if (expandedSectionId) nextParams.set('section', String(expandedSectionId))
    else nextParams.delete('section')

    if (selectedQaId) nextParams.set('qa', String(selectedQaId))
    else nextParams.delete('qa')

    const current = searchParams.toString()
    const next = nextParams.toString()
    if (current === next) return

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [expandedSectionId, pathname, router, searchParams, selectedQaId])

  useEffect(() => {
    const query = debouncedSearchValue.trim()
    if (query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const controller = new AbortController()

    const runSearch = async () => {
      setIsSearching(true)

      try {
        const response = await fetch(
          `/api/handbook/search?q=${encodeURIComponent(query)}&lang=${language}&limit=8`,
          {
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          setSearchResults([])
          return
        }

        const payload = (await response.json()) as {
          results?: HandbookSearchResult[]
        }

        if (controller.signal.aborted) return
        setSearchResults(payload.results || [])
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to search handbook', error)
          setSearchResults([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }

    void runSearch()

    return () => {
      controller.abort()
    }
  }, [debouncedSearchValue, language])

  const onSelectSection = (sectionId: number) => {
    const section = initialData.sections.find((item) => item.id === sectionId)
    if (!section) return

    setExpandedSectionId(section.id)

    if (section.qas.length === 0) {
      setSelectedQaId(null)
      return
    }

    if (!selectedQaId || !section.qas.some((qa) => qa.id === selectedQaId)) {
      setSelectedQaId(section.qas[0].id)
    }
  }

  const onSelectQa = (sectionId: number, qaId: number) => {
    setExpandedSectionId(sectionId)
    setSelectedQaId(qaId)
  }

  const onSelectSearchResult = (result: HandbookSearchResult) => {
    setSearchValue('')
    setSearchResults([])

    if (result.bookSlug === initialData.book.slug) {
      setExpandedSectionId(result.sectionId)
      setSelectedQaId(result.qaId)
      return
    }

    router.push(
      `/handbook/${encodeURIComponent(result.bookSlug)}?section=${result.sectionId}&qa=${result.qaId}`,
    )
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2.5 lg:px-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Q&A Handbook</p>
        <h1 className="mt-0.5 text-base md:text-lg">{initialData.book.title}</h1>

        <div className="relative mt-2">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label="Search questions"
            className="bg-background pl-9"
            onChange={(event) => {
              setSearchValue(event.target.value)
            }}
            placeholder="Search questions..."
            value={searchValue}
          />

          {isSearchOpen && (
            <div className="bg-background absolute z-20 mt-2 w-full rounded-md border border-border shadow-lg">
              {isSearching || isWaitingForDebounce ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Searching...</p>
              ) : searchResults.length > 0 ? (
                <ul className="max-h-80 overflow-auto py-1">
                  {searchResults.map((result) => (
                    <li key={`${result.bookSlug}-${result.qaId}`}>
                      <button
                        className="hover:bg-muted w-full px-3 py-2 text-left"
                        onClick={() => {
                          onSelectSearchResult(result)
                        }}
                        type="button"
                      >
                        <p className="truncate text-sm">{result.question}</p>
                        <p className="text-muted-foreground mt-1 truncate text-xs">
                          {result.bookTitle} / {result.sectionTitle}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">No matching questions.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-border border-b bg-background/40 lg:border-r lg:border-b-0">
          <div className="p-4">
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Contents</h2>
            <div className="mt-3 space-y-2">
              {initialData.sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sections published yet.</p>
              ) : (
                initialData.sections.map((section) => {
                  const isExpanded = expandedSectionId === section.id

                  return (
                    <div className="rounded-md border border-border bg-card" key={section.id}>
                      <button
                        className="w-full px-3 py-2 text-left"
                        onClick={() => {
                          onSelectSection(section.id)
                        }}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">{section.title}</span>
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </span>
                      </button>

                      {isExpanded && section.qas.length > 0 && (
                        <ul className="space-y-1 border-t border-border px-2 py-2">
                          {section.qas.map((qa) => {
                            const isActive = qa.id === selectedQaId
                            return (
                              <li key={qa.id}>
                                <button
                                  className={cn(
                                    'w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
                                    isActive
                                      ? 'bg-primary text-primary-foreground'
                                      : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                                  )}
                                  onClick={() => {
                                    onSelectQa(section.id, qa.id)
                                  }}
                                  type="button"
                                >
                                  {qa.question}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </aside>

        <section className="px-4 py-5 lg:px-6 lg:py-6">
          {selectedEntry ? (
            <div>
              <p className="text-sm text-muted-foreground">{selectedEntry.section.title}</p>
              <h2 className="mt-1 text-2xl">{selectedEntry.qa.question}</h2>

              <div className="mt-6 rounded-md border border-border bg-background p-4 lg:p-5">
                {isRichText(selectedEntry.qa.answer) ? (
                  <RichText
                    className="max-w-none"
                    data={selectedEntry.qa.answer}
                    enableGutter={false}
                    enableProse={true}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">No answer content available.</p>
                )}
              </div>

              <div className="mt-8">
                <h3 className="text-sm uppercase tracking-wide text-muted-foreground">
                  Sources & Citations
                </h3>

                {selectedEntry.qa.sources.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {selectedEntry.qa.sources.map((source, index) => (
                      <li key={`${source.url}-${index}`}>
                        <a
                          className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                          href={source.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {source.label}
                          <ExternalLink className="size-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No sources provided.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              Select a question from the left panel.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
