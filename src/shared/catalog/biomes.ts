import { getLang } from '../i18n'

/** Vanilla biomes with their official Spanish names and a representative colour for UI chips. */
export type BiomeDimension = 'overworld' | 'nether' | 'end'

export interface BiomeDef {
  id: string
  name: string
  dimension: BiomeDimension
  color: string
}

/** The catalog's Spanish name, or the id made readable when the app is in English ("dark_forest" → "Dark Forest"). */
export const localName = (id: string, spanish: string): string =>
  getLang() === 'en' ? prettifyId(id) : spanish

const b = (id: string, name: string, dimension: BiomeDimension, color: string): BiomeDef => ({
  id: `minecraft:${id}`,
  // A getter: the main process loads this module before it knows the language.
  get name() {
    return localName(id, name)
  },
  dimension,
  color
})

export const BIOMES: BiomeDef[] = [
  b('plains', 'Llanura', 'overworld', '#8db360'),
  b('sunflower_plains', 'Llanura de girasoles', 'overworld', '#b5db88'),
  b('snowy_plains', 'Llanura nevada', 'overworld', '#e8f0f5'),
  b('ice_spikes', 'Picos de hielo', 'overworld', '#b4dcdc'),
  b('desert', 'Desierto', 'overworld', '#fa9418'),
  b('swamp', 'Pantano', 'overworld', '#4c763c'),
  b('mangrove_swamp', 'Manglar', 'overworld', '#67783a'),
  b('forest', 'Bosque', 'overworld', '#056621'),
  b('flower_forest', 'Bosque de flores', 'overworld', '#2d8e49'),
  b('birch_forest', 'Bosque de abedules', 'overworld', '#307444'),
  b('dark_forest', 'Bosque oscuro', 'overworld', '#40511a'),
  b('pale_garden', 'Jardín pálido', 'overworld', '#8c8f88'),
  b('old_growth_birch_forest', 'Bosque de abedules ancestral', 'overworld', '#589c6c'),
  b('old_growth_pine_taiga', 'Taiga de pinos ancestral', 'overworld', '#596651'),
  b('old_growth_spruce_taiga', 'Taiga de abetos ancestral', 'overworld', '#818e79'),
  b('taiga', 'Taiga', 'overworld', '#0b6659'),
  b('snowy_taiga', 'Taiga nevada', 'overworld', '#31554a'),
  b('savanna', 'Sabana', 'overworld', '#bdb25f'),
  b('savanna_plateau', 'Meseta de sabana', 'overworld', '#a79d64'),
  b('windswept_hills', 'Colinas ventosas', 'overworld', '#606060'),
  b('windswept_gravelly_hills', 'Colinas de grava ventosas', 'overworld', '#888888'),
  b('windswept_forest', 'Bosque ventoso', 'overworld', '#507050'),
  b('windswept_savanna', 'Sabana ventosa', 'overworld', '#e5da87'),
  b('jungle', 'Jungla', 'overworld', '#537b09'),
  b('sparse_jungle', 'Jungla dispersa', 'overworld', '#628b17'),
  b('bamboo_jungle', 'Jungla de bambú', 'overworld', '#768e14'),
  b('badlands', 'Tierras baldías', 'overworld', '#d94515'),
  b('eroded_badlands', 'Tierras baldías erosionadas', 'overworld', '#ff6d3d'),
  b('wooded_badlands', 'Tierras baldías boscosas', 'overworld', '#b09765'),
  b('meadow', 'Pradera', 'overworld', '#83bb6d'),
  b('cherry_grove', 'Cerezal', 'overworld', '#f5b4cf'),
  b('grove', 'Arboleda', 'overworld', '#bfd8c8'),
  b('snowy_slopes', 'Laderas nevadas', 'overworld', '#dfe8ef'),
  b('frozen_peaks', 'Picos helados', 'overworld', '#a0b4d8'),
  b('jagged_peaks', 'Picos escarpados', 'overworld', '#dcdcdc'),
  b('stony_peaks', 'Picos rocosos', 'overworld', '#7b8b8b'),
  b('river', 'Río', 'overworld', '#0000ff'),
  b('frozen_river', 'Río helado', 'overworld', '#a0a0ff'),
  b('beach', 'Playa', 'overworld', '#fade55'),
  b('snowy_beach', 'Playa nevada', 'overworld', '#faf0c0'),
  b('stony_shore', 'Costa rocosa', 'overworld', '#a2a284'),
  b('warm_ocean', 'Océano cálido', 'overworld', '#0000ac'),
  b('lukewarm_ocean', 'Océano templado', 'overworld', '#000090'),
  b('deep_lukewarm_ocean', 'Océano templado profundo', 'overworld', '#000040'),
  b('ocean', 'Océano', 'overworld', '#000070'),
  b('deep_ocean', 'Océano profundo', 'overworld', '#000030'),
  b('cold_ocean', 'Océano frío', 'overworld', '#202070'),
  b('deep_cold_ocean', 'Océano frío profundo', 'overworld', '#202038'),
  b('frozen_ocean', 'Océano helado', 'overworld', '#7070d6'),
  b('deep_frozen_ocean', 'Océano helado profundo', 'overworld', '#404090'),
  b('mushroom_fields', 'Campos de champiñones', 'overworld', '#ff00ff'),
  b('dripstone_caves', 'Cuevas de espeleotemas', 'overworld', '#866043'),
  b('lush_caves', 'Cuevas frondosas', 'overworld', '#7ba331'),
  b('deep_dark', 'Oscuridad profunda', 'overworld', '#0f252f'),
  b('nether_wastes', 'Desiertos del Nether', 'nether', '#bf3b3b'),
  b('crimson_forest', 'Bosque carmesí', 'nether', '#dd0808'),
  b('warped_forest', 'Bosque distorsionado', 'nether', '#49907b'),
  b('soul_sand_valley', 'Valle de arena de almas', 'nether', '#5e3830'),
  b('basalt_deltas', 'Deltas de basalto', 'nether', '#403636'),
  b('the_end', 'El End', 'end', '#8080ff'),
  b('end_highlands', 'Tierras altas del End', 'end', '#b5b577'),
  b('end_midlands', 'Tierras medias del End', 'end', '#c9c98a'),
  b('small_end_islands', 'Islas pequeñas del End', 'end', '#9e9e6a'),
  b('end_barrens', 'Tierras áridas del End', 'end', '#707050'),
  b('the_void', 'El vacío', 'overworld', '#000000')
]

const byId = new Map(BIOMES.map((x) => [x.id, x]))

export function normalizeId(id: string): string {
  const clean = id.trim().toLowerCase().replace(/\s+/g, '_')
  return clean.includes(':') ? clean : `minecraft:${clean}`
}

export function biomeById(id: string | undefined | null): BiomeDef | undefined {
  return id ? byId.get(normalizeId(id)) : undefined
}

/** Readable name for any biome id, including modded ones ("terralith:alpha_islands" → "Alpha Islands"). */
export function biomeName(id: string): string {
  return biomeById(id)?.name ?? prettifyId(id)
}

export function prettifyId(id: string): string {
  const path = id.split(':').pop() ?? id
  return path
    .split(/[_/]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

export const DIMENSIONS: Record<string, { name: string; color: string }> = {
  'minecraft:overworld': { name: 'Overworld', color: '#5b8731' },
  'minecraft:the_nether': { name: 'Nether', color: '#8b2a1f' },
  'minecraft:the_end': { name: 'The End', color: '#b8b86b' }
}

export function dimensionName(id: string): string {
  return DIMENSIONS[normalizeId(id)]?.name ?? prettifyId(id)
}
