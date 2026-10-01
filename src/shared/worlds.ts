import type { AppSettings, DimensionId, ScreenshotEntry } from './types'

/**
 * Which Minecraft world a screenshot belongs to, most reliable first:
 * the user's choice, the world the Companion mod recorded, the top folder.
 */
export type WorldSource = 'manual' | 'mod' | 'folder' | 'none'

export const NO_WORLD = ''

export function worldOf(e: ScreenshotEntry): { name: string; source: WorldSource } {
  if (e.meta.world) return { name: e.meta.world, source: 'manual' }
  const mod = e.analysis?.mod
  if (mod?.world.name) return { name: mod.world.name, source: 'mod' }
  // With several game folders the first segment names the game folder, not a world.
  const top = e.folder.split('/')[e.source ? 1 : 0]
  if (top) return { name: top, source: 'folder' }
  return { name: NO_WORLD, source: 'none' }
}

export interface WorldSummary {
  name: string
  count: number
  /** Screenshots with coordinates (the ones a map can place). */
  located: number
  seed?: string
  seedSource?: 'manual' | 'mod'
}

/** Seed of a world: typed by the user, or recorded by the mod in any of its screenshots. */
export function seedOf(
  name: string,
  entries: ScreenshotEntry[],
  seeds: AppSettings['worldSeeds'] | undefined
): { seed: string; source: 'manual' | 'mod' } | null {
  const manual = seeds?.[name]
  if (manual) return { seed: manual, source: 'manual' }
  for (const e of entries) {
    const s = e.analysis?.mod?.world.seed
    if (s && worldOf(e).name === name) return { seed: s, source: 'mod' }
  }
  return null
}

/** Every world with screenshots, the busiest first; "no world" last. */
export function listWorlds(
  entries: ScreenshotEntry[],
  seeds: AppSettings['worldSeeds'] | undefined
): WorldSummary[] {
  const map = new Map<string, WorldSummary>()
  for (const e of entries) {
    const { name } = worldOf(e)
    const w = map.get(name) ?? { name, count: 0, located: 0 }
    w.count++
    if (e.analysis?.location?.block) w.located++
    if (!w.seed) {
      const s = seeds?.[name] ?? e.analysis?.mod?.world.seed
      if (s) {
        w.seed = s
        w.seedSource = seeds?.[name] ? 'manual' : 'mod'
      }
    }
    map.set(name, w)
  }
  return [...map.values()].sort(
    (a, b) => Number(a.name === NO_WORLD) - Number(b.name === NO_WORLD) || b.located - a.located
  )
}

/** A screenshot placed on the map of one dimension. */
export interface MapPoint {
  id: string
  x: number
  y: number
  z: number
  dimension: DimensionId
}

export function mapPoint(e: ScreenshotEntry): MapPoint | null {
  const loc = e.analysis?.location
  const b = loc?.block
  const dim = e.analysis?.dimension?.id ?? loc?.dimension
  if (!b || !dim) return null
  const p = loc.position ?? b
  return { id: e.id, x: p.x, y: p.y, z: p.z, dimension: dim }
}
