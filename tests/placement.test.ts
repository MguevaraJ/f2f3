import { describe, expect, it } from 'vitest'
import { placeCommand, templateId } from '../src/shared/placement'

/** Blocks covered by a placed template, rotating local (x, z) like the game. */
function footprint(cmd: string, size: { x: number; z: number }, player = { x: 0, z: 0 }) {
  const m = /template \S+ (\S+) (\S+) (\S+)(?: (\S+))?$/.exec(cmd)!
  const n = (s: string): number => Number(s.slice(1) || 0)
  const q = { undefined: 0, clockwise_90: 1, '180': 2, counterclockwise_90: 3 }[String(m[4])]!
  const xs: number[] = []
  const zs: number[] = []
  for (let i = 0; i < size.x; i++)
    for (let k = 0; k < size.z; k++) {
      let [x, z] = [i, k]
      for (let r = 0; r < q; r++) [x, z] = [-z, x]
      xs.push(player.x + n(m[1]) + x)
      zs.push(player.z + n(m[3]) + z)
    }
  return { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] }
}

describe('placeCommand', () => {
  // A 7×7 house 4–10 blocks north of the player, centred on them.
  const origin = { x: -3, y: 64, z: -10 }
  const player = { x: 0, y: 64, z: 0 }

  it('keeps the offset when facing the same way', () => {
    expect(placeCommand('minecraft:craftshot/a', origin, player, 'north')).toBe(
      '/place template minecraft:craftshot/a ~-3 ~ ~-10'
    )
  })

  it('turns the build with the player', () => {
    const east = placeCommand('minecraft:x', origin, player, 'north', 'east')
    expect(east).toBe('/place template minecraft:x ~10 ~ ~-3 clockwise_90')
    // Still 4–10 blocks in front (now east), centred.
    expect(footprint(east, { x: 7, z: 7 })).toEqual({ x: [4, 10], z: [-3, 3] })
    expect(
      footprint(placeCommand('minecraft:x', origin, player, 'north', 'south'), { x: 7, z: 7 })
    ).toEqual({
      x: [-3, 3],
      z: [4, 10]
    })
    expect(
      footprint(placeCommand('minecraft:x', origin, player, 'north', 'west'), { x: 7, z: 7 })
    ).toEqual({
      x: [-10, -4],
      z: [-3, 3]
    })
  })

  it('keeps the height difference', () => {
    expect(placeCommand('minecraft:x', { x: 2, y: 70, z: 5 }, { x: 0, y: 64, z: 0 }, 'south')).toBe(
      '/place template minecraft:x ~2 ~6 ~5'
    )
  })
})

describe('templateId', () => {
  it('makes a valid resource id from the image name', () => {
    expect(templateId('2026-09-30_04.48.55.png')).toBe('minecraft:craftshot/2026-09-30_04.48.55')
    expect(templateId('Mi Casa (2).png')).toBe('minecraft:craftshot/mi_casa_2_')
  })
})
