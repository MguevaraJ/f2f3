import type { Vec3 } from './types'

/**
 * Technical planners for the map: where to AFK so farms keep working, and how
 * Nether portals link. Pure; mechanics checked against the 26.3 bytecode
 * (NaturalSpawner, ChunkMap, DistanceManager, PortalForcer).
 */

// ── AFK spot ──

/** Mobs never spawn closer than this to a player (sphere). */
export const NO_SPAWN_RADIUS = 24
/** Mobs farther than this from every player despawn at once (sphere). */
export const DESPAWN_RADIUS = 128
/** A chunk only spawns mobs while its centre is this close to a player (horizontal). */
export const SPAWN_CHUNK_RADIUS = 128
/** Vanilla default simulation distance in singleplayer. */
export const DEFAULT_SIMULATION = 12

/** A farm to keep running; `y` null when only X/Z are known. */
export interface Farm {
  x: number
  y: number | null
  z: number
}

export interface FarmStatus {
  /** 3D distance to the AFK spot (horizontal when the farm's Y is unknown). */
  distance: number
  /** Chebyshev distance in chunks between the two chunks. */
  chunks: number
  /** Entities move and mobs work: chunk within the simulation distance. */
  entities: boolean
  /** Redstone, crops and random ticks: one chunk more than entities. */
  blocks: boolean
  /** Natural spawning: entity-ticking chunk whose centre is within 128 blocks. */
  spawning: boolean
  /** Position against the 24–128 spawning sphere. */
  sphere: 'too-close' | 'inside' | 'outside'
}

const chunkOf = (v: number): number => Math.floor(v / 16)

export function farmStatus(afk: Vec3, farm: Farm, simulation: number): FarmStatus {
  const dx = farm.x - afk.x
  const dz = farm.z - afk.z
  const dy = farm.y === null ? 0 : farm.y - afk.y
  const distance = Math.hypot(dx, dy, dz)
  const cx = chunkOf(farm.x)
  const cz = chunkOf(farm.z)
  const chunks = Math.max(Math.abs(cx - chunkOf(afk.x)), Math.abs(cz - chunkOf(afk.z)))
  const entities = chunks <= simulation
  const centre = Math.hypot(cx * 16 + 8 - afk.x, cz * 16 + 8 - afk.z)
  return {
    distance,
    chunks,
    entities,
    blocks: chunks <= simulation + 1,
    spawning: entities && centre < SPAWN_CHUNK_RADIUS,
    sphere:
      distance < NO_SPAWN_RADIUS ? 'too-close' : distance <= DESPAWN_RADIUS ? 'inside' : 'outside'
  }
}

/** Mob farms need the 24–128 sphere; the rest only need their chunks loaded. */
export type FarmKind = 'mobs' | 'load'

export const farmWorks = (s: FarmStatus, kind: FarmKind): boolean =>
  kind === 'mobs' ? s.spawning && s.sphere === 'inside' : s.blocks

/** Centre of the smallest sphere around the points (Bădoiu–Clarkson, close enough in blocks). */
function minimaxCentre(points: Vec3[]): Vec3 {
  let c = { ...points[0] }
  for (let i = 1; i <= 4000; i++) {
    let far = points[0]
    let best = -1
    for (const p of points) {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2
      if (d > best) [best, far] = [d, p]
    }
    const k = 1 / (i + 1)
    c = { x: c.x + (far.x - c.x) * k, y: c.y + (far.y - c.y) * k, z: c.z + (far.z - c.z) * k }
  }
  return c
}

/** Margin kept over the 24-block no-spawn sphere when lifting the spot. */
const LIFT_TO = NO_SPAWN_RADIUS + 2

/**
 * Best AFK spot for the farms: the centre of the smallest sphere around them for mob
 * farms (raised above them when a farm would fall inside the 24-block sphere), or the
 * middle chunk for the rest. Block coordinates; null without farms.
 */
export function bestAfkSpot(farms: Farm[], kind: FarmKind): Vec3 | null {
  if (!farms.length) return null
  const known = farms.filter((f) => f.y !== null).map((f) => f.y!)
  const y0 = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 64
  const pts = farms.map((f) => ({ x: f.x, y: f.y ?? y0, z: f.z }))
  if (kind === 'load') {
    const cxs = pts.map((p) => chunkOf(p.x))
    const czs = pts.map((p) => chunkOf(p.z))
    const mid = (a: number[]): number => Math.floor((Math.min(...a) + Math.max(...a)) / 2)
    return { x: mid(cxs) * 16 + 8, y: Math.round(y0), z: mid(czs) * 16 + 8 }
  }
  const c = minimaxCentre(pts)
  let y = c.y
  for (const p of pts) {
    const h = Math.hypot(p.x - c.x, p.z - c.z)
    if (h < LIFT_TO) y = Math.max(y, p.y + Math.sqrt(LIFT_TO ** 2 - h ** 2))
  }
  return { x: Math.floor(c.x), y: Math.ceil(y), z: Math.floor(c.z) }
}

// ── Nether portals ──

export type PortalDimension = 'minecraft:overworld' | 'minecraft:the_nether'

export const isPortalDimension = (d: string): d is PortalDimension =>
  d === 'minecraft:overworld' || d === 'minecraft:the_nether'

export const otherPortalDimension = (d: PortalDimension): PortalDimension =>
  d === 'minecraft:overworld' ? 'minecraft:the_nether' : 'minecraft:overworld'

/** Half side of the square searched for an existing portal, in the destination. */
export const PORTAL_SEARCH_RADIUS: Record<PortalDimension, number> = {
  'minecraft:the_nether': 16,
  'minecraft:overworld': 128
}

export interface PortalExit {
  dimension: PortalDimension
  /** Where the game starts looking: coordinates scaled ×8 or ÷8, same Y. */
  pos: Vec3
  radius: number
}

export function portalExit(pos: Vec3, from: PortalDimension): PortalExit {
  const to = otherPortalDimension(from)
  const scale = from === 'minecraft:overworld' ? 1 / 8 : 8
  return {
    dimension: to,
    pos: { x: Math.floor(pos.x * scale), y: pos.y, z: Math.floor(pos.z * scale) },
    radius: PORTAL_SEARCH_RADIUS[to]
  }
}

export interface PortalRef {
  id: string
  pos: Vec3
}

export const inSearchArea = (exit: PortalExit, p: Vec3): boolean =>
  Math.abs(p.x - exit.pos.x) <= exit.radius && Math.abs(p.z - exit.pos.z) <= exit.radius

const dist2 = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2

/**
 * The portal a trip lands in: among the destination's portals inside the search square
 * (whole height), the closest in 3D, then the lowest. Null means a new one is built.
 */
export function linkedPortal(exit: PortalExit, candidates: PortalRef[]): PortalRef | null {
  let best: PortalRef | null = null
  for (const c of candidates) {
    if (!inSearchArea(exit, c.pos)) continue
    const d = dist2(c.pos, exit.pos)
    const bd = best ? dist2(best.pos, exit.pos) : Infinity
    if (d < bd || (d === bd && c.pos.y < best!.pos.y)) best = c
  }
  return best
}

export interface PortalPair {
  /** A → B: where going through A lands (B when the link works). */
  forward: PortalRef | null
  /** B → A: where coming back through B lands. */
  back: PortalRef | null
  forwardOk: boolean
  backOk: boolean
}

/**
 * Checks that portals A (in `aDim`) and B (in the other dimension) link both ways,
 * with the other known portals competing for each trip.
 */
export function checkPortalPair(
  a: PortalRef,
  aDim: PortalDimension,
  b: PortalRef,
  others: (PortalRef & { dimension: PortalDimension })[]
): PortalPair {
  const bDim = otherPortalDimension(aDim)
  const inDim = (d: PortalDimension, own: PortalRef): PortalRef[] => [
    own,
    ...others.filter((o) => o.dimension === d && o.id !== a.id && o.id !== b.id)
  ]
  const forward = linkedPortal(portalExit(a.pos, aDim), inDim(bDim, b))
  const back = linkedPortal(portalExit(b.pos, bDim), inDim(aDim, a))
  return { forward, back, forwardOk: forward?.id === b.id, backOk: back?.id === a.id }
}
