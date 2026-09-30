import { describe, expect, it } from 'vitest'
import {
  bestAfkSpot,
  checkPortalPair,
  farmStatus,
  farmWorks,
  linkedPortal,
  portalExit
} from '../src/shared/planner'

describe('farmStatus', () => {
  const afk = { x: 8, y: 64, z: 8 }

  it('measures the 24–128 sphere in 3D', () => {
    expect(farmStatus(afk, { x: 8, y: 80, z: 8 }, 12).sphere).toBe('too-close')
    expect(farmStatus(afk, { x: 8, y: 164, z: 8 }, 12).sphere).toBe('inside')
    expect(farmStatus(afk, { x: 108, y: 164, z: 8 }, 12).sphere).toBe('outside')
    // Unknown Y: horizontal distance only.
    expect(farmStatus(afk, { x: 8, y: null, z: 58 }, 12).distance).toBe(50)
  })

  it('uses a chunk square for simulation and one more chunk for blocks', () => {
    const at = (cx: number): ReturnType<typeof farmStatus> =>
      farmStatus(afk, { x: cx * 16 + 8, y: 64, z: 8 }, 4)
    expect(at(4)).toMatchObject({ chunks: 4, entities: true, blocks: true })
    expect(at(5)).toMatchObject({ chunks: 5, entities: false, blocks: true })
    expect(at(6)).toMatchObject({ entities: false, blocks: false })
    // Diagonal chunks count as the same distance (Chebyshev).
    expect(farmStatus(afk, { x: 4 * 16, y: 64, z: 4 * 16 }, 4).entities).toBe(true)
  })

  it('needs the chunk centre within 128 blocks to spawn', () => {
    // Chunk 8 is entity-ticking at simulation 12, but its centre is 128 blocks away.
    const s = farmStatus(afk, { x: 8 * 16 + 3, y: 64, z: 8 }, 12)
    expect(s.entities).toBe(true)
    expect(s.spawning).toBe(false)
    expect(farmWorks(s, 'mobs')).toBe(false)
    expect(farmWorks(s, 'load')).toBe(true)
  })
})

describe('bestAfkSpot', () => {
  it('centres the smallest sphere around mob farms', () => {
    const spot = bestAfkSpot(
      [
        { x: -100, y: 64, z: 0 },
        { x: 100, y: 64, z: 0 },
        { x: 0, y: 64, z: 10 }
      ],
      'mobs'
    )!
    expect(Math.abs(spot.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(spot.z)).toBeLessThanOrEqual(2)
    for (const f of [-100, 100]) {
      const s = farmStatus(spot, { x: f, y: 64, z: 0 }, 12)
      expect(s.sphere).toBe('inside')
    }
  })

  it('lifts the spot out of the no-spawn sphere', () => {
    const spot = bestAfkSpot([{ x: 0, y: 70, z: 0 }], 'mobs')!
    expect(spot).toEqual({ x: 0, y: 96, z: 0 })
    expect(farmStatus(spot, { x: 0, y: 70, z: 0 }, 12).sphere).toBe('inside')
  })

  it('picks the middle chunk for loading-only farms', () => {
    expect(
      bestAfkSpot(
        [
          { x: 0, y: null, z: 0 },
          { x: 100, y: null, z: -40 }
        ],
        'load'
      )
    ).toEqual({ x: 3 * 16 + 8, y: 64, z: -2 * 16 + 8 })
    expect(bestAfkSpot([], 'load')).toBeNull()
  })
})

describe('portals', () => {
  const ow = 'minecraft:overworld' as const
  const nether = 'minecraft:the_nether' as const

  it('scales coordinates and picks the search radius of the destination', () => {
    expect(portalExit({ x: -801, y: 70, z: 1600 }, ow)).toEqual({
      dimension: nether,
      pos: { x: -101, y: 70, z: 200 },
      radius: 16
    })
    expect(portalExit({ x: -101, y: 40, z: 200 }, nether)).toEqual({
      dimension: ow,
      pos: { x: -808, y: 40, z: 1600 },
      radius: 128
    })
  })

  it('links to the closest portal inside the square, lowest on ties', () => {
    const exit = portalExit({ x: 800, y: 64, z: 0 }, ow) // → 100 64 0, ±16
    const far = { id: 'far', pos: { x: 117, y: 64, z: 0 } }
    expect(linkedPortal(exit, [far])).toBeNull()
    const a = { id: 'a', pos: { x: 111, y: 64, z: 0 } }
    const b = { id: 'b', pos: { x: 100, y: 74, z: 0 } }
    const low = { id: 'low', pos: { x: 100, y: 54, z: 0 } }
    expect(linkedPortal(exit, [a, b])?.id).toBe('b')
    expect(linkedPortal(exit, [a, b, low])?.id).toBe('low')
  })

  it('checks both trips of a pair against the other portals', () => {
    const A = { id: 'A', pos: { x: 800, y: 64, z: 800 } }
    const B = { id: 'B', pos: { x: 100, y: 64, z: 100 } }
    expect(checkPortalPair(A, ow, B, [])).toMatchObject({ forwardOk: true, backOk: true })

    // Another Overworld portal closer to B×8 steals the way back.
    const thief = { id: 'C', dimension: ow, pos: { x: 805, y: 64, z: 800 } }
    const r = checkPortalPair(A, ow, { id: 'B', pos: { x: 101, y: 64, z: 100 } }, [thief])
    expect(r.forwardOk).toBe(true)
    expect(r.backOk).toBe(false)
    expect(r.back?.id).toBe('C')

    // B outside the ±16 square: going through A builds a new portal.
    const off = checkPortalPair(A, ow, { id: 'B', pos: { x: 120, y: 64, z: 100 } }, [])
    expect(off.forward).toBeNull()
    expect(off.forwardOk).toBe(false)
  })
})
