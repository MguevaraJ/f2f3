import type { MobInfo, ScreenshotAnalysis, VisionResult } from '@shared/types'
import { mobById } from '@shared/catalog/mobs'
import { normalizeId } from '@shared/catalog/biomes'
import type { MinecraftFont } from './font/minecraftFont'
import { readDebugOverlay, type RgbaImage } from './ocr/debugOverlayOcr'
import { looksLikeDebugScreen, parseF3 } from './f3/parseF3'
import { estimateScene } from './vision/sceneHeuristics'

/** Bump when the local pipeline changes so cached analyses get recomputed. */
export const ANALYSIS_SCHEMA = 4

/**
 * Local (offline) analysis of one screenshot: F3 OCR + parsing, plus the colour
 * heuristics as a fallback for dimension/biome. Pure function — no I/O.
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

  const mobs: MobInfo[] = []
  if (f3?.targetedEntity) {
    mobs.push({
      id: normalizeId(f3.targetedEntity),
      count: 1,
      source: 'f3',
      category: mobById(f3.targetedEntity)?.category ?? 'other'
    })
  }

  return {
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
    dimension: f3?.dimension
      ? { id: f3.dimension, source: 'f3' }
      : scene.dimension
        ? { id: scene.dimension.id, source: 'heuristic' }
        : null,
    biome: f3?.biome
      ? { id: normalizeId(f3.biome), source: 'f3', confidence: 1 }
      : scene.biome
        ? { id: scene.biome.id, source: 'heuristic', confidence: scene.biome.confidence }
        : null,
    mobs,
    vision: null,
    averageColor: scene.averageColor
  }
}

/**
 * Folds a Claude vision result into an analysis. Precedence: F3 > vision > heuristic,
 * since the overlay states facts while the others infer them.
 */
export function mergeVision(
  analysis: ScreenshotAnalysis,
  vision: VisionResult
): ScreenshotAnalysis {
  const next: ScreenshotAnalysis = { ...analysis, vision }
  if (vision.biome && analysis.biome?.source !== 'f3' && analysis.biome?.source !== 'manual')
    next.biome = {
      id: normalizeId(vision.biome.id),
      source: 'vision',
      confidence: vision.biome.confidence
    }
  if (vision.dimension && analysis.dimension?.source !== 'f3')
    next.dimension = { id: normalizeId(vision.dimension), source: 'vision' }

  const mobs = analysis.mobs.filter((m) => m.source !== 'vision')
  for (const v of vision.mobs) {
    const id = normalizeId(v.id)
    const existing = mobs.find((m) => m.id === id)
    if (existing) existing.count = Math.max(existing.count, v.count)
    else
      mobs.push({
        id,
        count: v.count,
        source: 'vision',
        category: mobById(id)?.category ?? 'other'
      })
  }
  next.mobs = mobs
  return next
}

/** Re-applies a previous vision result after a local re-analysis. */
export function withPreviousVision(
  fresh: ScreenshotAnalysis,
  previous: ScreenshotAnalysis | null | undefined
): ScreenshotAnalysis {
  return previous?.vision ? mergeVision(fresh, previous.vision) : fresh
}
