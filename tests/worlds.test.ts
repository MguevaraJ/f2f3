import { describe, expect, it } from 'vitest'
import {
  convertXZ,
  fitView,
  scaleBar,
  toScreen,
  toWorld,
  zoomAt
} from '../src/renderer/src/features/map/view'
import type { ScreenshotEntry } from '../src/shared/types'
import { listWorlds, mapPoint, seedOf, worldOf } from '../src/shared/worlds'

function shot(
  id: string,
  over: {
    folder?: string
    world?: string
    modWorld?: string
    seed?: string
    block?: [number, number, number]
    dim?: string
  } = {}
): ScreenshotEntry {
  const block = over.block && { x: over.block[0], y: over.block[1], z: over.block[2] }
  return {
    id,
    name: id,
    folder: over.folder ?? '',
    size: 1,
    mtimeMs: 0,
    capturedAt: 0,
    width: 1,
    height: 1,
    meta: over.world ? { world: over.world } : {},
    analysis: {
      mod: over.modWorld ? ({ world: { name: over.modWorld, seed: over.seed } } as never) : null,
      location: block ? { source: 'f3', block, position: block } : null,
      dimension: { id: over.dim ?? 'minecraft:overworld', source: 'f3' }
    } as never
  }
}

describe('worlds', () => {
  it('resolves the world: manual > mod > top folder > none', () => {
    expect(worldOf(shot('a', { world: 'Mío', modWorld: 'Mod', folder: 'Carpeta/sub' }))).toEqual({
      name: 'Mío',
      source: 'manual'
    })
    expect(worldOf(shot('a', { modWorld: 'Mod', folder: 'Carpeta' }))).toEqual({
      name: 'Mod',
      source: 'mod'
    })
    expect(worldOf(shot('a', { folder: 'Carpeta/sub' }))).toEqual({
      name: 'Carpeta',
      source: 'folder'
    })
    expect(worldOf(shot('a'))).toEqual({ name: '', source: 'none' })
  })

  it('lists worlds with counts and seeds (typed seeds win)', () => {
    const shots = [
      shot('1', { modWorld: 'Socopo', seed: '42', block: [0, 64, 0] }),
      shot('2', { modWorld: 'Socopo', block: [10, 64, 10] }),
      shot('3', { folder: 'Server' }),
      shot('4', { block: [1, 1, 1] })
    ]
    const worlds = listWorlds(shots, {})
    expect(worlds.map((w) => [w.name, w.count, w.located, w.seed])).toEqual([
      ['Socopo', 2, 2, '42'],
      ['Server', 1, 0, undefined],
      ['', 1, 1, undefined]
    ])
    expect(listWorlds(shots, { Socopo: '7' })[0]).toMatchObject({ seed: '7', seedSource: 'manual' })
    expect(seedOf('Socopo', shots, {})).toEqual({ seed: '42', source: 'mod' })
    expect(seedOf('Server', shots, { Server: '-5' })).toEqual({ seed: '-5', source: 'manual' })
    expect(seedOf('Server', shots, {})).toBeNull()
  })

  it('places screenshots with coordinates and a dimension', () => {
    expect(mapPoint(shot('1', { block: [3, 4, 5], dim: 'minecraft:the_nether' }))).toEqual({
      id: '1',
      x: 3,
      y: 4,
      z: 5,
      dimension: 'minecraft:the_nether'
    })
    expect(mapPoint(shot('2'))).toBeNull()
  })
})

describe('map view math', () => {
  const v = { cx: 100, cz: -50, scale: 2 }

  it('converts between world and screen', () => {
    expect(toScreen(v, 800, 600, 100, -50)).toEqual([400, 300])
    const [x, z] = toWorld(v, 800, 600, 123, 456)
    expect(toScreen(v, 800, 600, x, z)).toEqual([123, 456])
  })

  it('zooms around the cursor', () => {
    const before = toWorld(v, 800, 600, 700, 100)
    const z = zoomAt(v, 800, 600, 700, 100, 1.25)
    expect(z.scale).toBeCloseTo(2.5)
    const after = toWorld(z, 800, 600, 700, 100)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
  })

  it('frames the points', () => {
    const f = fitView(
      [
        { x: -100, z: 0 },
        { x: 300, z: 200 }
      ],
      800,
      600
    )
    expect([f.cx, f.cz]).toEqual([100, 100])
    const [ax] = toScreen(f, 800, 600, -100, 0)
    const [bx] = toScreen(f, 800, 600, 300, 200)
    expect(ax).toBeGreaterThanOrEqual(0)
    expect(bx).toBeLessThanOrEqual(800)
    expect(fitView([{ x: 5, z: 6 }], 800, 600)).toEqual({ cx: 5, cz: 6, scale: 2 })
  })

  it('picks a round scale bar length', () => {
    expect([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]).toContain(scaleBar(1).blocks)
    expect(scaleBar(1).px).toBe(scaleBar(1).blocks)
  })

  it('converts Nether ⇄ Overworld only', () => {
    expect(convertXZ(10, -3, 'minecraft:the_nether', 'minecraft:overworld')).toEqual([80, -24])
    expect(convertXZ(80, -24, 'minecraft:overworld', 'minecraft:the_nether')).toEqual([10, -3])
    expect(convertXZ(1, 1, 'minecraft:the_end', 'minecraft:overworld')).toBeNull()
  })
})
