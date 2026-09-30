import type { ScreenshotEntry } from '@shared/types'
import { mapPoint, worldOf } from '@shared/worlds'

export interface Count {
  id: string
  count: number
}

export interface SelectionSummary {
  count: number
  bytes: number
  /** Oldest and newest capture time. */
  from: number
  to: number
  favorites: number
  /** Still waiting for their analysis. */
  pending: number
  withMod: number
  withF3: number
  located: number
  worlds: Count[]
  dimensions: Count[]
  biomes: Count[]
  /** Screenshots each mob / structure appears in. */
  mobs: Count[]
  structures: Count[]
  tags: Count[]
  /** Extent of the located screenshots, per dimension (2 or more of them). */
  areas: { dimension: string; count: number; x: [number, number]; z: [number, number] }[]
}

const tally = (m: Map<string, number>, id: string): void => void m.set(id, (m.get(id) ?? 0) + 1)

const sorted = (m: Map<string, number>): Count[] =>
  [...m]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))

/** What several screenshots have in common and how they differ. Pure. */
export function summarizeSelection(shots: ScreenshotEntry[]): SelectionSummary {
  const worlds = new Map<string, number>()
  const dimensions = new Map<string, number>()
  const biomes = new Map<string, number>()
  const mobs = new Map<string, number>()
  const structures = new Map<string, number>()
  const tags = new Map<string, number>()
  const points = new Map<string, { x: number; z: number }[]>()
  const s: SelectionSummary = {
    count: shots.length,
    bytes: 0,
    from: Infinity,
    to: -Infinity,
    favorites: 0,
    pending: 0,
    withMod: 0,
    withF3: 0,
    located: 0,
    worlds: [],
    dimensions: [],
    biomes: [],
    mobs: [],
    structures: [],
    tags: [],
    areas: []
  }
  for (const shot of shots) {
    const a = shot.analysis
    s.bytes += shot.size
    s.from = Math.min(s.from, shot.capturedAt)
    s.to = Math.max(s.to, shot.capturedAt)
    if (shot.meta.favorite) s.favorites++
    if (!a) s.pending++
    if (a?.mod) s.withMod++
    if (a?.hasF3) s.withF3++
    tally(worlds, worldOf(shot).name)
    if (a?.dimension) tally(dimensions, a.dimension.id)
    if (a?.biome) tally(biomes, a.biome.id)
    for (const id of new Set((a?.mobs ?? []).map((m) => m.id))) tally(mobs, id)
    for (const id of new Set((a?.structures ?? []).map((st) => st.id))) tally(structures, id)
    for (const t of shot.meta.tags ?? []) tally(tags, t)
    const p = mapPoint(shot)
    if (p) {
      s.located++
      points.set(p.dimension, [...(points.get(p.dimension) ?? []), p])
    }
  }
  s.worlds = sorted(worlds)
  s.dimensions = sorted(dimensions)
  s.biomes = sorted(biomes)
  s.mobs = sorted(mobs)
  s.structures = sorted(structures)
  s.tags = sorted(tags)
  for (const [dimension, ps] of points) {
    if (ps.length < 2) continue
    const xs = ps.map((p) => Math.floor(p.x))
    const zs = ps.map((p) => Math.floor(p.z))
    s.areas.push({
      dimension,
      count: ps.length,
      x: [Math.min(...xs), Math.max(...xs)],
      z: [Math.min(...zs), Math.max(...zs)]
    })
  }
  s.areas.sort((a, b) => b.count - a.count)
  return s
}
