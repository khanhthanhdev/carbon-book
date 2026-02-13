import { google } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { valibotSchema } from '@ai-sdk/valibot'
import * as v from 'valibot'
import type { InferInput } from 'valibot'

import type { HandbookRagResponse, HandbookRetrievedChunk } from '@/utilities/handbook/types'
import type { SupportedLanguage } from '@/utilities/localization'

import { retrieveHandbookHybrid } from './retrieval'

const DEFAULT_TOP_K = 6
const CITATION_COUNT = 4
const MAX_CONTEXT_CHARS_PER_CHUNK = 700
const MAX_RESPONSE_CHARS_PER_CHUNK = 320
const MAX_QUERY_LENGTH = 2000
const SUGGESTIONS_COUNT = 3
const MAX_SUGGESTION_LENGTH = 150

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim()
}

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

const getEmptyAnswer = (language: SupportedLanguage): string => {
  if (language === 'vi') {
    return 'Tôi chưa tìm thấy thông tin phù hợp trong tài liệu hiện có.'
  }

  return 'I could not find relevant information in the current handbook content.'
}

const toContextBlock = (chunks: HandbookRetrievedChunk[]): string => {
  return chunks
    .map((chunk, index) => {
      const citationNum = index + 1
      const compactText = truncate(normalizeWhitespace(chunk.text), MAX_CONTEXT_CHARS_PER_CHUNK)
      const heading = [
        `**Citation #${citationNum}**`,
        `id=${chunk.id}`,
        `type=${chunk.docType}`,
        `book=${chunk.bookTitle}`,
        `section=${chunk.sectionTitle}`,
      ].join(' | ')

      return `${heading}\n${compactText}`
    })
    .join('\n\n---\n\n')
}

const compactChunkForResponse = (chunk: HandbookRetrievedChunk): HandbookRetrievedChunk => {
  return {
    ...chunk,
    text: truncate(normalizeWhitespace(chunk.text), MAX_RESPONSE_CHARS_PER_CHUNK),
  }
}

// Valibot schema for RAG response validation
const RagResponseSchema = v.object({
  answer: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(1500),
  ),
  citations: v.pipe(
    v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
    v.maxLength(CITATION_COUNT),
  ),
})

// Type for validated RAG response
export type RagJsonResponse = InferInput<typeof RagResponseSchema>

// Valibot schema for suggestions
const SuggestionsSchema = v.object({
  suggestions: v.pipe(
    v.array(
      v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(MAX_SUGGESTION_LENGTH),
      ),
    ),
    v.minLength(SUGGESTIONS_COUNT),
    v.maxLength(SUGGESTIONS_COUNT),
  ),
})

export type SuggestionsResponse = InferInput<typeof SuggestionsSchema>

const logRagError = ({
  query,
  language,
  stage,
  error,
}: {
  query: string
  language: string
  stage: 'retrieval' | 'generation' | 'suggestions'
  error: unknown
}) => {
  console.error('RAG error', {
    query,
    language,
    stage,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
}

const normalizeSuggestion = (value: string): string => {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')

  if (!cleaned) return ''

  const noTrailingSentencePunctuation = cleaned.replace(/[.!。]+$/g, '')
  let normalized = noTrailingSentencePunctuation || cleaned

  if (!normalized.endsWith('?')) {
    normalized = `${normalized}?`
  }

  if (normalized.length > MAX_SUGGESTION_LENGTH) {
    normalized = `${normalized.slice(0, MAX_SUGGESTION_LENGTH - 1).trimEnd()}?`
  }

  return normalized
}

const buildFallbackSuggestions = ({
  query,
  language,
}: {
  query: string
  language: SupportedLanguage
}): string[] => {
  const topic = normalizeWhitespace(query).replace(/[?!。？！.]+$/g, '').slice(0, 48)
  const safeTopic = topic || (language === 'vi' ? 'nội dung này' : 'this topic')

  const suggestions =
    language === 'vi'
      ? [
          `Làm sao áp dụng ${safeTopic} trong thực tế?`,
          `Tại sao ${safeTopic} lại quan trọng?`,
          `Nên tìm hiểu thêm gì về ${safeTopic}?`,
        ]
      : [
          `How can I apply ${safeTopic} in practice?`,
          `Why is ${safeTopic} important here?`,
          `What should I explore next about ${safeTopic}?`,
        ]

  return suggestions.map(normalizeSuggestion).slice(0, SUGGESTIONS_COUNT)
}

const finalizeSuggestions = ({
  suggestions,
  query,
  language,
}: {
  suggestions: string[]
  query: string
  language: SupportedLanguage
}): string[] => {
  const unique: string[] = []
  const seen = new Set<string>()

  for (const suggestion of suggestions) {
    const normalized = normalizeSuggestion(suggestion)
    if (!normalized) continue

    const key = normalized.toLocaleLowerCase(language === 'vi' ? 'vi-VN' : 'en-US')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(normalized)

    if (unique.length === SUGGESTIONS_COUNT) {
      return unique
    }
  }

  for (const fallback of buildFallbackSuggestions({ query, language })) {
    const key = fallback.toLocaleLowerCase(language === 'vi' ? 'vi-VN' : 'en-US')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(fallback)
    if (unique.length === SUGGESTIONS_COUNT) break
  }

  return unique.slice(0, SUGGESTIONS_COUNT)
}

export const generateSuggestions = async ({
  query,
  answer,
  language,
}: {
  query: string
  answer: string
  language: SupportedLanguage
}): Promise<string[]> => {
  try {
    const system =
      language === 'vi'
        ? [
            'Bạn là trợ lý tạo câu hỏi tiếp theo cho sổ tay Carbon Book.',
            '',
            'NHIỆM VỤ: Tạo 3 câu hỏi tiếp theo có liên quan nhất dựa trên câu hỏi gốc và câu trả lời đã cho.',
            '',
            'YÊU CẦU VỀ ĐỊNH DẠNG CÂU HỎI:',
            '- Mỗi câu hỏi phải ngắn gọn (dưới 100 ký tự)',
            '- Phải bắt đầu với "Cách", "Làm sao", "Tại sao", "Là gì", "Có thể" hoặc "Nên"',
            '- Luôn kết thúc bằng dấu "?"',
            '- Không lặp lại từ khóa chính từ câu hỏi gốc',
            '- Phải có thể trả lời từ ngữ cảnh hiện có',
            '',
            'ĐỊNH DẠNG ĐẦU RA (BẮT BUỘC): Chỉ trả lời JSON hợp lệ, không markdown, không văn bản khác:',
            '{"suggestions": ["Câu hỏi 1?", "Câu hỏi 2?", "Câu hỏi 3?"]}',
          ].join('\n')
        : [
            'You are a follow-up question suggestion generator for Carbon Book handbook.',
            '',
            'TASK: Generate 3 most relevant follow-up questions based on the original query and answer provided.',
            '',
            'QUESTION FORMAT REQUIREMENTS:',
            '- Each question must be concise (under 100 characters)',
            '- Start with "What", "How", "Why", "Can", "Should", or "Where"',
            '- Always end with a question mark "?"',
            '- Avoid repeating main keywords from the original query',
            '- Must be answerable from the current context',
            '',
            'OUTPUT FORMAT (STRICT): Return valid JSON only, no markdown, no extra text:',
            '{"suggestions": ["Question 1?", "Question 2?", "Question 3?"]}',
          ].join('\n')

    const prompt =
      language === 'vi'
        ? [
            'CÂU HỎI GỐC: ' + query,
            '',
            'CÂU TRẢ LỜI ĐÃ CHO:',
            answer,
            '',
            'Tạo 3 câu hỏi tiếp theo:',
          ].join('\n')
        : [
            'ORIGINAL QUESTION: ' + query,
            '',
            'PROVIDED ANSWER:',
            answer,
            '',
            'Generate 3 follow-up questions:',
          ].join('\n')

    const parsed = await generateObject({
      model: google('gemini-2.5-flash-lite'),
      schema: valibotSchema(SuggestionsSchema),
      system,
      prompt,
      temperature: 0.7,
    })

    return finalizeSuggestions({
      suggestions: parsed.object.suggestions,
      query,
      language,
    })
  } catch (error) {
    logRagError({
      query,
      language,
      stage: 'suggestions',
      error,
    })
    return buildFallbackSuggestions({ query, language })
  }
}

export const generateHandbookRagResponse = async ({
  query,
  language,
  topK,
  bookSlug,
  sectionId,
}: {
  query: string
  language: SupportedLanguage
  topK?: number
  bookSlug?: string
  sectionId?: number
}): Promise<HandbookRagResponse> => {
  // Validate and cap inputs early
  const safeQuery = query.trim().slice(0, MAX_QUERY_LENGTH)
  if (!safeQuery) {
    return {
      answer: getEmptyAnswer(language),
      language,
      citations: [],
      results: [],
      suggestions: [],
    }
  }

  const safeTopK = Math.min(Math.max(topK ?? DEFAULT_TOP_K, 1), 40)

  let chunks: HandbookRetrievedChunk[] = []
  try {
    chunks = await retrieveHandbookHybrid({
      query: safeQuery,
      language,
      topK: safeTopK,
      bookSlug,
      sectionId,
      documentTypes: ['qa', 'section'],
    })
  } catch (error) {
    logRagError({
      query: safeQuery,
      language,
      stage: 'retrieval',
      error,
    })
    return {
      answer: getEmptyAnswer(language),
      language,
      citations: [],
      results: [],
      suggestions: [],
    }
  }

  const contextChunks = chunks.slice(0, safeTopK)
  const responseResults = contextChunks.map(compactChunkForResponse)

  if (contextChunks.length === 0) {
    return {
      answer: getEmptyAnswer(language),
      language,
      citations: [],
      results: [],
      suggestions: [],
    }
  }

  const system =
    language === 'vi'
      ? [
          'Bạn là trợ lý tri thức cho sổ tay Carbon Book.',
          'Chỉ trả lời bằng tiếng Việt.',
          'Chỉ dùng thông tin trong ngữ cảnh được cung cấp.',
          'Nếu thiếu dữ liệu, nói rõ là chưa đủ thông tin.',
          'Trả lời ngắn gọn, đúng trọng tâm.',
          'Khi trích dẫn nguồn, dùng các số [1], [2], v.v. khớp với các nhãn Citation #N.',
          'QUAN TRỌNG: Trả lời CHỈNH ĐỊNH dạng JSON như sau, không có văn bản khác:',
          '{"answer": "...", "citations": [1, 2]}',
        ].join('\n')
      : [
          'You are a handbook QA assistant for Carbon Book.',
          'Answer only in English.',
          'Use only the provided context.',
          'If evidence is insufficient, explicitly say so.',
          'Keep the answer concise and direct.',
          'When citing sources, reference them as [1], [2], etc., matching the Citation #N labels.',
          'IMPORTANT: Respond ONLY in JSON format, no other text:',
          '{"answer": "...", "citations": [1, 2]}',
        ].join('\n')

  const prompt = [
    `User query: ${safeQuery}`,
    '',
    'Context:',
    toContextBlock(contextChunks),
  ].join('\n')

  try {
    const parsed = await generateObject({
      model: google('gemini-2.5-flash-lite'),
      schema: valibotSchema(RagResponseSchema),
      system,
      prompt,
      temperature: 0.1,
    })

    // Validate citations are within range
    const validCitations = contextChunks.filter((chunk) => {
      const chunkIndex = contextChunks.indexOf(chunk) + 1
      return parsed.object.citations.includes(chunkIndex)
    })

    // Generate follow-up suggestions after answer generation
    const suggestions = await generateSuggestions({
      query: safeQuery,
      answer: parsed.object.answer,
      language,
    })

    return {
      answer: parsed.object.answer,
      language,
      citations: validCitations.slice(0, CITATION_COUNT).map(compactChunkForResponse),
      results: responseResults,
      suggestions,
    }
  } catch (error) {
    logRagError({
      query: safeQuery,
      language,
      stage: 'generation',
      error,
    })

    return {
      answer: getEmptyAnswer(language),
      language,
      citations: [],
      results: responseResults,
      suggestions: [],
    }
  }
}
