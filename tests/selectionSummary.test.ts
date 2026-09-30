import { describe, expect, it } from 'vitest'
import { summarizeSelection } from '../src/renderer/src/lib/selectionSummary'
import type { ScreenshotEntry } from '../src/shared/types'

function shot(id: string, o: Record<string, unknown> = {}): ScreenshotEntry {
  const block = o.block as [number, number, number] | undefined
  const pos = block && { x: block[0], y: block[1], z: block[2] }
  return {
    id,
    name: id,
    folder: (o.folder as string) ?? '',
    size: (o.size as number) ?? 100,
    mtimeMs: 0,
    capturedAt: (o.at as number) ?? 0,
    width: 1,
    height: 1,
    meta: { favorite: o.fav as boolean, tags: o.tags as string[] },
    analysis:
      o.analysis === null
        ? null
        : ({
            hasF3: !!o.f3,
            mod: o.mod ? { world: { name: o.mod } } : null,
            location: pos ? { source: 'f3', block: pos, position: pos } : null,
            dimension: o.dim ? { id: o.dim, source: 'f3' } : null,
            biome: o.biome ? { id: o.biome, source: 'f3' } : null,
            mobs: ((o.mobs as string[]) ?? []).map((m) => ({ id: m })),
            structures: ((o.structures as string[]) ?? []).map((m) => ({ id: m }))
          } as never)
  }
}

describe('summarizeSelection', () => {
  const ow = 'minecraft:overworld'
  const s = summarizeSelection([
    shot('a', {
      at: 50,
      size: 10,
      fav: true,
      f3: true,
      dim: ow,
      biome: 'minecraft:plains',
      block: [10, 64, -5],
      mobs: ['minecraft:cow', 'minecraft:cow'],
      tags: ['granja']
    }),
    shot('b', {
      at: 20,
      size: 30,
      mod: 'Socopo',
      dim: ow,
      biome: 'minecraft:plains',
      block: [-90, 70, 200.7],
      mobs: ['minecraft:cow', 'minecraft:zombie'],
      structures: ['minecraft:village']
    }),
    shot('c', {
      at: 90,
      size: 5,
      dim: 'minecraft:the_nether',
      biome: 'minecraft:nether_wastes',
      block: [1, 40, 1],
      folder: 'Base/nether'
    }),
    shot('d', { analysis: null, at: 60 })
  ])

  it('adds up the basics', () => {
    expect(s).toMatchObject({ count: 4, bytes: 145, from: 20, to: 90, favorites: 1, pending: 1 })
    expect(s).toMatchObject({ withMod: 1, withF3: 1, located: 3 })
  })

  it('counts screenshots per world, dimension, biome, mob and structure', () => {
    expect(s.worlds).toEqual([
      { id: '', count: 2 },
      { id: 'Base', count: 1 },
      { id: 'Socopo', count: 1 }
    ])
    expect(s.dimensions[0]).toEqual({ id: ow, count: 2 })
    expect(s.biomes[0]).toEqual({ id: 'minecraft:plains', count: 2 })
    // A mob seen twice in one screenshot still counts as one screenshot.
    expect(s.mobs).toEqual([
      { id: 'minecraft:cow', count: 2 },
      { id: 'minecraft:zombie', count: 1 }
    ])
    expect(s.structures).toEqual([{ id: 'minecraft:village', count: 1 }])
    expect(s.tags).toEqual([{ id: 'granja', count: 1 }])
  })

  it('gives the extent per dimension only with two or more points', () => {
    expect(s.areas).toEqual([{ dimension: ow, count: 2, x: [-90, 10], z: [-5, 200] }])
  })
})
