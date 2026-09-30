import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAnalysis } from '../src/core/analyze'
import {
  catalogStructureId,
  companionLocation,
  companionPathFor,
  parseCompanion
} from '../src/core/companion/parseCompanion'
import { companionTechnical } from '../src/shared/companion'
import type { F3Data, ScreenshotAnalysis } from '../src/shared/types'

const real = readFileSync(join(__dirname, 'fixtures/companion/real-26.3.craftshot.json'), 'utf8')

/** Sidecar as the mod writes it in singleplayer, inside a village, looking at a cow. */
const village = {
  format: 'craftshot-companion',
  schema: 1,
  mod: { name: 'Craftshot Companion', version: '1.0.0+26.3', loader: 'fabric', minecraft: '26.3' },
  capturedAt: '2026-09-30T01:42:55.100Z',
  world: {
    type: 'singleplayer',
    name: 'Socopo',
    seed: '-1844849896984713791',
    dimension: 'minecraft:overworld',
    day: 3,
    timeOfDay: 1169,
    weather: 'rain'
  },
  player: {
    position: { x: -1024.5, y: 107, z: -703.3 },
    block: { x: -1025, y: 107, z: -704 },
    chunk: { x: -65, y: 6, z: -44 },
    facing: { direction: 'north', yaw: -180, pitch: 25 },
    gameMode: 'survival'
  },
  biome: 'minecraft:plains',
  light: { sky: 15, block: 0 },
  target: { entity: { id: 'minecraft:cow', distance: 2.4 } },
  entities: [
    { id: 'minecraft:villager', count: 3, nearest: 6.1 },
    { id: 'minecraft:cow', count: 2, nearest: 2.4 }
  ],
  structures: { inside: ['minecraft:village_plains'], target: [] }
}

function base(over: Partial<ScreenshotAnalysis>): ScreenshotAnalysis {
  return {
    schema: 8,
    fingerprint: '',
    analyzedAt: 0,
    hasF3: false,
    f3: null,
    ocr: null,
    mod: null,
    heuristic: {
      dimension: 'minecraft:overworld',
      biome: { id: 'minecraft:desert', confidence: 0.3 }
    },
    local: null,
    vision: null,
    manualBiome: null,
    location: null,
    dimension: null,
    biome: null,
    mobs: [],
    structures: [],
    averageColor: '#000',
    ...over
  }
}

describe('Companion mod sidecar', () => {
  it('lives next to the image', () => {
    expect(companionPathFor('/s/2026-09-29_21.38.54.png')).toBe(
      '/s/2026-09-29_21.38.54.craftshot.json'
    )
    expect(companionPathFor('/s/v1.2/foto (2).png')).toBe('/s/v1.2/foto (2).craftshot.json')
  })

  it('parses a file written by the real mod in 26.3', () => {
    const c = parseCompanion(real)!
    expect(c).not.toBeNull()
    expect(c.minecraft).toBe('26.3')
    expect(c.world.dimension).toBe('minecraft:the_nether')
    expect(c.world.seed).toMatch(/^-?\d+$/)
    expect(Number.isInteger(c.player.block.x)).toBe(true)
  })

  it('keeps 64-bit seeds exact and rejects invalid files', () => {
    expect(parseCompanion(JSON.stringify(village))!.world.seed).toBe('-1844849896984713791')
    expect(parseCompanion('{')).toBeNull()
    expect(parseCompanion(JSON.stringify({ ...village, schema: 2 }))).toBeNull()
    expect(parseCompanion(JSON.stringify({ ...village, format: 'other' }))).toBeNull()
    expect(
      parseCompanion(JSON.stringify({ ...village, world: { ...village.world, seed: 123 } }))
    ).toBeNull()
  })

  it('treats missing structures as unknown (multiplayer)', () => {
    const mp = {
      ...village,
      world: { ...village.world, type: 'multiplayer', seed: undefined },
      structures: undefined
    }
    const c = parseCompanion(JSON.stringify(mp))!
    expect(c.structures).toBeUndefined()
    expect(c.world.seed).toBeUndefined()
  })

  it('maps structure variants to catalog ids', () => {
    expect(catalogStructureId('minecraft:village_snowy')).toBe('minecraft:village')
    expect(catalogStructureId('minecraft:ocean_ruin_cold')).toBe('minecraft:ocean_ruin')
    expect(catalogStructureId('minecraft:ruined_portal_nether')).toBe('minecraft:ruined_portal')
    expect(catalogStructureId('minecraft:shipwreck_beached')).toBe('minecraft:shipwreck')
    expect(catalogStructureId('minecraft:mineshaft_mesa')).toBe('minecraft:mineshaft')
    expect(catalogStructureId('minecraft:nether_fossil')).toBe('minecraft:fossil')
    expect(catalogStructureId('minecraft:stronghold')).toBe('minecraft:stronghold')
    expect(catalogStructureId('somemod:tower')).toBe('somemod:tower')
  })
})

describe('resolveAnalysis with the mod', () => {
  const mod = parseCompanion(JSON.stringify(village))!

  it('ranks the mod above F3, AI and estimates, below a manual choice', () => {
    const f3 = {
      biome: 'minecraft:forest',
      dimension: 'minecraft:the_nether',
      fields: [],
      lines: { left: [], right: [] }
    } as F3Data
    const vision = {
      model: 'x',
      analyzedAt: 0,
      description: '',
      biome: { id: 'minecraft:savanna', confidence: 0.9 },
      mobs: [{ id: 'minecraft:pig', count: 1 }],
      structures: ['minecraft:desert_pyramid', 'minecraft:village']
    }
    const a = resolveAnalysis(base({ mod, f3, hasF3: true, vision }))
    expect(a.dimension).toEqual({ id: 'minecraft:overworld', source: 'mod' })
    expect(a.biome).toEqual({ id: 'minecraft:plains', source: 'mod', confidence: 1 })
    // Exact mob list: the AI's guesses are not mixed in.
    expect(a.mobs.map((m) => [m.id, m.count, m.source])).toEqual([
      ['minecraft:villager', 3, 'mod'],
      ['minecraft:cow', 2, 'mod']
    ])
    // The AI may still spot distant structures; duplicates keep the mod's source.
    expect(a.structures).toEqual([
      { id: 'minecraft:village', source: 'mod' },
      { id: 'minecraft:desert_pyramid', source: 'vision' }
    ])
    expect(resolveAnalysis(base({ mod, manualBiome: 'minecraft:meadow' })).biome?.source).toBe(
      'manual'
    )
  })

  it('builds the location like the F3 would show it', () => {
    const loc = resolveAnalysis(base({ mod })).location!
    expect(loc.source).toBe('mod')
    expect(loc.block).toEqual({ x: -1025, y: 107, z: -704 })
    expect(loc.chunkRelative).toEqual({ x: 15, y: 11, z: 0 })
    expect(loc.region).toBe('r.-3.-2.mca')
    expect(loc.facing).toMatchObject({ direction: 'north', towards: 'negative Z', yaw: -180 })
    expect(loc.targetedEntity).toBe('minecraft:cow')
    expect(loc.dimension).toBe('minecraft:overworld')
  })

  it('falls back to the F3 location without the mod', () => {
    const f3 = {
      block: { x: 1, y: 2, z: 3 },
      region: 'r.0.0.mca',
      fields: [],
      lines: { left: [], right: [] }
    } as F3Data
    expect(resolveAnalysis(base({ f3, hasF3: true })).location).toMatchObject({
      source: 'f3',
      block: { x: 1, y: 2, z: 3 }
    })
    expect(resolveAnalysis(base({})).location).toBeNull()
  })

  it('accepts analyses cached before the mod existed', () => {
    const old = base({})
    delete (old as Partial<ScreenshotAnalysis>).mod
    const a = resolveAnalysis(old)
    expect(a.mod).toBeNull()
    expect(a.biome?.source).toBe('heuristic')
  })
})

describe('Companion mod technical data (real 26.3 files)', () => {
  const load = (name: string) =>
    parseCompanion(readFileSync(join(__dirname, 'fixtures/companion', name), 'utf8'))!

  it('reads tick, mob caps, game rules, mods and nearby entities', () => {
    const c = load('chest-26.3.craftshot.json')
    expect(c.game?.tick).toMatchObject({ rate: 30, state: 'normal' })
    expect(c.game?.tick.mspt).toBeGreaterThan(0)
    expect(c.spawn?.chunks).toBe(289)
    expect(c.gamerules?.['minecraft:random_tick_speed']).toEqual({ value: 10, default: 3 })
    expect(c.mods?.some((m) => m.id === 'craftshot_companion')).toBe(true)
    expect(c.nearby?.[0].count).toBeGreaterThan(0)
    expect(companionTechnical(c)).toMatchObject({
      server: { targetMs: 1000 / 30, tickState: undefined },
      spawnCounts: { chunks: 289 }
    })
  })

  it('reads the targeted chest: state, contents and comparator signal', () => {
    const b = load('chest-26.3.craftshot.json').target.block!
    expect(b.state).toMatchObject({ facing: 'south', type: 'single' })
    expect(b.container?.items).toEqual([
      { id: 'minecraft:iron_ingot', count: 64, slot: 0 },
      { id: 'minecraft:redstone', count: 12, slot: 5 }
    ])
    expect(b.signal).toMatchObject({ received: 0, containerSignal: 1 })
    // The location keeps the block state for the UI.
    expect(companionLocation(load('chest-26.3.craftshot.json')).targetedBlock?.state?.facing).toBe(
      'south'
    )
  })

  it("reads the targeted villager's trades with enchantments", () => {
    const v = load('librarian-26.3.craftshot.json').target.entity!.villager!
    expect(v.profession).toBe('minecraft:librarian')
    expect(v.trades[0]).toMatchObject({
      buy: [{ id: 'minecraft:emerald', count: 12 }],
      sell: { id: 'minecraft:enchanted_book', enchantments: { 'minecraft:mending': 1 } }
    })
  })

  it('drops a malformed optional section instead of the whole file', () => {
    const c = parseCompanion(JSON.stringify({ ...village, game: { difficulty: 3 }, mods: 'x' }))!
    expect(c).not.toBeNull()
    expect(c.game).toBeUndefined()
    expect(c.mods).toBeUndefined()
    expect(c.biome).toBe('minecraft:plains')
  })
})
