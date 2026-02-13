'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, generateId, type UIMessage } from 'ai'
import { Fragment, useCallback, useMemo, useState, type ComponentProps } from 'react'
import { CopyIcon, GlobeIcon, MessageSquare, RefreshCcwIcon } from 'lucide-react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import {
  buildHandbookSourceHref,
  cleanRagSourcePreview,
  type ChatMessageMetadata,
  type RagSourceMetadata,
} from '@/utilities/ai/chatCitationMetadata'
import type { SupportedLanguage } from '@/utilities/localization'
import { safeExternalHref } from '@/utilities/security/urlValidator'
import { cn } from '@/utilities/ui'

type Props = {
  language: SupportedLanguage
  variant?: 'page' | 'widget' | 'modal'
  title?: string
  description?: string
  bookSlug?: string
  starterSuggestions?: string[]
}

type ChatUIMessage = UIMessage<ChatMessageMetadata>

type SourceUrlPart = {
  type: 'source-url'
  sourceId: string
  url: string
  title?: string
  providerMetadata?: Record<string, unknown>
}

type CitationSource = {
  id: string
  url: string
  title: string
  description?: string
}

type HandbookCitationSource = CitationSource & {
  citationNumber: number
}

type MarkdownLinkProps = ComponentProps<'a'> & {
  node?: unknown
}

const CITATION_LINK_PREFIX = '#citation-'
const INLINE_CODE_OR_FENCE_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/g
const CITATION_MARKER_PATTERN = /\[(\d+)\](?!\()/g

const isSourceUrlPart = (part: unknown): part is SourceUrlPart => {
  if (!part || typeof part !== 'object') return false
  const candidate = part as { type?: string; url?: unknown; sourceId?: unknown }
  return (
    candidate.type === 'source-url' &&
    typeof candidate.url === 'string' &&
    typeof candidate.sourceId === 'string'
  )
}

const getSourceHostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const truncate = (text: string, maxLength = 220): string =>
  text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text

const MAX_PREVIEW_DEPTH = 3

const extractSourcePreview = (
  providerMetadata: SourceUrlPart['providerMetadata'],
  depth = 0,
): string | undefined => {
  if (!providerMetadata || depth > MAX_PREVIEW_DEPTH) return undefined

  const pickPreview = (obj: Record<string, unknown>, currentDepth: number): string | undefined => {
    const preferredKeys = ['snippet', 'description', 'summary', 'text', 'content']

    for (const key of preferredKeys) {
      const value = obj[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }

    for (const value of Object.values(obj)) {
      if (typeof value === 'string' && value.trim().length > 20) {
        return value.trim()
      }
    }

    // Bounded recursion to prevent pathological metadata
    if (currentDepth < MAX_PREVIEW_DEPTH) {
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object' && !(Array.isArray(value) || value instanceof Date)) {
          const nested = pickPreview(value as Record<string, unknown>, currentDepth + 1)
          if (nested) return nested
        }
      }
    }

    return undefined
  }

  const preview = pickPreview(providerMetadata, depth)
  return preview ? truncate(preview) : undefined
}

const buildWebSources = (parts: ReadonlyArray<unknown>): CitationSource[] => {
  const seen = new Set<string>()
  const sources: CitationSource[] = []

  for (const part of parts) {
    if (!isSourceUrlPart(part)) continue

    // Validate URL before including
    const safeUrl = safeExternalHref(part.url)
    if (!safeUrl) continue

    const key = part.sourceId || part.url
    if (seen.has(key)) continue
    seen.add(key)

    sources.push({
      id: key,
      url: safeUrl,
      title: part.title?.trim() || getSourceHostname(safeUrl),
      description: extractSourcePreview(part.providerMetadata),
    })
  }

  return sources
}

const buildHandbookSources = (
  ragSources: RagSourceMetadata[],
  language: SupportedLanguage,
): HandbookCitationSource[] => {
  return ragSources.map((source, index) => {
    const citationNumber = source.index || index + 1

    return {
      id: `rag-${citationNumber}-${source.qaId ?? source.sectionId}`,
      citationNumber,
      url: buildHandbookSourceHref(source),
      title:
        source.question?.trim() ||
        source.sectionTitle ||
        (language === 'vi' ? `Nguồn tham khảo ${citationNumber}` : `Reference ${citationNumber}`),
      description:
        cleanRagSourcePreview(source.text, source.docType) ||
        (language === 'vi'
          ? 'Nguồn nội bộ từ ngữ cảnh cẩm nang được dùng để trả lời.'
          : 'Internal handbook context used for this answer.'),
    }
  })
}

const linkifyCitationMarkers = (
  text: string,
  sourcesByCitation: Map<number, HandbookCitationSource>,
): string => {
  if (sourcesByCitation.size === 0) return text

  return text
    .split(INLINE_CODE_OR_FENCE_PATTERN)
    .map((segment) => {
      if (segment.startsWith('```') || segment.startsWith('`')) {
        return segment
      }

      return segment.replace(CITATION_MARKER_PATTERN, (match, citationNumberValue: string) => {
        const citationNumber = Number.parseInt(citationNumberValue, 10)
        const source = sourcesByCitation.get(citationNumber)
        if (!source) return match

        return `[${citationNumber}](${CITATION_LINK_PREFIX}${citationNumber})`
      })
    })
    .join('')
}

const parseCitationIndexFromHref = (href?: string): number | null => {
  if (!href || !href.startsWith(CITATION_LINK_PREFIX)) return null

  const parsed = Number.parseInt(href.slice(CITATION_LINK_PREFIX.length), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

export function ChatAssistant({
  language,
  variant = 'page',
  title,
  description,
  bookSlug,
  starterSuggestions = [],
}: Props) {
  const [input, setInput] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const [chatId] = useState(() => generateId())
  const promptTextareaId = `chat-prompt-${chatId}`
  const isPageVariant = variant === 'page'
  const isModalVariant = variant === 'modal'

  const normalizedStarterSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const suggestions: string[] = []

    for (const suggestion of starterSuggestions) {
      const value = suggestion.trim()
      if (!value) continue

      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      suggestions.push(value)
      if (suggestions.length >= 3) break
    }

    return suggestions
  }, [starterSuggestions])

  const { messages, sendMessage, status, regenerate } = useChat<ChatUIMessage>({
    transport: useMemo(
      () =>
        new DefaultChatTransport({
          api: '/api/chat',
          body: {
            chatId,
            language,
            webSearch,
            ...(bookSlug ? { bookSlug } : {}),
          },
        }),
      [bookSlug, chatId, language, webSearch],
    ),
  })

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return
    sendMessage({ text: message.text, files: message.files })
    setInput('')
  }

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setInput(suggestion)

      requestAnimationFrame(() => {
        const textarea = document.getElementById(promptTextareaId) as HTMLTextAreaElement | null
        if (!textarea) return

        textarea.focus()
        const cursorPosition = textarea.value.length
        textarea.setSelectionRange(cursorPosition, cursorPosition)
      })
    },
    [promptTextareaId],
  )

  const resolvedTitle =
    title || (language === 'vi' ? 'Trợ lý AI Carbon Book' : 'Carbon Book AI Assistant')
  const resolvedDescription =
    description ||
    (language === 'vi'
      ? 'Hỏi đáp về cẩm nang Carbon Book với AI'
      : 'Ask questions about the Carbon Book handbook with AI-powered answers')

  return (
    <div className={cn(isPageVariant ? 'mx-auto max-w-4xl' : 'h-full w-full min-w-0 overflow-hidden')}>
      <div
        className={cn(
          'bg-card min-h-0 w-full min-w-0 overflow-hidden',
          isPageVariant ? 'rounded-lg border border-border' : 'flex h-full flex-col',
        )}
      >
        {!isModalVariant && (
          <div className="border-b border-border px-4 py-3">
            <h1 className="text-lg font-medium">{resolvedTitle}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{resolvedDescription}</p>
          </div>
        )}

        <div
          className={cn(
            'flex min-w-0 flex-col',
            isPageVariant ? 'h-[calc(100vh-16rem)]' : 'min-h-0 flex-1 overflow-hidden',
            isModalVariant && 'h-full',
          )}
        >
          <Conversation className={cn('min-h-0', variant === 'widget' && 'max-h-[calc(100vh-320px)] sm:max-h-[calc(100vh-280px)]')}>
            <ConversationContent className="min-w-0">
              {messages.length === 0 ? (
                <>
                  <ConversationEmptyState
                    className={cn(
                      normalizedStarterSuggestions.length > 0 && 'h-auto! w-full! py-6',
                    )}
                    icon={<MessageSquare className="size-12" />}
                    title={language === 'vi' ? 'Bắt đầu cuộc trò chuyện' : 'Start a conversation'}
                    description={
                      language === 'vi'
                        ? 'Nhập câu hỏi bên dưới để bắt đầu trò chuyện với AI'
                        : 'Type a question below to start chatting with AI'
                    }
                  />

                  {normalizedStarterSuggestions.length > 0 && (
                    <div className="space-y-2 px-4 pb-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {language === 'vi'
                          ? 'Câu hỏi gợi ý từ nội dung bạn đang xem:'
                          : 'Suggested questions from what you are reading:'}
                      </p>
                      <Suggestions>
                        {normalizedStarterSuggestions.map((suggestion, index) => (
                          <Suggestion
                            key={`starter-suggestion-${index}`}
                            suggestion={suggestion}
                            onClick={handleSuggestionClick}
                          />
                        ))}
                      </Suggestions>
                    </div>
                  )}
                </>
              ) : (
                messages.map((message, messageIndex) => {
                  const ragSources =
                    message.role === 'assistant' ? (message.metadata?.ragSources ?? []) : []
                  const messageSuggestions =
                    message.role === 'assistant' ? (message.metadata?.suggestions ?? []) : []
                  const handbookSources = buildHandbookSources(ragSources, language)
                  const handbookSourcesByCitation = new Map(
                    handbookSources.map((source) => [source.citationNumber, source]),
                  )
                  const webSources =
                    message.role === 'assistant' ? buildWebSources(message.parts) : []
                  const hasAssistantText =
                    message.role === 'assistant' &&
                    message.parts.some(
                      (part) =>
                        part.type === 'text' && typeof part.text === 'string' && part.text.trim(),
                    )
                  const hasHandbookSources =
                    message.role === 'assistant' &&
                    hasAssistantText &&
                    handbookSources.length > 0
                  const hasWebSources =
                    message.role === 'assistant' && hasAssistantText && webSources.length > 0
                  const renderMarkdownLink = ({
                    href,
                    children,
                    className,
                    node: _node,
                    ...props
                  }: MarkdownLinkProps) => {
                    const citationIndex =
                      message.role === 'assistant' ? parseCitationIndexFromHref(href) : null

                    if (citationIndex) {
                      const source = handbookSourcesByCitation.get(citationIndex)

                      if (source) {
                        return (
                          <InlineCitation>
                            <InlineCitationCard>
                              <InlineCitationCardTrigger
                                className="ml-0.5 h-5 cursor-pointer px-1.5 text-[10px]"
                                sources={[source.url]}
                              >
                                {children}
                              </InlineCitationCardTrigger>
                              <InlineCitationCardBody className="w-72 p-2.5">
                                <InlineCitationSource
                                  title={`${citationIndex}. ${source.title}`}
                                  url={source.url}
                                  description={
                                    source.description ||
                                    (language === 'vi'
                                      ? 'Nguồn tham khảo được dùng trong câu trả lời.'
                                      : 'Referenced source used in this response.')
                                  }
                                />
                              </InlineCitationCardBody>
                            </InlineCitationCard>
                          </InlineCitation>
                        )
                      }
                    }

                    const safeHref =
                      typeof href === 'string' && href
                        ? href.startsWith('/') || href.startsWith('#') || href.startsWith('?')
                          ? href
                          : safeExternalHref(href)
                        : null

                    if (!safeHref) {
                      return <span className={className}>{children}</span>
                    }

                    const isExternal = /^https?:\/\//i.test(safeHref)

                    return (
                      <a
                        {...props}
                        className={className}
                        href={safeHref}
                        rel={isExternal ? 'noreferrer' : undefined}
                        target={isExternal ? '_blank' : undefined}
                      >
                        {children}
                      </a>
                    )
                  }

                  return (
                    <Fragment key={message.id}>
                      <Message from={message.role}>
                        <MessageContent>
                          {message.parts.map((part, i) => {
                            switch (part.type) {
                              case 'text': {
                                const content =
                                  message.role === 'assistant'
                                    ? linkifyCitationMarkers(part.text, handbookSourcesByCitation)
                                    : part.text

                                return (
                                  <MessageResponse
                                    components={{ a: renderMarkdownLink }}
                                    key={`${message.id}-${i}`}
                                  >
                                    {content}
                                  </MessageResponse>
                                )
                              }
                              default:
                                return null
                            }
                          })}
                        </MessageContent>
                      </Message>

                      {hasHandbookSources && (
                        <div className="mt-2">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {language === 'vi' ? 'Nguồn cẩm nang' : 'Handbook sources'}
                          </p>
                          <Sources defaultOpen>
                            <SourcesTrigger count={handbookSources.length} />
                            <SourcesContent>
                              {handbookSources.map((source) => (
                                <Source
                                  href={source.url}
                                  key={`${message.id}-handbook-source-${source.id}`}
                                  title={`${source.citationNumber}. ${source.title}`}
                                />
                              ))}
                            </SourcesContent>
                          </Sources>
                        </div>
                      )}

                      {hasWebSources && (
                        <div className="mt-2">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {language === 'vi' ? 'Nguồn web' : 'Web sources'}
                          </p>
                          <Sources defaultOpen>
                            <SourcesTrigger count={webSources.length} />
                            <SourcesContent>
                              {webSources.map((source, sourceIndex) => (
                                <Source
                                  href={source.url}
                                  key={`${message.id}-web-source-${source.id}`}
                                  title={`${sourceIndex + 1}. ${source.title}`}
                                />
                              ))}
                            </SourcesContent>
                          </Sources>
                        </div>
                      )}

                      {messageSuggestions.length > 0 && messageIndex === messages.length - 1 && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            {language === 'vi' ? 'Câu hỏi gợi ý:' : 'Suggested questions:'}
                          </p>
                          <Suggestions>
                            {messageSuggestions.map((suggestion, idx) => (
                              <Suggestion
                                key={`${message.id}-suggestion-${idx}`}
                                suggestion={suggestion}
                                onClick={handleSuggestionClick}
                              />
                            ))}
                          </Suggestions>
                        </div>
                      )}

                      {message.role === 'assistant' && messageIndex === messages.length - 1 && (
                        <MessageActions>
                          <MessageAction onClick={() => regenerate()} label="Retry">
                            <RefreshCcwIcon className="size-3" />
                          </MessageAction>
                          <MessageAction
                            onClick={() => {
                              const text = message.parts
                                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                                .map((p) => p.text)
                                .join('')
                              navigator.clipboard.writeText(text)
                            }}
                            label="Copy"
                          >
                            <CopyIcon className="size-3" />
                          </MessageAction>
                        </MessageActions>
                      )}
                    </Fragment>
                  )
                })
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <PromptInput
            onSubmit={handleSubmit}
            className={cn(
              'mt-2 mb-4 min-w-0 flex-shrink-0 px-4',
              (variant === 'widget' || variant === 'modal') && 'mb-2',
            )}
          >
            <PromptInputBody>
              <PromptInputTextarea
                id={promptTextareaId}
                value={input}
                placeholder={
                  language === 'vi'
                    ? 'Nhập câu hỏi của bạn...'
                    : 'Ask a question about the handbook...'
                }
                onChange={(e) => setInput(e.currentTarget.value)}
                className={variant !== 'page' ? 'min-h-10 max-h-28' : undefined}
              />
            </PromptInputBody>
            <PromptInputFooter className={variant !== 'page' ? 'gap-1' : undefined}>
              <PromptInputTools>
                <PromptInputButton
                  onClick={() => setWebSearch(!webSearch)}
                  tooltip={{ content: language === 'vi' ? 'Tìm kiếm web' : 'Search the web' }}
                  variant={webSearch ? 'default' : 'ghost'}
                >
                  <GlobeIcon size={16} />
                  <span>{language === 'vi' ? 'Tìm web' : 'Web Search'}</span>
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit
                status={status === 'streaming' ? 'streaming' : 'ready'}
                disabled={!input.trim()}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}
