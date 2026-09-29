import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { VisionProviderId } from '@shared/types'
import { SYSTEM_PROMPT, VISION_JSON_SCHEMA, VisionSchema, type VisionOutput } from './prompt'

/**
 * Advanced-AI providers. Each turns (image, prompt) into the shared VisionOutput.
 * Claude uses the official SDK; OpenAI-compatible, Gemini and Ollama use their
 * public REST APIs (so any OpenAI-compatible server — OpenRouter, LM Studio… — works).
 */

export interface ProviderConfig {
  apiKey: string | null
  model: string
  /** OpenAI-compatible base URL or Ollama URL. */
  baseUrl?: string
}

export interface ImageInput {
  base64: string
  mimeType: 'image/jpeg'
}

export interface VisionProvider {
  id: VisionProviderId
  label: string
  needsKey: boolean
  analyze(
    cfg: ProviderConfig,
    image: ImageInput,
    userText: string
  ): Promise<{ output: VisionOutput; model: string }>
  listModels(cfg: ProviderConfig): Promise<string[]>
}

export class ProviderError extends Error {}

const TIMEOUT_CLOUD = 120_000
const TIMEOUT_LOCAL = 300_000 // local models can be slow on CPU

function parseOutput(text: string): VisionOutput {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new ProviderError('La IA no devolvió un JSON válido')
  }
  const res = VisionSchema.safeParse(data)
  if (!res.success) throw new ProviderError('La respuesta de la IA no tiene el formato esperado')
  return res.data
}

async function http<T>(
  url: string,
  init: RequestInit & { timeout: number },
  who: string
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout) })
  } catch (err) {
    if ((err as Error).name === 'TimeoutError')
      throw new ProviderError(`${who} tardó demasiado en responder`)
    const hint = who.startsWith('Ollama')
      ? '. ¿Está instalado y abierto?'
      : '. Revisa tu conexión a internet.'
    throw new ProviderError(`No se pudo conectar con ${who}${hint}`)
  }
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string } | string
  } | null
  const detail = typeof body?.error === 'string' ? body.error : body?.error?.message
  if (res.status === 401 || res.status === 403)
    throw new ProviderError(`${who}: clave inválida o sin permiso`)
  if (res.status === 404)
    throw new ProviderError(`${who}: modelo no encontrado (${detail ?? 'revisa el nombre'})`)
  if (res.status === 429)
    throw new ProviderError(`${who}: límite de uso alcanzado, inténtalo más tarde`)
  throw new ProviderError(`${who} respondió ${res.status}${detail ? `: ${detail}` : ''}`)
}

const requireKey = (cfg: ProviderConfig, who: string): string => {
  if (!cfg.apiKey) throw new ProviderError(`Falta la clave de ${who}`)
  return cfg.apiKey
}

// ───────────────────────────── Claude ─────────────────────────────

export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5']

const anthropic: VisionProvider = {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  needsKey: true,
  async analyze(cfg, image, userText) {
    const client = new Anthropic({
      apiKey: requireKey(cfg, 'Anthropic'),
      maxRetries: 2,
      timeout: TIMEOUT_CLOUD
    })
    const legacy = cfg.model.startsWith('claude-haiku-4') // no effort / server fallbacks on Haiku 4.5
    try {
      const response = await client.beta.messages.parse({
        model: cfg.model,
        max_tokens: 16000,
        ...(legacy
          ? { output_config: { format: betaZodOutputFormat(VisionSchema) } }
          : {
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default' as const,
              output_config: {
                effort: 'medium' as const,
                format: betaZodOutputFormat(VisionSchema)
              }
            }),
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: image.mimeType, data: image.base64 }
              },
              { type: 'text', text: userText }
            ]
          }
        ]
      })
      if (response.stop_reason === 'refusal')
        throw new ProviderError('El modelo rechazó analizar esta imagen')
      if (!response.parsed_output) throw new ProviderError('Respuesta vacía del modelo')
      return { output: response.parsed_output, model: response.model }
    } catch (err) {
      if (err instanceof ProviderError) throw err
      if (err instanceof Anthropic.AuthenticationError)
        throw new ProviderError('Anthropic: clave inválida')
      if (err instanceof Anthropic.PermissionDeniedError)
        throw new ProviderError('Anthropic: la clave no tiene acceso a este modelo')
      if (err instanceof Anthropic.NotFoundError)
        throw new ProviderError('Anthropic: modelo no encontrado')
      if (err instanceof Anthropic.RateLimitError)
        throw new ProviderError('Anthropic: límite de uso alcanzado')
      if (err instanceof Anthropic.APIConnectionError)
        throw new ProviderError('No se pudo conectar con Anthropic')
      if (err instanceof Anthropic.APIError)
        throw new ProviderError(`Anthropic respondió ${err.status}: ${err.message}`)
      throw err
    }
  },
  async listModels(cfg) {
    const client = new Anthropic({ apiKey: requireKey(cfg, 'Anthropic'), maxRetries: 1 })
    await client.models.retrieve(cfg.model || CLAUDE_MODELS[0]) // validates the key
    return CLAUDE_MODELS
  }
}

// ───────────────────── OpenAI (and compatible servers) ─────────────────────

export const OPENAI_DEFAULT_URL = 'https://api.openai.com/v1'

const openai: VisionProvider = {
  id: 'openai',
  label: 'OpenAI o compatible',
  needsKey: true,
  async analyze(cfg, image, userText) {
    const base = (cfg.baseUrl || OPENAI_DEFAULT_URL).replace(/\/$/, '')
    const body = (format: object): string =>
      JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              {
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` }
              }
            ]
          }
        ],
        response_format: format
      })
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireKey(cfg, 'OpenAI')}`
    }
    type Reply = { model: string; choices: { message: { content: string | null } }[] }
    let reply: Reply
    try {
      reply = await http<Reply>(
        `${base}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: body({
            type: 'json_schema',
            json_schema: { name: 'minecraft_screenshot', strict: true, schema: VISION_JSON_SCHEMA }
          }),
          timeout: TIMEOUT_CLOUD
        },
        'OpenAI'
      )
    } catch (err) {
      // Some compatible servers don't support json_schema: fall back to plain JSON mode.
      if (!(err instanceof ProviderError) || !/respondió 400/.test(err.message)) throw err
      reply = await http<Reply>(
        `${base}/chat/completions`,
        { method: 'POST', headers, body: body({ type: 'json_object' }), timeout: TIMEOUT_CLOUD },
        'OpenAI'
      )
    }
    return {
      output: parseOutput(reply.choices[0]?.message.content ?? ''),
      model: reply.model || cfg.model
    }
  },
  async listModels(cfg) {
    const base = (cfg.baseUrl || OPENAI_DEFAULT_URL).replace(/\/$/, '')
    const res = await http<{ data: { id: string }[] }>(
      `${base}/models`,
      { headers: { Authorization: `Bearer ${requireKey(cfg, 'OpenAI')}` }, timeout: 20_000 },
      'OpenAI'
    )
    return res.data.map((m) => m.id).sort()
  }
}

// ───────────────────────────── Gemini ─────────────────────────────

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta'

const gemini: VisionProvider = {
  id: 'gemini',
  label: 'Gemini (Google)',
  needsKey: true,
  async analyze(cfg, image, userText) {
    const key = requireKey(cfg, 'Gemini')
    const model = cfg.model.replace(/^models\//, '')
    const request = (
      withSchema: boolean
    ): Promise<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }> =>
      http(
        `${GEMINI_URL}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [
              {
                role: 'user',
                parts: [
                  { inline_data: { mime_type: image.mimeType, data: image.base64 } },
                  { text: userText }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              ...(withSchema ? { responseJsonSchema: VISION_JSON_SCHEMA } : {}),
              temperature: 0.2
            }
          }),
          timeout: TIMEOUT_CLOUD
        },
        'Gemini'
      )
    let reply
    try {
      reply = await request(true)
    } catch (err) {
      if (!(err instanceof ProviderError) || !/respondió 400/.test(err.message)) throw err
      reply = await request(false) // older models: JSON mode without schema
    }
    const text = reply.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    return { output: parseOutput(text), model }
  },
  async listModels(cfg) {
    const res = await http<{ models: { name: string; supportedGenerationMethods?: string[] }[] }>(
      `${GEMINI_URL}/models?pageSize=200`,
      { headers: { 'x-goog-api-key': requireKey(cfg, 'Gemini') }, timeout: 20_000 },
      'Gemini'
    )
    return res.models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort()
  }
}

// ───────────────────────────── Ollama ─────────────────────────────

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434'

const ollama: VisionProvider = {
  id: 'ollama',
  label: 'Ollama (local, gratis)',
  needsKey: false,
  async analyze(cfg, image, userText) {
    const base = (cfg.baseUrl || OLLAMA_DEFAULT_URL).replace(/\/$/, '')
    const reply = await http<{ model: string; message?: { content?: string } }>(
      `${base}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          format: VISION_JSON_SCHEMA,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userText, images: [image.base64] }
          ]
        }),
        timeout: TIMEOUT_LOCAL
      },
      `Ollama (${base})`
    )
    return { output: parseOutput(reply.message?.content ?? ''), model: reply.model || cfg.model }
  },
  async listModels(cfg) {
    const base = (cfg.baseUrl || OLLAMA_DEFAULT_URL).replace(/\/$/, '')
    const res = await http<{ models: { name: string }[] }>(
      `${base}/api/tags`,
      { timeout: 10_000 },
      `Ollama (${base})`
    )
    return res.models.map((m) => m.name).sort()
  }
}

export const PROVIDERS: Record<VisionProviderId, VisionProvider> = {
  anthropic,
  openai,
  gemini,
  ollama
}
