import { nativeImage } from 'electron'
import { normalizeId } from '@shared/catalog/biomes'
import { isKnownStructure } from '@shared/catalog/structures'
import type { ScreenshotAnalysis, VisionProviderId, VisionResult } from '@shared/types'
import { userPrompt } from './prompt'
import { PROVIDERS, ProviderError, type ProviderConfig } from './providers'

export class VisionError extends Error {}

const MAX_EDGE: Record<VisionProviderId, number> = {
  anthropic: 1568,
  openai: 1536,
  gemini: 1536,
  ollama: 1024
}

export interface VisionConfigSource {
  provider(): VisionProviderId
  config(provider: VisionProviderId): ProviderConfig
}

/** Advanced analysis (level 3): biome, mobs, structures, weather… through the chosen provider. */
export class VisionService {
  constructor(private readonly source: VisionConfigSource) {}

  /** Provider chosen, model picked and key present (when the provider needs one). */
  isReady(): boolean {
    const id = this.source.provider()
    const cfg = this.source.config(id)
    return !!cfg.model && (!PROVIDERS[id].needsKey || !!cfg.apiKey)
  }

  async test(
    provider = this.source.provider()
  ): Promise<{ ok: boolean; message: string; models: string[] }> {
    try {
      const models = await PROVIDERS[provider].listModels(this.source.config(provider))
      const model = this.source.config(provider).model
      const note =
        model && !models.includes(model) ? ` (el modelo "${model}" no aparece en la lista)` : ''
      return {
        ok: true,
        message: `Conectado a ${PROVIDERS[provider].label}: ${models.length} modelos${note}`,
        models
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err), models: [] }
    }
  }

  async listModels(provider: VisionProviderId): Promise<string[]> {
    return PROVIDERS[provider].listModels(this.source.config(provider))
  }

  async analyze(file: string, local: ScreenshotAnalysis | null): Promise<VisionResult> {
    const providerId = this.source.provider()
    const provider = PROVIDERS[providerId]
    const cfg = this.source.config(providerId)
    if (!cfg.model) throw new VisionError('Elige un modelo para la IA avanzada en Ajustes')
    if (provider.needsKey && !cfg.apiKey)
      throw new VisionError(`Configura tu clave de ${provider.label} en Ajustes`)

    let img = nativeImage.createFromPath(file)
    if (img.isEmpty()) throw new VisionError('No se pudo leer la imagen')
    const { width, height } = img.getSize()
    const edge = MAX_EDGE[providerId]
    if (Math.max(width, height) > edge)
      img = img.resize(
        width >= height ? { width: edge, quality: 'best' } : { height: edge, quality: 'best' }
      )
    const image = { base64: img.toJPEG(90).toString('base64'), mimeType: 'image/jpeg' as const }

    // Facts from the F3 overlay make answers more reliable.
    const facts: string[] = []
    if (local?.f3?.dimension)
      facts.push(`The F3 overlay says the dimension is ${local.f3.dimension}.`)
    if (local?.f3?.biome) facts.push(`The F3 overlay says the biome is ${local.f3.biome}.`)
    if (local?.f3?.targetedEntity) facts.push(`The crosshair targets ${local.f3.targetedEntity}.`)
    if (local?.hasF3) facts.push('Ignore the debug text overlay itself when describing the scene.')

    try {
      const { output, model } = await provider.analyze(cfg, image, userPrompt(facts))
      return {
        provider: providerId,
        model,
        analyzedAt: Date.now(),
        description: output.description,
        biome:
          output.biome_id && output.biome_id !== 'unknown'
            ? { id: normalizeId(output.biome_id), confidence: clamp01(output.biome_confidence) }
            : undefined,
        dimension: output.dimension === 'unknown' ? undefined : output.dimension,
        timeOfDay: output.time_of_day,
        weather: output.weather,
        mobs: output.mobs
          .filter((m) => m.count > 0)
          .map((m) => ({ id: normalizeId(m.id), count: m.count })),
        // Only catalogued ids: free text from the model would break filters and names.
        structures: [...new Set(output.structures.map(normalizeId).filter(isKnownStructure))]
      }
    } catch (err) {
      if (err instanceof ProviderError || err instanceof VisionError)
        throw new VisionError(err.message)
      throw new VisionError(err instanceof Error ? err.message : String(err))
    }
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))
}
