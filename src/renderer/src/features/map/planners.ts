import {
  DESPAWN_RADIUS,
  NO_SPAWN_RADIUS,
  bestAfkSpot,
  farmStatus,
  otherPortalDimension,
  portalExit,
  type Farm,
  type FarmKind,
  type FarmStatus,
  type PortalDimension
} from '@shared/planner'
import type { GameAfkPlan, GamePortalPlan } from '@shared/gamePlans'
import type { Vec3 } from '@shared/types'
import type { Shape } from './drawMap'
import { convertXZ } from './view'
import { tr } from '@shared/i18n'

// ── AFK ──

export interface AfkFarm extends Farm {
  key: string
  label: string
  /** Screenshot it came from, when picked on one. */
  shotId?: string
}

export interface AfkState {
  farms: AfkFarm[]
  kind: FarmKind
  simulation: number
  /** Spot placed by hand; null → computed from the farms. */
  manual: Vec3 | null
  placing: boolean
}

export const afkSpot = (s: AfkState): Vec3 | null => s.manual ?? bestAfkSpot(s.farms, s.kind)

export type Verdict = { level: 'ok' | 'warn' | 'bad'; text: string }

export function farmVerdict(s: FarmStatus, kind: FarmKind): Verdict {
  if (kind === 'load') {
    if (!s.blocks) return { level: 'bad', text: tr('Fuera de la simulación: no funciona') }
    if (!s.entities)
      return { level: 'warn', text: tr('Solo bloques: redstone y cultivos sí, entidades no') }
    return { level: 'ok', text: tr('Cargada') }
  }
  if (!s.entities) return { level: 'bad', text: tr('Chunk fuera de la distancia de simulación') }
  if (s.sphere === 'too-close')
    return {
      level: 'bad',
      text: tr('A menos de {0} bloques: ahí no aparecen mobs', NO_SPAWN_RADIUS)
    }
  if (s.sphere === 'outside')
    return { level: 'bad', text: tr('A más de {0} bloques: los mobs desaparecen', DESPAWN_RADIUS) }
  if (!s.spawning)
    return { level: 'bad', text: tr('Centro del chunk a más de 128 bloques: no aparecen mobs') }
  return { level: 'ok', text: tr('Funciona') }
}

const VERDICT_COLOR = { ok: '#6ee08a', warn: '#ffd24a', bad: '#ff5c5c' }

export function afkShapes(s: AfkState, spot: Vec3 | null): Shape[] {
  const shapes: Shape[] = []
  if (spot) {
    const cx = Math.floor(spot.x / 16)
    const cz = Math.floor(spot.z / 16)
    const square = (r: number, stroke: string, fill?: string, dash?: boolean): Shape => ({
      kind: 'rect',
      x0: (cx - r) * 16,
      z0: (cz - r) * 16,
      x1: (cx + r + 1) * 16,
      z1: (cz + r + 1) * 16,
      stroke,
      fill,
      dash
    })
    shapes.push(
      square(s.simulation + 1, 'rgba(120,170,255,0.5)', undefined, true),
      square(s.simulation, 'rgba(120,170,255,0.9)', 'rgba(120,170,255,0.07)')
    )
    if (s.kind === 'mobs')
      shapes.push(
        {
          kind: 'circle',
          x: spot.x,
          z: spot.z,
          r: DESPAWN_RADIUS,
          stroke: '#ffb347',
          fill: 'rgba(255,179,71,0.07)'
        },
        {
          kind: 'circle',
          x: spot.x,
          z: spot.z,
          r: NO_SPAWN_RADIUS,
          stroke: '#ff5c5c',
          fill: 'rgba(255,92,92,0.15)'
        }
      )
  }
  s.farms.forEach((f, i) => {
    const level = spot ? farmVerdict(farmStatus(spot, f, s.simulation), s.kind).level : 'warn'
    shapes.push({ kind: 'marker', x: f.x, z: f.z, color: VERDICT_COLOR[level], label: `${i + 1}` })
  })
  if (spot) shapes.push({ kind: 'marker', x: spot.x, z: spot.z, color: '#ffffff', label: 'AFK' })
  return shapes
}

/** The AFK plan as the mod draws it in the world; null without a spot. */
export function gameAfkPlan(s: AfkState, dimension: string): GameAfkPlan | null {
  const spot = afkSpot(s)
  if (!spot) return null
  return {
    dimension,
    spot,
    kind: s.kind,
    simulation: s.simulation,
    farms: s.farms.map((f) => ({
      x: f.x,
      y: f.y,
      z: f.z,
      label: f.label,
      ...farmVerdict(farmStatus(spot, f, s.simulation), s.kind)
    }))
  }
}

// ── Portals ──

export interface PortalEnd {
  id: string
  label: string
  pos: Vec3
}

export interface PortalState {
  /** Dimension of portal A; B is always in the other one. */
  aDim: PortalDimension
  a: PortalEnd | null
  b: PortalEnd | null
  /** Which portal the next map click sets. */
  picking: 'a' | 'b' | null
}

const A_COLOR = '#c9a6ff'
const B_COLOR = '#ffb347'

/** A square in `from` coordinates, drawn in `to`. */
function squareIn(
  from: string,
  to: string,
  c: Vec3,
  r: number,
  stroke: string,
  fill: string
): Shape | null {
  const p0 = convertXZ(c.x - r, c.z - r, from, to)
  const p1 = convertXZ(c.x + r + 1, c.z + r + 1, from, to)
  return p0 && p1
    ? { kind: 'rect', x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1], stroke, fill, dash: true }
    : null
}

function markerIn(from: string, to: string, p: Vec3, color: string, label: string): Shape | null {
  const xz = convertXZ(p.x, p.z, from, to)
  return xz ? { kind: 'marker', x: xz[0], z: xz[1], color, label } : null
}

export function portalShapes(s: PortalState, dimension: string): Shape[] {
  const bDim = otherPortalDimension(s.aDim)
  const out: (Shape | null)[] = []
  if (s.a) {
    const exit = portalExit(s.a.pos, s.aDim)
    out.push(
      squareIn(bDim, dimension, exit.pos, exit.radius, A_COLOR, 'rgba(201,166,255,0.08)'),
      markerIn(s.aDim, dimension, s.a.pos, A_COLOR, 'A')
    )
    if (!s.b) out.push(markerIn(bDim, dimension, exit.pos, 'rgba(201,166,255,0.55)', 'ideal'))
  }
  if (s.b) {
    const back = portalExit(s.b.pos, bDim)
    out.push(
      squareIn(s.aDim, dimension, back.pos, back.radius, B_COLOR, 'rgba(255,179,71,0.06)'),
      markerIn(bDim, dimension, s.b.pos, B_COLOR, 'B')
    )
  }
  return out.filter((x): x is Shape => x !== null)
}

/** The portal link as the mod draws it in the world; null without portal A. */
export const gamePortalPlan = (s: PortalState): GamePortalPlan | null =>
  s.a ? { aDim: s.aDim, a: s.a.pos, b: s.b?.pos ?? null } : null
