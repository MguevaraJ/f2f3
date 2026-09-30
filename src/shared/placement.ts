import type { Vec3 } from './types'

/**
 * `/place template` puts the structure's corner where it is told; these helpers work out
 * where, so the build lands around the player exactly as it was when the screenshot was
 * taken (in front of them at the same distance and height), even facing another way.
 * Pure; rotation as in StructureTemplate.transform: clockwise_90 maps (x, z) → (−z, x).
 */

export const FACINGS = ['north', 'east', 'south', 'west'] as const
export type Facing = (typeof FACINGS)[number]

export const isFacing = (s: string): s is Facing => (FACINGS as readonly string[]).includes(s)

const ROTATION = ['none', 'clockwise_90', '180', 'counterclockwise_90'] as const

function rotate(v: Vec3, quarters: number): Vec3 {
  let { x, z } = v
  for (let i = 0; i < quarters; i++) [x, z] = [-z, x]
  return { x: x + 0, y: v.y, z: z + 0 } // "+ 0" turns -0 into 0
}

/** Template id for a screenshot: "minecraft:craftshot/2026-09-30_04.48.55". */
export function templateId(imageName: string): string {
  const base = imageName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
  return `minecraft:craftshot/${base || 'build'}`
}

/**
 * The command that places the build relative to the player (`~ ~ ~`), for a player now
 * facing `now`; `then` is where they faced when saving it.
 */
export function placeCommand(
  template: string,
  origin: Vec3,
  player: Vec3,
  then: Facing,
  now: Facing = then
): string {
  const quarters = (FACINGS.indexOf(now) - FACINGS.indexOf(then) + 4) % 4
  const off = rotate(
    { x: origin.x - player.x, y: origin.y - player.y, z: origin.z - player.z },
    quarters
  )
  const rel = (n: number): string => (n ? `~${n}` : '~')
  const rotation = quarters ? ` ${ROTATION[quarters]}` : ''
  return `/place template ${template} ${rel(off.x)} ${rel(off.y)} ${rel(off.z)}${rotation}`
}
