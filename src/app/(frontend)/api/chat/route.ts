import { google } from '@ai-sdk/google'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai'
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  toRagSourceMetadata,
  type ChatMessageMetadata,
  type RagSourceMetadata,
} from '@/utilities/ai/chatCitationMetadata'
import { retrieveHandbookHybrid } from '@/utilities/handbook/vector/retrieval'
import { generateSuggestions } from '@/utilities/handbook/vector/rag'
import type { SupportedLanguage } from '@/utilities/localization'
import type { HandbookRetrievedChunk } from '@/utilities/handbook/types'

export const maxDuration = 60

type ChatUIMessage = UIMessage<ChatMessageMetadata>

type ChatRequestBody = {
  messages: ChatUIMessage[]
  chatId: string
  language?: SupportedLanguage
  bookSlug?: string
  webSearch?: boolean
}

const formatChunksAsContext = (chunks: HandbookRetrievedChunk[]): string => {
  if (chunks.length === 0) return ''

  return chunks
    .map((chunk, index) => {
      const num = index + 1
      const lines = [
        `[Source ${num}]`,
        `Book: ${chunk.bookTitle}`,
        `Section: ${chunk.sectionTitle}`,
        chunk.question ? `Question: ${chunk.question}` : null,
        `Content: ${chunk.text.slice(0, 600)}`,
      ].filter(Boolean)
      return lines.join('\n')
    })
    .join('\n\n---\n\n')
}

const buildSystemPrompt = (
  language: SupportedLanguage,
  ragContext: string,
  hasWebSearch: boolean,
): string => {
  const langInstruction =
    language === 'vi' ? 'Trả lời bằng tiếng Việt.' : 'Respond in English.'

  const ragInstruction = ragContext
    ? `\n\nYou have access to the following handbook content for reference. When citing these sources, use inline markers like [1], [2], etc. matching the source numbers below:\n\n${ragContext}`
    : ''

  const webSearchInstruction = hasWebSearch
    ? '\n\nYou also have access to web search results. Use them to supplement your answer when handbook content is insufficient.'
    : ''

  return [
    'You are Carbon Book AI Assistant, a helpful and knowledgeable assistant for the Carbon Book handbook.',
    langInstruction,
    'Keep your answers concise, accurate, and well-structured.',
    'Use markdown formatting for readability.',
    'When you use information from the provided sources, cite them using [1], [2], etc.',
    ragInstruction,
    webSearchInstruction,
  ].join('\n')
}

const buildMessageMetadata = ({
  ragSources,
  suggestions,
}: {
  ragSources: RagSourceMetadata[]
  suggestions: string[]
}): ChatMessageMetadata | undefined => {
  if (ragSources.length === 0 && suggestions.length === 0) return undefined

  return {
    ...(ragSources.length > 0 ? { ragSources } : {}),
    ...(suggestions.length > 0 ? { suggestions } : {}),
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as ChatRequestBody
  const { messages, chatId, language = 'en', bookSlug, webSearch = false } = body

  // Extract the last user message for RAG query
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  const query =
    lastUserMessage?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ') || ''

  // Retrieve RAG context
  let ragChunks: HandbookRetrievedChunk[] = []
  if (query.length >= 3) {
    try {
      ragChunks = await retrieveHandbookHybrid({
        query,
        language,
        topK: 6,
        bookSlug,
        documentTypes: ['qa', 'section'],
      })
    } catch (error) {
      console.warn('RAG retrieval failed:', error)
    }
  }

  const ragContext = formatChunksAsContext(ragChunks)
  const ragSources = toRagSourceMetadata(ragChunks)
  const systemPrompt = buildSystemPrompt(language, ragContext, webSearch)

  const result = streamText({
    model: google('gemini-2.5-flash-lite'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    ...(webSearch ? { tools: { google_search: google.tools.googleSearch({}) } } : {}),
    temperature: 0.3,
    maxOutputTokens: 2000,
  })

  // Save to database after completion
  const payload = await getPayload({ config })

  return createUIMessageStreamResponse({
    headers: {
      'Cache-Control': 'no-store',
    },
    stream: createUIMessageStream<ChatUIMessage>({
      originalMessages: messages,
      execute: async ({ writer }) => {
        writer.merge(
          result.toUIMessageStream<ChatUIMessage>({
            originalMessages: messages,
            sendSources: webSearch,
            sendFinish: false,
            messageMetadata: ({ part }) => {
              if (part.type !== 'start') return undefined
              return buildMessageMetadata({
                ragSources,
                suggestions: [],
              })
            },
          }),
        )

        const [answerText, finishReason] = await Promise.all([result.text, result.finishReason])

        const suggestions =
          ragChunks.length > 0 && query.length >= 3
            ? await generateSuggestions({
                query,
                answer: answerText,
                language,
              })
            : []

        const finishMetadata = buildMessageMetadata({
          ragSources,
          suggestions,
        })

        writer.write({
          type: 'finish',
          finishReason,
          ...(finishMetadata ? { messageMetadata: finishMetadata } : {}),
        })
      },
      onFinish: async ({ messages: finalMessages }) => {
        try {
          const existing = await payload.find({
            collection: 'chat-conversations',
            where: { chatId: { equals: chatId } },
            limit: 1,
          })

          // Extract title from first user message
          const firstUserMsg = finalMessages.find((m) => m.role === 'user')
          const title =
            firstUserMsg?.parts
              ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join(' ')
              .slice(0, 100) || 'Untitled Chat'

          if (existing.docs.length > 0) {
            await payload.update({
              collection: 'chat-conversations',
              id: existing.docs[0].id,
              data: {
                messages: finalMessages as unknown as Record<string, unknown>[],
                messageCount: finalMessages.length,
                title: existing.docs[0].title || title,
              },
            })
          } else {
            await payload.create({
              collection: 'chat-conversations',
              data: {
                chatId,
                messages: finalMessages as unknown as Record<string, unknown>[],
                messageCount: finalMessages.length,
                language,
                bookSlug: bookSlug || undefined,
                title,
              },
            })
          }
        } catch (error) {
          console.error('Failed to save chat:', error)
        }
      },
    }),
  })
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const chatId = url.searchParams.get('chatId')

  if (!chatId) {
    return Response.json({ messages: [] })
  }

  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'chat-conversations',
    where: { chatId: { equals: chatId } },
    limit: 1,
  })

  if (result.docs.length === 0) {
    return Response.json({ messages: [] })
  }

  return Response.json({
    messages: result.docs[0].messages || [],
    title: result.docs[0].title,
  })
}
