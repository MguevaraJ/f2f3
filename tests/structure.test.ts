import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildPathFor, parseCompanion, sidecarPathsFor } from '../src/core/companion/parseCompanion'
import { summarizeStructure } from '../src/core/companion/structure'
import { readNbt } from '../src/core/nbt/readNbt'

const fixture = (name: string): Buffer => readFileSync(join(__dirname, 'fixtures/companion', name))

describe('readNbt', () => {
  it('reads every tag type', () => {
    // Root compound "" { b:1, s:-2, l:5L, str:"hé", list:[int 7, int 8], ia:[3] }
    const bytes = [
      10, 0, 0, 1, 0, 1, 98, 1, 2, 0, 1, 115, 0xff, 0xfe, 4, 0, 1, 108, 0, 0, 0, 0, 0, 0, 0, 5, 8,
      0, 3, 115, 116, 114, 0, 3, 104, 0xc3, 0xa9, 9, 0, 4, 108, 105, 115, 116, 3, 0, 0, 0, 2, 0, 0,
      0, 7, 0, 0, 0, 8, 11, 0, 2, 105, 97, 0, 0, 0, 1, 0, 0, 0, 3, 0
    ]
    const raw = Uint8Array.from(bytes)
    for (const data of [raw, gzipSync(raw)]) {
      const n = readNbt(data)
      expect(n).toMatchObject({ b: 1, s: -2, l: 5n, str: 'hé', list: [7, 8] })
      expect(Array.from(n.ia as Int32Array)).toEqual([3])
    }
  })

  it('rejects truncated data', () => {
    expect(() => readNbt(Uint8Array.from([10, 0, 0, 1, 0, 1]))).toThrow()
  })
})

describe('build snapshot (real 26.3 file, sneak+F2 at a chest)', () => {
  const json = parseCompanion(fixture('build-26.3.craftshot.json').toString('utf8'))!

  it('parses the build section of the sidecar', () => {
    expect(json.build).toEqual({
      origin: { x: -1034, y: 85, z: -716 },
      size: { x: 33, y: 33, z: 33 },
      blocks: 13854,
      entities: 3
    })
  })

  it('keeps the name the build got in the world', () => {
    const raw = JSON.parse(fixture('build-26.3.craftshot.json').toString('utf8'))
    raw.build.template = 'craftshot:build_3'
    expect(parseCompanion(JSON.stringify(raw))!.build!.template).toBe('craftshot:build_3')
    raw.build.template = 'no es un id'
    // A bad name only drops the build section, never the whole sidecar.
    expect(parseCompanion(JSON.stringify(raw))).not.toBeNull()
  })

  it('summarizes the structure file like the mod counted it', () => {
    const s = summarizeStructure(fixture('build-26.3.craftshot.nbt'))!
    expect(s.size).toEqual({ x: 33, y: 33, z: 33 })
    expect(s.blocks).toBe(json.build!.blocks)
    expect(s.materials.reduce((a, m) => a + m.count, 0)).toBe(s.blocks)
    expect(s.materials.map((m) => m.id)).toEqual(
      expect.arrayContaining(['minecraft:stone_bricks', 'minecraft:chest', 'minecraft:glass'])
    )
    expect(s.materials.find((m) => m.id === 'minecraft:chest')!.count).toBe(1)
    expect(s.entities.reduce((a, e) => a + e.count, 0)).toBe(3)
    expect(s.blockEntities).toBeGreaterThanOrEqual(1)
    expect(s.dataVersion).toBeGreaterThan(4000)
  })

  it('returns null for garbage', () => {
    expect(summarizeStructure(Uint8Array.from([1, 2, 3]))).toBeNull()
  })

  it('names the sidecars after the image', () => {
    expect(buildPathFor('/s/a.b.png')).toBe('/s/a.b.craftshot.nbt')
    expect(sidecarPathsFor('/s/x.png')).toEqual(['/s/x.craftshot.json', '/s/x.craftshot.nbt'])
  })
})

describe('build snapshot (real 1.21.1 file, from the Fabric 1.21.1 port)', () => {
  const json = parseCompanion(fixture('build-1.21.1.craftshot.json').toString('utf8'))!

  it('parses the sidecar the port writes', () => {
    expect(json.minecraft).toBe('1.21.1')
    expect(json.modVersion).toBe('1.0.0+1.21.1')
    expect(json.build).toMatchObject({
      size: { x: 16, y: 12, z: 16 },
      template: 'craftshot:prueba'
    })
    expect(json.gamerules?.['minecraft:random_tick_speed']).toEqual({ value: 3, default: 3 })
    expect(json.spawn?.chunks).toBeGreaterThan(0)
  })

  it('summarizes its structure file (palette written with "Name")', () => {
    const s = summarizeStructure(fixture('build-1.21.1.craftshot.nbt'))!
    expect(s.size).toEqual({ x: 16, y: 12, z: 16 })
    expect(s.blocks).toBe(json.build!.blocks)
    expect(s.materials.map((m) => m.id)).toEqual(
      expect.arrayContaining(['minecraft:spruce_leaves', 'minecraft:spruce_log'])
    )
  })
})

describe('build snapshot (real 1.20.1 file, from the Fabric 1.20.1 port)', () => {
  const json = parseCompanion(fixture('build-1.20.1.craftshot.json').toString('utf8'))!

  it('parses the sidecar the port writes', () => {
    expect(json.minecraft).toBe('1.20.1')
    expect(json.game?.tick).toMatchObject({ rate: 20, state: 'normal' })
    expect(json.build).toMatchObject({
      size: { x: 16, y: 14, z: 16 },
      template: 'craftshot:prueba'
    })
    expect(json.target?.block?.id).toBe('minecraft:stone')
  })

  it('summarizes its structure file', () => {
    const s = summarizeStructure(fixture('build-1.20.1.craftshot.nbt'))!
    expect(s.blocks).toBe(json.build!.blocks)
    expect(s.materials.map((m) => m.id)).toEqual(
      expect.arrayContaining(['minecraft:oak_leaves', 'minecraft:stone'])
    )
  })
})
