import { google } from '@ai-sdk/google'
import { valibotSchema } from '@ai-sdk/valibot'
import { generateText, Output } from 'ai'
import * as v from 'valibot'

const TAG_LIMIT = 8
const KEYWORD_LIMIT = 12

const handbookMetadataSchema = valibotSchema(
  v.object({
    tags: v.array(v.string()),
    keywords: v.array(v.string()),
  }),
)

const normalizeTerm = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim()
}

const sanitizeTerms = (values: string[], limit: number): string[] => {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = normalizeTerm(value)

    if (!normalized) continue

    const dedupeKey = normalized.toLocaleLowerCase()

    if (seen.has(dedupeKey)) continue

    seen.add(dedupeKey)
    output.push(normalized)

    if (output.length >= limit) {
      break
    }
  }

  return output
}

export type GeneratedHandbookMetadata = {
  tags: string[]
  keywords: string[]
}

type GenerateHandbookMetadataArgs = {
  content: string
  documentType: 'section' | 'qa'
}

export const toMetadataRows = (values: string[]): { value: string }[] => {
  return values.map((value) => ({ value }))
}

export const generateHandbookMetadata = async ({
  content,
  documentType,
}: GenerateHandbookMetadataArgs): Promise<GeneratedHandbookMetadata> => {
  const { output } = await generateText({
    model: google('gemini-2.5-flash'),
    output: Output.object({
      schema: handbookMetadataSchema,
    }),
    system:
      'You generate metadata for bilingual handbook content. Return concise and high-signal terms only.',
    prompt: [
      `Document type: ${documentType}`,
      'Task: Generate metadata terms from the content below.',
      'Required counts: 8 tags and 12 keywords.',
      'Language policy: bilingual mixed list (Vietnamese and English where useful).',
      'Rules:',
      '- Tags are broad topical labels.',
      '- Keywords are specific search-friendly phrases.',
      '- Avoid duplicates and near-duplicates.',
      '- No hashtags, numbering, or trailing punctuation.',
      '- Keep each term short and readable.',
      '',
      'Content:',
      content,
    ].join('\n'),
  })

  return {
    tags: sanitizeTerms(output.tags, TAG_LIMIT),
    keywords: sanitizeTerms(output.keywords, KEYWORD_LIMIT),
  }
}
