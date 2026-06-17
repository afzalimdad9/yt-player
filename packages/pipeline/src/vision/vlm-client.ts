/**
 * Vision-Language Model (VLM) Client
 *
 * Supports three backends:
 * - OpenAI GPT-4o (or compatible models)
 * - Anthropic Claude (Opus or Sonnet)
 * - Ollama (local inference via Ollama server, e.g. LLaVA, llava-llama3)
 *
 * Configure via environment variables:
 *   DESCRIPTION_PROVIDER=openai    (default: openai)
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   VLM_MODEL=gpt-4o              (default: gpt-4o / claude-sonnet-4-20250514 / llava)
 *   VLM_MAX_TOKENS=1024           (default: 1024)
 *
 *   # Ollama-specific:
 *   OLLAMA_BASE_URL=http://localhost:11434  (default)
 *   OLLAMA_MODEL=llava                      (default: llava)
 */

export type VlmProvider = 'openai' | 'anthropic' | 'ollama'

export interface VlmConfig {
  provider: VlmProvider
  apiKey: string
  model: string
  maxTokens: number
  /** Ollama server base URL (only used when provider is 'ollama') */
  ollamaBaseUrl?: string
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

  // API key is only needed for cloud providers
  let apiKey = ''
  if (provider === 'openai') {
    apiKey = process.env['OPENAI_API_KEY'] || ''
  } else if (provider === 'anthropic') {
    apiKey = process.env['ANTHROPIC_API_KEY'] || ''
  }
  // ollama doesn't need an API key

  const defaultModels: Record<VlmProvider, string> = {
    openai: process.env['OPENAI_MODEL'] || 'gpt-4o',
    anthropic: process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514',
    ollama: process.env['OLLAMA_MODEL'] || 'llava',
  }

  return {
    provider,
    apiKey,
    model: process.env['VLM_MODEL'] || defaultModels[provider],
    maxTokens: parseInt(process.env['VLM_MAX_TOKENS'] || '1024', 10),
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',
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

  // Cloud providers require an API key; Ollama runs locally
  if (cfg.provider !== 'ollama' && !cfg.apiKey) {
    throw new Error(
      `VLM API key not configured. Set ${cfg.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} environment variable.`
    )
  }

  switch (cfg.provider) {
    case 'openai':
      return callOpenAi(messages, cfg)
    case 'anthropic':
      return callAnthropic(messages, cfg)
    case 'ollama':
      return callOllama(messages, cfg)
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

// =========================================================================
// Ollama API
// =========================================================================

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
}

interface OllamaResponse {
  model: string
  message: {
    role: string
    content: string
  }
  done: boolean
  total_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

/**
 * Call a local Ollama server for vision-based descriptions.
 * No API key needed — runs entirely on local hardware.
 *
 * Uses the /api/chat endpoint with base64-encoded images.
 * See: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
async function callOllama(
  messages: VlmMessage[],
  config: VlmConfig
): Promise<VlmResponse> {
  const baseUrl = config.ollamaBaseUrl || 'http://localhost:11434'

  // Convert to Ollama message format
  const ollamaMessages: OllamaMessage[] = messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    // For messages with content parts, separate text and images
    const textParts: string[] = []
    const images: string[] = []

    for (const part of msg.content) {
      if (part.type === 'text') {
        textParts.push(part.text)
      } else {
        // Ollama images are raw base64 (no data: URI prefix)
        images.push(part.base64)
      }
    }

    return {
      role: msg.role,
      content: textParts.join('\n'),
      images: images.length > 0 ? images : undefined,
    }
  })

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        num_predict: config.maxTokens,
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const hint = response.status === 404
      ? `Model "${config.model}" not found. Pull it first: ollama pull ${config.model}`
      : `Ollama server error (${response.status})`
    throw new Error(`${hint}: ${body.slice(300)}`)
  }

  const data = (await response.json()) as OllamaResponse

  return {
    content: data.message?.content || '',
    model: data.model,
    usage: {
      inputTokens: data.prompt_eval_count || 0,
      outputTokens: data.eval_count || 0,
    },
  }
}
