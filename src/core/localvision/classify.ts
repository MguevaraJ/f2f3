import type { RgbaImage } from '../ocr/debugOverlayOcr'
import { estimateScene, type SceneEstimate } from '../vision/sceneHeuristics'
import { MOBS_BY_DIMENSION, type LabelEmbeddings } from './labels'
import { LOCAL_MODEL } from './model'

/**
 * Local "basic" scene recognition: biome and the mob at the crosshair, from a
 * zero-shot CLIP model plus colour sanity checks. Pure logic — the model call is
 * injected, so it is testable without ONNX.
 *
 * Deliberately conservative: it answers only when the model is clearly confident,
 * because a wrong "estimate" is worse than none. Structures are NOT attempted
 * locally: in testing, generic zero-shot models could not tell them apart.
 */

export interface LocalGuess {
  id: string
  confidence: number
}

export interface LocalSceneResult {
  biome: LocalGuess | null
  targetedMob: LocalGuess | null
}

/** Image (CHW float32, normalised) → L2-normalised embedding. */
export type EmbedImage = (pixels: Float32Array) => Promise<Float32Array>

type Region = [x0: number, y0: number, x1: number, y1: number]

/** Frame minus the F3 columns and the hotbar. */
export const SCENE_REGION: Region = [0.2, 0.15, 0.8, 0.8]
/** Around the crosshair, where the targeted mob is. */
export const CROSSHAIR_REGION: Region = [0.37, 0.3, 0.63, 0.72]

const BIOME_MIN = 0.4
const BIOME_MARGIN = 0.15
// Calibrated on real screenshots (npm run eval:local): below this, "detections" were
// mostly dark scenes, portals or water. Precision over recall: a wrong estimate is
// worse than none.
const MOB_MIN = 0.7
const MOB_MARGIN = 0.4
/** Purple particles and dark tall shapes (portals, tunnels) look like endermen to CLIP. */
const MOB_MIN_OVERRIDES: Record<string, number> = { 'minecraft:enderman': 0.85 }
/** Estimates never claim more certainty than this in the UI. */
const MAX_CONFIDENCE = 0.85

/**
 * CLIP preprocessing on a region: cover-resize to 224×224 (area averaging) and
 * normalise with CLIP's mean/std into a CHW float tensor.
 */
export function preprocess(
  img: RgbaImage,
  region: Region,
  size = LOCAL_MODEL.inputSize
): Float32Array {
  const rx0 = Math.round(img.width * region[0])
  const ry0 = Math.round(img.height * region[1])
  const rw = Math.round(img.width * region[2]) - rx0
  const rh = Math.round(img.height * region[3]) - ry0
  // Centre square of the region ("resize shortest side + centre crop").
  const side = Math.min(rw, rh)
  const sx0 = rx0 + Math.floor((rw - side) / 2)
  const sy0 = ry0 + Math.floor((rh - side) / 2)
  const scale = side / size
  const out = new Float32Array(3 * size * size)
  const plane = size * size
  const { mean, std } = LOCAL_MODEL
  for (let y = 0; y < size; y++) {
    const y0 = sy0 + Math.floor(y * scale)
    const y1 = Math.max(y0 + 1, sy0 + Math.floor((y + 1) * scale))
    for (let x = 0; x < size; x++) {
      const x0 = sx0 + Math.floor(x * scale)
      const x1 = Math.max(x0 + 1, sx0 + Math.floor((x + 1) * scale))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * img.width + x0) * 4
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += img.data[i]
          g += img.data[i + 1]
          b += img.data[i + 2]
          n++
        }
      }
      const o = y * size + x
      out[o] = (r / n / 255 - mean[0]) / std[0]
      out[plane + o] = (g / n / 255 - mean[1]) / std[1]
      out[2 * plane + o] = (b / n / 255 - mean[2]) / std[2]
    }
  }
  return out
}

/** Softmax of scaled cosine similarities, like CLIP's zero-shot classifier. */
export function rank(
  embedding: Float32Array,
  group: { ids: string[]; vectors: number[][] },
  logitScale: number
): { id: string; p: number }[] {
  const logits = group.vectors.map(
    (v) => logitScale * v.reduce((s, x, i) => s + x * embedding[i], 0)
  )
  const max = Math.max(...logits)
  const exps = logits.map((l) => Math.exp(l - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return group.ids.map((id, i) => ({ id, p: exps[i] / sum })).sort((a, b) => b.p - a.p)
}

/**
 * Biomes defined by a colour must actually show it: a pink pig must not turn
 * plains into a cherry grove, nor lava make a stronghold "badlands".
 */
export function colourAgrees(biome: string, scene: SceneEstimate): boolean {
  const m = scene.materials
  const f = (k: keyof SceneEstimate['materials']): number => m[k] ?? 0
  switch (biome) {
    case 'minecraft:cherry_grove':
      return f('cherry') >= 0.08
    case 'minecraft:badlands':
      return f('terracotta') >= 0.15
    case 'minecraft:snowy_plains':
      return f('snow') >= 0.2
    case 'minecraft:desert':
    case 'minecraft:beach':
      return f('sand') >= 0.12
    case 'minecraft:ocean':
      return f('water') >= 0.2
    case 'minecraft:mushroom_fields':
      return f('mycelium') >= 0.1
    case 'minecraft:warped_forest':
      return f('warped') >= 0.05
    default:
      return true
  }
}

const dimensionGroup = (dim: string | undefined): 'overworld' | 'nether' | 'end' =>
  dim === 'minecraft:the_nether' ? 'nether' : dim === 'minecraft:the_end' ? 'end' : 'overworld'

export async function classifyScene(
  img: RgbaImage,
  labels: LabelEmbeddings,
  embed: EmbedImage,
  dimension: string | undefined
): Promise<LocalSceneResult> {
  const scene = estimateScene(img, dimension)
  const dim = dimension ?? scene.dimension?.id

  const sceneEmb = await embed(preprocess(img, SCENE_REGION))
  const biomes = rank(sceneEmb, labels.groups[`biome:${dimensionGroup(dim)}`], labels.logitScale)
  const [b1, b2] = biomes
  const biome =
    b1 && b1.p >= BIOME_MIN && b1.p - (b2?.p ?? 0) >= BIOME_MARGIN && colourAgrees(b1.id, scene)
      ? { id: b1.id, confidence: Math.min(MAX_CONFIDENCE, b1.p) }
      : null

  const mobEmb = await embed(preprocess(img, CROSSHAIR_REGION))
  const allowed = new Set([...MOBS_BY_DIMENSION[dimensionGroup(dim)], 'none'])
  const mobs = rank(mobEmb, onlyIds(labels.groups.mob, allowed), labels.logitScale)
  const [m1, m2] = mobs
  const targetedMob =
    m1 &&
    m1.id !== 'none' &&
    m1.p >= (MOB_MIN_OVERRIDES[m1.id] ?? MOB_MIN) &&
    m1.p - (m2?.p ?? 0) >= MOB_MARGIN
      ? { id: m1.id, confidence: Math.min(MAX_CONFIDENCE, m1.p) }
      : null

  return { biome, targetedMob }
}

function onlyIds(
  group: { ids: string[]; vectors: number[][] },
  keep: Set<string>
): { ids: string[]; vectors: number[][] } {
  const idx = group.ids.map((id, i) => (keep.has(id) ? i : -1)).filter((i) => i >= 0)
  return { ids: idx.map((i) => group.ids[i]), vectors: idx.map((i) => group.vectors[i]) }
}
