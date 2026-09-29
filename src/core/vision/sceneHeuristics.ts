import type { RgbaImage } from '../ocr/debugOverlayOcr'

/**
 * Offline, dependency-free scene estimation from colour statistics.
 *
 * It is deliberately modest: it recognises the dominant material palettes
 * (sand, snow, water, netherrack, warped/crimson nylium, end stone, …) and maps
 * them to a biome/dimension guess with a low confidence. The F3 overlay or the
 * Claude vision analysis always take precedence over this.
 */

export interface SceneEstimate {
  averageColor: string
  dimension: { id: string; confidence: number } | null
  biome: { id: string; confidence: number } | null
  /** Share of each material class in the sampled area (0..1), for debugging/tuning. */
  materials: Record<Material, number>
}

type Material =
  | 'sand'
  | 'snow'
  | 'water'
  | 'grass'
  | 'jungle'
  | 'foliageDark'
  | 'netherrack'
  | 'crimson'
  | 'warped'
  | 'soul'
  | 'basalt'
  | 'endStone'
  | 'terracotta'
  | 'sky'
  | 'dark'
  | 'mycelium'
  | 'cherry'

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max ? d / max : 0, max]
}

function classify(h: number, s: number, v: number): Material | null {
  if (v < 0.12) return 'dark'
  if (s < 0.12 && v > 0.82) return 'snow'
  if (h >= 190 && h <= 225 && s > 0.25 && s < 0.6 && v > 0.7) return 'sky'
  if (h >= 200 && h <= 250 && s > 0.45 && v > 0.25) return 'water'
  if (h >= 40 && h <= 58 && s > 0.18 && s < 0.45 && v > 0.72) return 'sand'
  if (h >= 50 && h <= 65 && s > 0.15 && s < 0.4 && v > 0.55 && v <= 0.72) return 'endStone'
  if (h >= 300 && h <= 345 && s > 0.15 && s < 0.5 && v > 0.65) return 'cherry'
  if (h >= 260 && h <= 310 && s > 0.1 && s < 0.4 && v > 0.3 && v < 0.65) return 'mycelium'
  if (h >= 165 && h <= 190 && s > 0.45 && v > 0.25) return 'warped'
  if ((h >= 345 || h <= 8) && s > 0.65 && v > 0.3) return 'crimson'
  if ((h >= 350 || h <= 15) && s > 0.35 && v > 0.15 && v < 0.6) return 'netherrack'
  if (h >= 15 && h <= 35 && s > 0.45 && v > 0.45) return 'terracotta'
  if (h >= 15 && h <= 35 && s > 0.3 && s < 0.6 && v > 0.12 && v < 0.35) return 'soul'
  if (s < 0.12 && v > 0.12 && v < 0.35) return 'basalt'
  if (h >= 70 && h <= 150 && s > 0.55 && v > 0.35) return 'jungle'
  if (h >= 65 && h <= 150 && s > 0.3 && v > 0.3) return 'grass'
  if (h >= 60 && h <= 170 && s > 0.3 && v > 0.12) return 'foliageDark'
  return null
}

export function estimateScene(img: RgbaImage, knownDimension?: string): SceneEstimate {
  const materials = {} as Record<Material, number>
  let total = 0
  let sr = 0
  let sg = 0
  let sb = 0
  // Sample the centre of the frame: skips the F3 columns and the hotbar.
  const x0 = Math.floor(img.width * 0.22)
  const x1 = Math.floor(img.width * 0.78)
  const y0 = Math.floor(img.height * 0.12)
  const y1 = Math.floor(img.height * 0.8)
  const step = Math.max(2, Math.floor(img.width / 240))
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * img.width + x) * 4
      const r = img.data[i]
      const g = img.data[i + 1]
      const b = img.data[i + 2]
      sr += r
      sg += g
      sb += b
      total++
      const mat = classify(...rgbToHsv(r, g, b))
      if (mat) materials[mat] = (materials[mat] ?? 0) + 1
    }
  }
  for (const k of Object.keys(materials) as Material[]) materials[k] /= total || 1
  const f = (k: Material): number => materials[k] ?? 0
  const hex = (n: number): string =>
    Math.round(n / (total || 1))
      .toString(16)
      .padStart(2, '0')
  const averageColor = `#${hex(sr)}${hex(sg)}${hex(sb)}`

  // Dimension
  let dimension: SceneEstimate['dimension'] = null
  const netherScore = f('netherrack') + f('crimson') + f('warped') * 0.8 + f('soul') * 0.6
  const endScore = f('endStone') + (f('endStone') > 0.08 ? f('dark') * 0.5 : 0)
  const overScore =
    f('grass') + f('jungle') + f('foliageDark') + f('sky') + f('water') + f('sand') + f('snow')
  if (knownDimension) dimension = { id: knownDimension, confidence: 1 }
  else if (netherScore > 0.25 && netherScore > overScore)
    dimension = { id: 'minecraft:the_nether', confidence: 0.55 }
  else if (endScore > 0.2 && endScore > overScore)
    dimension = { id: 'minecraft:the_end', confidence: 0.5 }
  else if (overScore > 0.15) dimension = { id: 'minecraft:overworld', confidence: 0.45 }

  // Biome
  let biome: SceneEstimate['biome'] = null
  const pick = (id: string, confidence: number): void => {
    biome = { id: `minecraft:${id}`, confidence }
  }
  const dim = dimension?.id
  if (dim === 'minecraft:the_nether') {
    if (f('warped') > 0.12) pick('warped_forest', 0.45)
    else if (f('crimson') > 0.12) pick('crimson_forest', 0.4)
    else if (f('soul') > 0.25) pick('soul_sand_valley', 0.35)
    else if (f('basalt') > 0.3) pick('basalt_deltas', 0.35)
    else pick('nether_wastes', 0.35)
  } else if (dim === 'minecraft:the_end') {
    pick(f('endStone') > 0.3 ? 'end_highlands' : 'the_end', 0.3)
  } else if (dim === 'minecraft:overworld') {
    const greens = f('grass') + f('jungle') + f('foliageDark')
    if (f('mycelium') > 0.25) pick('mushroom_fields', 0.35)
    else if (f('cherry') > 0.12) pick('cherry_grove', 0.4)
    else if (f('terracotta') > 0.25) pick('badlands', 0.4)
    else if (f('snow') > 0.3) pick(greens > 0.1 ? 'snowy_taiga' : 'snowy_plains', 0.35)
    else if (f('sand') > 0.3 && f('water') > 0.08) pick('beach', 0.35)
    else if (f('sand') > 0.3) pick('desert', 0.4)
    else if (f('water') > 0.35) pick('ocean', 0.3)
    else if (f('jungle') > 0.3) pick('jungle', 0.3)
    else if (f('foliageDark') > 0.3) pick('forest', 0.25)
    else if (greens > 0.2) pick('plains', 0.25)
  }

  return { averageColor, dimension, biome, materials }
}
