import { describe, expect, it } from 'vitest'
import {
  blockStateString,
  capRows,
  scaledCap,
  setblockCommand,
  tickInfo
} from '../src/renderer/src/lib/technical'

describe('technical helpers', () => {
  it('scales mob caps with the spawnable chunks', () => {
    expect(scaledCap(70, 289)).toBe(70)
    expect(scaledCap(70, 578)).toBe(140)
    expect(scaledCap(10, 144)).toBe(4)
  })

  it('flags full categories', () => {
    const rows = capRows({ chunks: 289, counts: { monster: 70, creature: 3, misc: 4 } })
    expect(rows.map((r) => [r.id, r.count, r.cap, r.full])).toEqual([
      ['monster', 70, 70, true],
      ['creature', 3, 10, false]
    ])
  })

  it('derives TPS and lag from MSPT and /tick state', () => {
    expect(tickInfo({ mspt: 6.7, targetMs: 50 })).toMatchObject({ tps: 20, lagging: false })
    expect(tickInfo({ mspt: 100, targetMs: 50 })).toMatchObject({ tps: 10, lagging: true })
    expect(tickInfo({ mspt: 80, targetMs: 50, tickState: 'sprinting' })?.lagging).toBe(false)
    expect(tickInfo({ mspt: 1, targetMs: 100 })?.tps).toBe(10) // /tick rate 10
    expect(tickInfo({ brand: 'Paper' })).toBeNull()
  })

  it('builds block state strings and /setblock commands', () => {
    const b = {
      pos: { x: -1020, y: 102, z: -702 },
      id: 'minecraft:repeater',
      state: { delay: '3', facing: 'south' }
    }
    expect(blockStateString(b)).toBe('minecraft:repeater[delay=3,facing=south]')
    expect(setblockCommand(b)).toBe(
      '/setblock -1020 102 -702 minecraft:repeater[delay=3,facing=south]'
    )
    expect(blockStateString({ pos: b.pos, id: 'minecraft:stone' })).toBe('minecraft:stone')
    expect(setblockCommand({ pos: b.pos })).toBeNull()
  })
})

describe('villager catalog', () => {
  it('names professions, levels and enchantments in Spanish', async () => {
    const { enchantmentName, professionName, villagerLevelName } =
      await import('../src/shared/catalog/villagers')
    expect(professionName('minecraft:librarian')).toBe('Bibliotecario')
    expect(villagerLevelName(5)).toBe('Maestro')
    expect(enchantmentName('minecraft:mending', 1)).toBe('Reparación I')
    expect(enchantmentName('mymod:zap', 12)).toBe('Zap 12')
  })
})
