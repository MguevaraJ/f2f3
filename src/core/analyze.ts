import type {
  BiomeInfo,
  LocalVisionResult,
  MobInfo,
  ScreenshotAnalysis,
  StructureInfo,
  VisionResult
} from '@shared/types'
import { mobById } from '@shared/catalog/mobs'
import { normalizeId } from '@shared/catalog/biomes'
import type { MinecraftFont } from './font/minecraftFont'
import { readDebugOverlay, type RgbaImage } from './ocr/debugOverlayOcr'
import { looksLikeDebugScreen, parseF3 } from './f3/parseF3'
import { estimateScene } from './vision/sceneHeuristics'

/** Bump when the local pipeline changes so cached analyses get recomputed. */
export const ANALYSIS_SCHEMA = 5

/**
 * Offline analysis of one screenshot: F3 OCR + parsing and the colour estimate.
 * The on-device model and the advanced AI are added later as extra sources.
 * Pure function — no I/O.
 */
export function analyzeImage(
  img: RgbaImage,
  font: MinecraftFont | null,
  fingerprint: string
): ScreenshotAnalysis {
  const started = performance.now()
  const ocr = font ? readDebugOverlay(font, img) : null
  const hasF3 = !!ocr && looksLikeDebugScreen(ocr.lines)
  const f3 = hasF3 && ocr ? parseF3(ocr.lines) : null
  const scene = estimateScene(img, f3?.dimension)

  return resolveAnalysis({
    schema: ANALYSIS_SCHEMA,
    fingerprint,
    analyzedAt: Date.now(),
    hasF3,
    f3,
    ocr:
      hasF3 && ocr && font
        ? {
            guiScale: ocr.guiScale,
            confidence: ocr.confidence,
            glyphs: ocr.exact + ocr.fuzzy + ocr.failed,
            fontSource: font.source,
            durationMs: Math.round(performance.now() - started)
          }
        : null,
    heuristic: {
      dimension: scene.dimension?.id ?? null,
      biome: scene.biome
    },
    local: null,
    vision: null,
    manualBiome: null,
    dimension: null,
    biome: null,
    mobs: [],
    structures: [],
    averageColor: scene.averageColor
  })
}

const category = (id: string): MobInfo['category'] => mobById(id)?.category ?? 'other'

/**
 * Derives the displayed values from every source, most reliable first:
 * manual > F3 (exact) > advanced AI > on-device model > colour estimate.
 */
export function resolveAnalysis(a: ScreenshotAnalysis): ScreenshotAnalysis {
  const { f3, vision, local, heuristic } = a

  const dimension: ScreenshotAnalysis['dimension'] = f3?.dimension
    ? { id: f3.dimension, source: 'f3' }
    : vision?.dimension
      ? { id: normalizeId(vision.dimension), source: 'vision' }
      : heuristic.dimension
        ? { id: heuristic.dimension, source: 'heuristic' }
        : null

  let biome: BiomeInfo | null = null
  if (a.manualBiome) biome = { id: normalizeId(a.manualBiome), source: 'manual', confidence: 1 }
  else if (f3?.biome) biome = { id: normalizeId(f3.biome), source: 'f3', confidence: 1 }
  else if (vision?.biome)
    biome = {
      id: normalizeId(vision.biome.id),
      source: 'vision',
      confidence: vision.biome.confidence
    }
  else if (local?.biome)
    biome = { id: local.biome.id, source: 'local', confidence: local.biome.confidence }
  else if (heuristic.biome) biome = { ...heuristic.biome, source: 'heuristic' }

  const mobs: MobInfo[] = []
  const add = (id: string, count: number, source: MobInfo['source']): void => {
    const nid = normalizeId(id)
    const existing = mobs.find((m) => m.id === nid)
    if (existing) existing.count = Math.max(existing.count, count)
    else mobs.push({ id: nid, count, source, category: category(nid) })
  }
  if (f3?.targetedEntity) add(f3.targetedEntity, 1, 'f3')
  if (vision) for (const m of vision.mobs) if (m.count > 0) add(m.id, m.count, 'vision')
  // The on-device guess only when nothing better looked at the image.
  if (!vision && local?.targetedMob && !f3?.targetedEntity) add(local.targetedMob.id, 1, 'local')

  const structures: StructureInfo[] = (vision?.structures ?? []).map((id) => ({
    id: normalizeId(id),
    source: 'vision'
  }))

  return { ...a, dimension, biome, mobs, structures }
}

export function withVision(a: ScreenshotAnalysis, vision: VisionResult): ScreenshotAnalysis {
  return resolveAnalysis({ ...a, vision })
}

export function withLocal(a: ScreenshotAnalysis, local: LocalVisionResult): ScreenshotAnalysis {
  return resolveAnalysis({ ...a, local })
}

export function withManualBiome(a: ScreenshotAnalysis, biome: string | null): ScreenshotAnalysis {
  return resolveAnalysis({ ...a, manualBiome: biome })
}

/**
 * Carries the slow/paid sources (AI, on-device model, manual choice) over to a fresh
 * offline re-analysis of the same image.
 */
export function carryOver(
  fresh: ScreenshotAnalysis,
  previous: ScreenshotAnalysis | null | undefined
): ScreenshotAnalysis {
  if (!previous) return fresh
  return resolveAnalysis({
    ...fresh,
    vision: previous.vision ? normalizeVision(previous.vision) : null,
    local: previous.local ?? null,
    manualBiome:
      previous.manualBiome ?? (previous.biome?.source === 'manual' ? previous.biome.id : null)
  })
}

/** Older cached AI results stored free-text structure names. */
function normalizeVision(v: VisionResult): VisionResult {
  return {
    ...v,
    structures: (v.structures ?? []).filter((s) => /^[a-z0-9_.-]+:[a-z0-9_/.-]+$/.test(s))
  }
}
