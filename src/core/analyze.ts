import type {
  BiomeInfo,
  CompanionData,
  LocationData,
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
import { companionLocation, companionStructures } from './companion/parseCompanion'

/** Bump when the local pipeline changes so cached analyses get recomputed. */
export const ANALYSIS_SCHEMA = 8

/**
 * Offline analysis of one screenshot: Companion mod sidecar, F3 OCR + parsing and the colour estimate.
 * The on-device model and the advanced AI are added later as extra sources.
 * Pure function — no I/O.
 */
export function analyzeImage(
  img: RgbaImage,
  font: MinecraftFont | null,
  fingerprint: string,
  mod: CompanionData | null = null
): ScreenshotAnalysis {
  const started = performance.now()
  const ocr = font ? readDebugOverlay(font, img) : null
  const hasF3 = !!ocr && looksLikeDebugScreen(ocr.lines)
  const f3 = hasF3 && ocr ? parseF3(ocr.lines) : null
  const scene = estimateScene(img, mod?.world.dimension ?? f3?.dimension)

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
    mod,
    heuristic: {
      dimension: scene.dimension?.id ?? null,
      biome: scene.biome
    },
    local: null,
    vision: null,
    manualBiome: null,
    location: null,
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
 * manual > Companion mod (exact) > F3 (exact) > advanced AI > on-device model > colour estimate.
 */
export function resolveAnalysis(a: ScreenshotAnalysis): ScreenshotAnalysis {
  const { f3, vision, local, heuristic } = a
  // Analyses cached before the mod existed lack the field.
  const mod = a.mod ?? null

  const dimension: ScreenshotAnalysis['dimension'] = mod
    ? { id: mod.world.dimension, source: 'mod' }
    : f3?.dimension
      ? { id: f3.dimension, source: 'f3' }
      : vision?.dimension
        ? { id: normalizeId(vision.dimension), source: 'vision' }
        : heuristic.dimension
          ? { id: heuristic.dimension, source: 'heuristic' }
          : null

  let biome: BiomeInfo | null = null
  if (a.manualBiome) biome = { id: normalizeId(a.manualBiome), source: 'manual', confidence: 1 }
  else if (mod) biome = { id: mod.biome, source: 'mod', confidence: 1 }
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
  if (mod) {
    // Exact list of what is in the picture: other sources could only add guesses.
    for (const e of mod.entities) add(e.id, e.count, 'mod')
    if (mod.target.entity) add(mod.target.entity.id, 1, 'mod')
  } else {
    if (f3?.targetedEntity) add(f3.targetedEntity, 1, 'f3')
    if (vision) for (const m of vision.mobs) if (m.count > 0) add(m.id, m.count, 'vision')
    // The on-device guess only when nothing better looked at the image.
    if (!vision && local?.targetedMob && !f3?.targetedEntity) add(local.targetedMob.id, 1, 'local')
  }

  // The mod knows the structures the player is in or looking at; the AI can
  // still spot distant ones in the picture.
  const structures: StructureInfo[] = (mod ? (companionStructures(mod) ?? []) : []).map((id) => ({
    id,
    source: 'mod'
  }))
  for (const id of vision?.structures ?? []) {
    const nid = normalizeId(id)
    if (!structures.some((s) => s.id === nid)) structures.push({ id: nid, source: 'vision' })
  }

  return { ...a, mod, dimension, biome, mobs, structures, location: resolveLocation(mod, f3) }
}

/** Mod data first; the F3 fills what the mod does not report (fluid, local difficulty…). */
function resolveLocation(
  mod: CompanionData | null,
  f3: ScreenshotAnalysis['f3']
): LocationData | null {
  const fromF3: LocationData | null =
    f3?.block || f3?.position
      ? {
          source: 'f3',
          dimension: f3.dimension,
          position: f3.position,
          block: f3.block,
          chunk: f3.chunk,
          chunkRelative: f3.chunkRelative,
          region: f3.region,
          facing: f3.facing,
          light: f3.light,
          localDifficulty: f3.localDifficulty,
          targetedBlock: f3.targetedBlock,
          targetedFluid: f3.targetedFluid,
          targetedEntity: f3.targetedEntity
        }
      : null
  if (!mod) return fromF3
  const loc = companionLocation(mod)
  if (!fromF3) return loc
  const f3Target = fromF3.targetedBlock
  const sameTarget =
    f3Target &&
    loc.targetedBlock &&
    JSON.stringify(f3Target.pos) === JSON.stringify(loc.targetedBlock.pos)
  return {
    ...loc,
    // The mod has the id; the F3 adds the block state and tags it showed.
    targetedBlock: sameTarget ? { ...f3Target, ...loc.targetedBlock } : loc.targetedBlock,
    light: loc.light && { ...loc.light, client: fromF3.light?.client },
    localDifficulty: fromF3.localDifficulty,
    targetedFluid: fromF3.targetedFluid
  }
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
