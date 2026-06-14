/**
 * Vision-Language Model (VLM) Client
 *
 * Supports two backends:
 * - OpenAI GPT-4o (or compatible models)
 * - Anthropic Claude (Opus or Sonnet)
 *
 * Configure via environment variables:
 *   DESCRIPTION_PROVIDER=openai    (default: openai)
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   VLM_MODEL=gpt-4o              (default: gpt-4o for openai, claude-sonnet-4-20250514 for anthropic)
 *   VLM_MAX_TOKENS=1024           (default: 1024)
 */

export type VlmProvider = 'openai' | 'anthropic'

export interface VlmConfig {
  provider: VlmProvider
  apiKey: string
  model: string
  maxTokens: number
}

export interface VlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | VlmContentPart[]
}

export type VlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_base64'; base64: string; mediaType: string }

export interface VlmResponse {
  content: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * Resolve VLM configuration from environment variables.
 */
export function resolveVlmConfig(): VlmConfig {
  const provider = (process.env['DESCRIPTION_PROVIDER'] || 'openai') as VlmProvider
  const apiKey =
    provider === 'openai'
      ? process.env['OPENAI_API_KEY'] || ''
      : process.env['ANTHROPIC_API_KEY'] || ''

  const defaultModels: Record<VlmProvider, string> = {
    openai: process.env['OPENAI_MODEL'] || 'gpt-4o',
    anthropic: process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514',
  }

  return {
    provider,
    apiKey,
    model: process.env['VLM_MODEL'] || defaultModels[provider],
    maxTokens: parseInt(process.env['VLM_MAX_TOKENS'] || '1024', 10),
  }
}

/**
 * Send a vision request to the configured VLM provider.
 */
export async function vlmChat(
  messages: VlmMessage[],
  config?: Partial<VlmConfig>
): Promise<VlmResponse> {
  const cfg = { ...resolveVlmConfig(), ...config }

  if (!cfg.apiKey) {
    throw new Error(
      `VLM API key not configured. Set ${cfg.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} environment variable.`
    )
  }

  switch (cfg.provider) {
    case 'openai':
      return callOpenAi(messages, cfg)
    case 'anthropic':
      return callAnthropic(messages, cfg)
    default:
      throw new Error(`Unknown VLM provider: ${cfg.provider}`)
  }
}

// =========================================================================
// OpenAI API
// =========================================================================

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | OpenAiContentPart[]
}

type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

async function callOpenAi(
  messages: VlmMessage[],
  config: VlmConfig
): Promise<VlmResponse> {
  const apiMessages: OpenAiMessage[] = messages.map(msg => ({
    role: msg.role,
    content: Array.isArray(msg.content)
      ? msg.content.map(convertOpenAiPart)
      : msg.content,
  }))

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: apiMessages,
      max_tokens: config.maxTokens,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenAI API error ${response.status}: ${body.slice(200)}`)
  }

  const data = await response.json() as {
    choices: { message: { content: string | null } }[]
    model: string
    usage: { prompt_tokens: number; completion_tokens: number }
  }

  return {
    content: data.choices[0]?.message?.content || '',
    model: data.model,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  }
}

function convertOpenAiPart(part: VlmContentPart): OpenAiContentPart {
  if (part.type === 'text') {
    return { type: 'text', text: part.text }
  }
  return {
    type: 'image_url',
    image_url: {
      url: `data:${part.mediaType};base64,${part.base64}`,
      detail: 'low',
    },
  }
}

// =========================================================================
// Anthropic API
// =========================================================================

interface AnthropicContentBlock {
  type: string
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
}

async function callAnthropic(
  messages: VlmMessage[],
  config: VlmConfig
): Promise<VlmResponse> {
  // Anthropic uses a separate system parameter
  let systemPrompt = ''
  const apiMessages: { role: 'user' | 'assistant'; content: AnthropicContentBlock[] }[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.type === 'text' ? c.text : '').join('\n')) + '\n'
      continue
    }
    apiMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: Array.isArray(msg.content)
        ? msg.content.map(convertAnthropicPart)
        : [{ type: 'text', text: msg.content }],
    })
  }

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens,
    messages: apiMessages,
  }

  if (systemPrompt.trim()) {
    body['system'] = systemPrompt.trim()
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(`Anthropic API error ${response.status}: ${bodyText.slice(200)}`)
  }

  const data = await response.json() as {
    content: { type: string; text?: string }[]
    model: string
    usage: { input_tokens: number; output_tokens: number }
  }

  // Combine content blocks into a single text response
  const fullContent = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n')

  return {
    content: fullContent,
    model: data.model,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  }
}

function convertAnthropicPart(part: VlmContentPart): AnthropicContentBlock {
  if (part.type === 'text') {
    return { type: 'text', text: part.text }
  }
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: part.mediaType,
      data: part.base64,
    },
  }
}
