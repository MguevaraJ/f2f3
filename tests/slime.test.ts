import { describe, expect, it } from 'vitest'
import { isSlimeChunk, nearestSlimeChunk, parseSeed } from '../src/shared/slime'

/**
 * Generated with the game itself (26.3 jar):
 * WorldgenRandom.seedSlimeChunk(x, z, seed, 987234911L).nextInt(10) == 0
 * over x, z in [-20, 20), plus spot checks far away (int overflow territory).
 */
const GOLDEN = [
  { seed: '0', count: 175, hash: 673732198, points: '0000000000' },
  { seed: '12345', count: 163, hash: -1068311604, points: '0000000000' },
  { seed: '-1844849896984713791', count: 173, hash: 1408117480, points: '0000001100' },
  { seed: '2284335250331524639', count: 148, hash: -640681147, points: '0000001000' },
  { seed: '-9223372036854775808', count: 175, hash: 673732198, points: '0000000000' },
  { seed: '9223372036854775807', count: 173, hash: -1830497149, points: '0000000000' }
]
const SPOTS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, -1],
  [-65, -44],
  [20, -1],
  [1875000, -1875000],
  [-46341, 46341],
  [46341, 46341],
  [123, -456]
]

/** java.lang.String.hashCode */
const javaHash = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

describe('slime chunks', () => {
  for (const g of GOLDEN)
    it(`matches the game for seed ${g.seed}`, () => {
      const seed = parseSeed(g.seed)!
      let hits = ''
      let n = 0
      for (let x = -20; x < 20; x++)
        for (let z = -20; z < 20; z++)
          if (isSlimeChunk(seed, x, z)) {
            n++
            hits += `${x},${z};`
          }
      expect(n).toBe(g.count)
      expect(javaHash(hits)).toBe(g.hash)
      expect(SPOTS.map(([x, z]) => (isSlimeChunk(seed, x, z) ? '1' : '0')).join('')).toBe(g.points)
    })

  it('parses seeds and rejects invalid ones', () => {
    expect(parseSeed(' -42 ')).toBe(-42n)
    expect(parseSeed('9223372036854775808')).toBeNull()
    expect(parseSeed('abc')).toBeNull()
  })

  it('finds the nearest slime chunk', () => {
    const seed = parseSeed('-1844849896984713791')!
    // Spot (1875000, -1875000) is a slime chunk for this seed.
    const inside = nearestSlimeChunk(seed, 1875000 * 16 + 5, -1875000 * 16 + 5)
    expect(inside).toEqual({ x: 1875000, z: -1875000, distance: 0 })
    const near = nearestSlimeChunk(seed, 0, 0)!
    expect(isSlimeChunk(seed, near.x, near.z)).toBe(true)
  })
})
