import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { nativeImage } from 'electron'
import { z } from 'zod'
import type { ScreenshotAnalysis, VisionResult } from '@shared/types'
import { BIOMES } from '@shared/catalog/biomes'
import { MOBS } from '@shared/catalog/mobs'

/** Longest edge sent to the API; larger images are downscaled server-side anyway. */
const MAX_EDGE = 1568

const VisionSchema = z.object({
  description: z.string(),
  dimension: z.enum([
    'minecraft:overworld',
    'minecraft:the_nether',
    'minecraft:the_end',
    'unknown'
  ]),
  biome_id: z.string(),
  biome_confidence: z.number(),
  time_of_day: z.enum(['day', 'sunrise', 'sunset', 'night', 'underground', 'unknown']),
  weather: z.enum(['clear', 'rain', 'thunder', 'snow', 'unknown']),
  mobs: z.array(z.object({ id: z.string(), count: z.number().int() })),
  structures: z.array(z.string())
})

const SYSTEM = [
  'You analyse Minecraft Java Edition screenshots for a screenshot manager used by technical players.',
  'Report only what is visible in the image. Answer every text field in Spanish, but keep ids as vanilla namespaced ids.',
  '',
  'biome_id: the most likely biome the player stands in, chosen from this list (or "unknown"):',
  BIOMES.map((b) => b.id).join(', '),
  'Use terrain, vegetation, grass/foliage/water tint, sky/fog colour and blocks as evidence.',
  'biome_confidence: 0..1, be honest — plains vs meadow or ocean variants are often ambiguous.',
  '',
  "mobs: every living entity clearly visible in the world (not in the HUD, not the player's own hand, not item drops,",
  'not mob heads/spawners/paintings). Group by id with a count. Prefer these ids:',
  MOBS.map((m) => m.id).join(', '),
  'Other players are "minecraft:player". Return an empty list when there are none.',
  '',
  'structures: notable generated or player-made structures (e.g. "aldea", "portal del Nether", "fortaleza del Nether").',
  'description: one short Spanish sentence describing the scene.'
].join('\n')

export class VisionError extends Error {}

/** Asks Claude to identify biome, mobs and context from a screenshot. */
export class VisionService {
  constructor(private readonly apiKey: () => string | null) {}

  private client(): Anthropic {
    const key = this.apiKey()
    if (!key)
      throw new VisionError('Configura tu API key de Anthropic en Ajustes para usar la visión IA.')
    return new Anthropic({ apiKey: key, maxRetries: 2 })
  }

  async test(model: string): Promise<{ ok: boolean; message: string }> {
    try {
      const info = await this.client().models.retrieve(model)
      return { ok: true, message: `Conectado: ${info.display_name}` }
    } catch (err) {
      return { ok: false, message: friendlyError(err) }
    }
  }

  async analyze(
    file: string,
    model: string,
    local: ScreenshotAnalysis | null
  ): Promise<VisionResult> {
    const client = this.client()
    let img = nativeImage.createFromPath(file)
    if (img.isEmpty()) throw new VisionError('No se pudo leer la imagen')
    const { width, height } = img.getSize()
    if (Math.max(width, height) > MAX_EDGE)
      img = img.resize(
        width >= height
          ? { width: MAX_EDGE, quality: 'best' }
          : { height: MAX_EDGE, quality: 'best' }
      )
    const data = img.toJPEG(90).toString('base64')

    // Facts from the F3 overlay make the answer more reliable.
    const context: string[] = []
    if (local?.f3?.dimension)
      context.push(`The F3 overlay says the dimension is ${local.f3.dimension}.`)
    if (local?.f3?.biome) context.push(`The F3 overlay says the biome is ${local.f3.biome}.`)
    if (local?.f3?.targetedEntity) context.push(`The crosshair targets ${local.f3.targetedEntity}.`)
    if (local?.hasF3)
      context.push('Ignore the debug text overlay itself when describing the scene.')

    try {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(VisionSchema) },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
              { type: 'text', text: ['Analyse this screenshot.', ...context].join('\n') }
            ]
          }
        ]
      })
      if (response.stop_reason === 'refusal')
        throw new VisionError('El modelo rechazó analizar esta imagen.')
      const out = response.parsed_output
      if (!out) throw new VisionError('Respuesta vacía del modelo')
      return {
        model: response.model,
        analyzedAt: Date.now(),
        description: out.description,
        biome:
          out.biome_id && out.biome_id !== 'unknown'
            ? { id: out.biome_id, confidence: clamp01(out.biome_confidence) }
            : undefined,
        dimension: out.dimension === 'unknown' ? undefined : out.dimension,
        timeOfDay: out.time_of_day,
        weather: out.weather,
        mobs: out.mobs.filter((m) => m.count > 0),
        structures: out.structures
      }
    } catch (err) {
      if (err instanceof VisionError) throw err
      throw new VisionError(friendlyError(err))
    }
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))
}

function friendlyError(err: unknown): string {
  if (err instanceof VisionError) return err.message
  if (err instanceof Anthropic.AuthenticationError) return 'API key inválida.'
  if (err instanceof Anthropic.PermissionDeniedError)
    return 'La API key no tiene permiso para este modelo.'
  if (err instanceof Anthropic.NotFoundError)
    return 'Modelo no encontrado. Revisa el nombre en Ajustes.'
  if (err instanceof Anthropic.RateLimitError)
    return 'Límite de peticiones alcanzado, inténtalo en un momento.'
  if (err instanceof Anthropic.BadRequestError) return `Petición rechazada: ${err.message}`
  if (err instanceof Anthropic.APIConnectionError) return 'Sin conexión con la API de Anthropic.'
  if (err instanceof Anthropic.APIError) return `Error de la API (${err.status}): ${err.message}`
  return err instanceof Error ? err.message : String(err)
}
