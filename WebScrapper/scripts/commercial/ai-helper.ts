/**
 * AI content generation helper for CRM automation scripts.
 * Uses OpenAI GPT-4o for email personalization and draft generation.
 */

import OpenAI from 'openai'

let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY in .env.local')
    _client = new OpenAI({ apiKey })
  }
  return _client
}

export async function aiGenerate(prompt: string): Promise<string> {
  const openai = getClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  })
  let text = response.choices[0]?.message?.content?.trim() || ''
  // Strip markdown code fences if present
  text = text.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/, '')
  return text
}
