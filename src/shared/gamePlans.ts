import type { Vec3 } from './types'

/**
 * The map's plans (AFK spot, portal link) as the Companion mod draws them in the world:
 * "<game dir>/f2f3/plans.json", one entry per world. The app does the thinking (the
 * verdicts come worded); the mod only draws. Pure.
 */

export type PlanLevel = 'ok' | 'warn' | 'bad'
export type PlanDimension = 'minecraft:overworld' | 'minecraft:the_nether'

export interface GamePlanFarm {
  x: number
  /** Null when only X/Z are known: drawn at the player's height. */
  y: number | null
  z: number
  label: string
  level: PlanLevel
  text: string
}

export interface GameAfkPlan {
  dimension: string
  spot: Vec3
  kind: 'mobs' | 'load'
  simulation: number
  farms: GamePlanFarm[]
}

export interface GamePortalPlan {
  /** Dimension of portal A; B is in the other one. */
  aDim: PlanDimension
  a: Vec3
  b: Vec3 | null
}

export interface GameWorldPlan {
  /** For slime chunks where the mod cannot read the seed (multiplayer). */
  seed?: string
  afk?: GameAfkPlan
  portals?: GamePortalPlan
}

/** What a send changes: a missing key is kept, null removes it. */
export interface GamePlanPatch {
  seed?: string | null
  afk?: GameAfkPlan | null
  portals?: GamePortalPlan | null
}

export interface GamePlans {
  format: 'f2f3-plans'
  schema: 1
  worlds: Record<string, GameWorldPlan>
}

const MAX_FARMS = 64

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 30_000_000 ? Math.floor(v) : null

function vec(v: unknown): Vec3 | null {
  if (!isObj(v)) return null
  const x = int(v.x)
  const y = int(v.y)
  const z = int(v.z)
  return x === null || y === null || z === null ? null : { x, y, z }
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

function afkOf(v: unknown): GameAfkPlan | null {
  if (!isObj(v)) return null
  const spot = vec(v.spot)
  const simulation = int(v.simulation)
  if (!spot || typeof v.dimension !== 'string' || simulation === null) return null
  const farms: GamePlanFarm[] = []
  for (const f of Array.isArray(v.farms) ? v.farms.slice(0, MAX_FARMS) : []) {
    if (!isObj(f)) continue
    const x = int(f.x)
    const z = int(f.z)
    if (x === null || z === null) continue
    farms.push({
      x,
      y: int(f.y),
      z,
      label: text(f.label, 80),
      level: f.level === 'ok' || f.level === 'warn' ? f.level : 'bad',
      text: text(f.text, 120)
    })
  }
  return {
    dimension: v.dimension.slice(0, 120),
    spot,
    kind: v.kind === 'load' ? 'load' : 'mobs',
    simulation: Math.max(2, Math.min(32, simulation)),
    farms
  }
}

function portalsOf(v: unknown): GamePortalPlan | null {
  if (!isObj(v)) return null
  const a = vec(v.a)
  if (!a || (v.aDim !== 'minecraft:overworld' && v.aDim !== 'minecraft:the_nether')) return null
  return { aDim: v.aDim, a, b: vec(v.b) }
}

const seedOf = (v: unknown): string | null =>
  typeof v === 'string' && /^-?\d{1,20}$/.test(v.trim()) ? v.trim() : null

function worldOf(v: unknown): GameWorldPlan {
  const out: GameWorldPlan = {}
  if (!isObj(v)) return out
  const seed = seedOf(v.seed)
  const afk = afkOf(v.afk)
  const portals = portalsOf(v.portals)
  if (seed) out.seed = seed
  if (afk) out.afk = afk
  if (portals) out.portals = portals
  return out
}

/**
 * The file's next content: `existing` (whatever was on disk; anything malformed is
 * dropped) with one world patched. A world left with nothing to draw is removed.
 */
export function mergeGamePlans(existing: unknown, world: string, patch: unknown): GamePlans {
  const worlds: Record<string, GameWorldPlan> = {}
  if (isObj(existing) && isObj(existing.worlds))
    for (const [name, w] of Object.entries(existing.worlds)) {
      const clean = worldOf(w)
      if (clean.afk || clean.portals) worlds[name] = clean
    }
  const next: GameWorldPlan = { ...worlds[world] }
  if (isObj(patch)) {
    const set = <K extends keyof GameWorldPlan>(key: K, value: GameWorldPlan[K] | null): void => {
      if (!(key in patch)) return
      if (value) next[key] = value
      else delete next[key]
    }
    set('seed', seedOf(patch.seed))
    set('afk', afkOf(patch.afk))
    set('portals', portalsOf(patch.portals))
  }
  if (next.afk || next.portals) worlds[world] = next
  else delete worlds[world]
  return { format: 'f2f3-plans', schema: 1, worlds }
}
