import type { F3Data, Vec3 } from '@shared/types'
import { formatNumber } from './format'

export const DIRECTION_ES: Record<string, string> = {
  north: 'Norte',
  south: 'Sur',
  east: 'Este',
  west: 'Oeste',
  up: 'Arriba',
  down: 'Abajo'
}

export const blockString = (v: Vec3): string => `${v.x} ${v.y} ${v.z}`
export const exactString = (v: Vec3): string =>
  `${formatNumber(v.x)} ${formatNumber(v.y)} ${formatNumber(v.z)}`

export function tpCommand(f3: F3Data): string | null {
  const p = f3.position ?? f3.block
  if (!p) return null
  const rot =
    f3.facing?.yaw !== undefined && f3.facing?.pitch !== undefined
      ? ` ${formatNumber(f3.facing.yaw, 1)} ${formatNumber(f3.facing.pitch, 1)}`
      : ''
  const dim = f3.dimension ? `execute in ${f3.dimension} run ` : ''
  return `/${dim}tp @s ${formatNumber(p.x)} ${formatNumber(p.y)} ${formatNumber(p.z)}${rot}`
}

/** Overworld ⇄ Nether portal-linking conversion (Y is unchanged). */
export function convertDimension(
  v: Vec3,
  dimension: string | undefined
): { label: string; pos: Vec3 } | null {
  if (dimension === 'minecraft:overworld')
    return { label: 'Nether', pos: { x: Math.floor(v.x / 8), y: v.y, z: Math.floor(v.z / 8) } }
  if (dimension === 'minecraft:the_nether')
    return { label: 'Overworld', pos: { x: v.x * 8, y: v.y, z: v.z * 8 } }
  return null
}

export function distance(a: Vec3, b: Vec3, ignoreY = false): number {
  const dy = ignoreY ? 0 : a.y - b.y
  return Math.hypot(a.x - b.x, dy, a.z - b.z)
}

/** Parses "x y z", "x, y, z" or "x z" (y = 64) into a vector. */
export function parseVec(text: string): Vec3 | null {
  const nums = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (nums.length === 3) return { x: nums[0], y: nums[1], z: nums[2] }
  if (nums.length === 2) return { x: nums[0], y: 64, z: nums[1] }
  return null
}

/** Rebuilds the overlay text in its original two-column form. */
export function f3PlainText(f3: F3Data): string {
  return [...f3.lines.left, '', '— — —', '', ...f3.lines.right].join('\n')
}
