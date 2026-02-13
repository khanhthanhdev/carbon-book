import { google } from '@ai-sdk/google'
import { valibotSchema } from '@ai-sdk/valibot'
import { generateText, Output } from 'ai'
import * as v from 'valibot'

const seoMetadataSchema = valibotSchema(
  v.object({
    title: v.string(),
    description: v.string(),
  }),
)

export type GeneratedSeoMetadata = {
  title: string
  description: string
}

type GenerateSeoMetadataArgs = {
  content: string
  collectionSlug: string
  locale?: string
}

export const generateSeoMetadata = async ({
  content,
  collectionSlug,
  locale,
}: GenerateSeoMetadataArgs): Promise<GeneratedSeoMetadata> => {
  const { output } = await generateText({
    model: google('gemini-2.5-flash'),
    output: Output.object({
      schema: seoMetadataSchema,
    }),
    system: [
      'You are an expert SEO specialist. Generate optimized meta title and description for web pages.',
      'Follow these SEO best practices strictly:',
      '',
      'META TITLE RULES:',
      '- Length: 50-60 characters (never exceed 60)',
      '- Place primary keyword near the beginning',
      '- Make it compelling and click-worthy',
      '- Include brand name at the end separated by " | " or " — " only if it fits within 60 chars',
      '- Avoid keyword stuffing',
      '- Use title case',
      '- Each title must be unique and specific to the content',
      '',
      'META DESCRIPTION RULES:',
      '- Length: 150-160 characters (never exceed 160)',
      '- Include primary and secondary keywords naturally',
      '- Write a compelling summary that encourages clicks',
      '- Include a clear value proposition or call-to-action',
      '- Match search intent of the content',
      '- Use active voice',
      '- Do not duplicate the title',
      '',
      'GENERAL RULES:',
      '- Write in the same language as the content (Vietnamese content → Vietnamese meta, English content → English meta)',
      '- If content is bilingual, prefer Vietnamese for the output',
      '- Do not use quotes or special characters that might break HTML attributes',
      '- Make each piece unique — avoid generic or boilerplate text',
    ].join('\n'),
    prompt: [
      `Collection type: ${collectionSlug}`,
      locale ? `Locale: ${locale}` : '',
      '',
      'Generate an SEO-optimized meta title and description for the following content:',
      '',
      content,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  return {
    title: output.title.slice(0, 60),
    description: output.description.slice(0, 160),
  }
}
