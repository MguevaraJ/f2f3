import type { BuildSummary, Vec3 } from '@shared/types'
import { readNbt, type NbtCompound, type NbtValue } from '../nbt/readNbt'

/**
 * Summary of a vanilla structure file (the ".f2f3.nbt" the mod saves on sneak+F2):
 * size, block counts by id (the material list) and entities. Pure.
 */

const NOT_MATERIAL = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:structure_void'
])

const isCompound = (v: NbtValue | undefined): v is NbtCompound =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v)

const list = (v: NbtValue | undefined): NbtValue[] => (Array.isArray(v) ? v : [])

function vec(v: NbtValue | undefined): Vec3 | null {
  const a = Array.isArray(v) || v instanceof Int32Array ? Array.from(v as ArrayLike<number>) : []
  return a.length === 3 && a.every((n) => typeof n === 'number')
    ? { x: a[0], y: a[1], z: a[2] }
    : null
}

const sortedCounts = (m: Map<string, number>): { id: string; count: number }[] =>
  [...m]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))

export function summarizeStructure(data: Uint8Array): BuildSummary | null {
  let root: NbtCompound
  try {
    root = readNbt(data)
  } catch {
    return null
  }
  const size = vec(root.size)
  // Structures with several palettes (shipwrecks…) use the first one, like the game by default.
  const palette = list(root.palette).length ? list(root.palette) : list(list(root.palettes)[0])
  if (!size || !palette.length) return null
  // "Name" in older versions, "id" in 26.x.
  const names = palette.map((p) => {
    const n = isCompound(p) ? (p.Name ?? p.id) : undefined
    return typeof n === 'string' ? n : '?'
  })

  const materials = new Map<string, number>()
  let blocks = 0
  let blockEntities = 0
  for (const b of list(root.blocks)) {
    if (!isCompound(b) || typeof b.state !== 'number') continue
    const id = names[b.state] ?? '?'
    if (NOT_MATERIAL.has(id)) continue
    blocks++
    materials.set(id, (materials.get(id) ?? 0) + 1)
    if (isCompound(b.nbt)) blockEntities++
  }
  const entities = new Map<string, number>()
  for (const e of list(root.entities)) {
    const id = isCompound(e) && isCompound(e.nbt) && typeof e.nbt.id === 'string' ? e.nbt.id : null
    if (id) entities.set(id, (entities.get(id) ?? 0) + 1)
  }
  return {
    size,
    blocks,
    blockEntities,
    materials: sortedCounts(materials),
    entities: sortedCounts(entities),
    dataVersion: typeof root.DataVersion === 'number' ? root.DataVersion : undefined
  }
}
