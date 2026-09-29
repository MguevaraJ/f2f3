import {
  carryOver,
  resolveAnalysis,
  withLocal,
  withManualBiome,
  withVision
} from '../src/core/analyze'
import { biomeHiddenInF3 } from '../src/shared/f3Tips'
import type { F3Data, ScreenshotAnalysis, VisionResult } from '../src/shared/types'

const f3 = (patch: Partial<F3Data> = {}): F3Data => ({
  fields: [],
  lines: { left: [], right: [] },
  ...patch
})

function base(patch: Partial<ScreenshotAnalysis> = {}): ScreenshotAnalysis {
  return resolveAnalysis({
    schema: 5,
    fingerprint: 'x',
    analyzedAt: 0,
    hasF3: false,
    f3: null,
    ocr: null,
    heuristic: {
      dimension: 'minecraft:overworld',
      biome: { id: 'minecraft:plains', confidence: 0.25 }
    },
    local: null,
    vision: null,
    manualBiome: null,
    dimension: null,
    biome: null,
    mobs: [],
    structures: [],
    averageColor: '#000',
    ...patch
  })
}

const vision: VisionResult = {
  provider: 'gemini',
  model: 'gemini-x',
  analyzedAt: 1,
  description: 'Una aldea',
  biome: { id: 'minecraft:desert', confidence: 0.9 },
  mobs: [{ id: 'minecraft:villager', count: 3 }],
  structures: ['minecraft:village']
}
const local = {
  model: 'clip',
  analyzedAt: 1,
  biome: { id: 'minecraft:beach', confidence: 0.6 },
  targetedMob: { id: 'minecraft:pig', confidence: 0.72 }
}

describe('information sources', () => {
  it('falls back to the colour estimate when nothing else is known', () => {
    const a = base()
    expect(a.biome).toMatchObject({ id: 'minecraft:plains', source: 'heuristic' })
    expect(a.dimension).toMatchObject({ source: 'heuristic' })
  })

  it('prefers the local model over colours, and the advanced AI over the local model', () => {
    const withLocalModel = withLocal(base(), local)
    expect(withLocalModel.biome).toMatchObject({ id: 'minecraft:beach', source: 'local' })
    expect(withLocalModel.mobs).toEqual([
      expect.objectContaining({ id: 'minecraft:pig', source: 'local' })
    ])

    const withAi = withVision(withLocalModel, vision)
    expect(withAi.biome).toMatchObject({ id: 'minecraft:desert', source: 'vision' })
    // The AI saw the whole scene: the local crosshair guess is dropped.
    expect(withAi.mobs).toEqual([
      expect.objectContaining({ id: 'minecraft:villager', count: 3, source: 'vision' })
    ])
    expect(withAi.structures).toEqual([{ id: 'minecraft:village', source: 'vision' }])
  })

  it('never lets an estimate override the F3, and the user overrides everything', () => {
    const a = withVision(
      withLocal(
        base({
          hasF3: true,
          f3: f3({
            biome: 'minecraft:sparse_jungle',
            dimension: 'minecraft:overworld',
            targetedEntity: 'minecraft:cow'
          })
        }),
        local
      ),
      vision
    )
    expect(a.biome).toMatchObject({ id: 'minecraft:sparse_jungle', source: 'f3' })
    expect(a.dimension).toMatchObject({ source: 'f3' })
    expect(a.mobs[0]).toMatchObject({ id: 'minecraft:cow', source: 'f3' })

    const manual = withManualBiome(a, 'minecraft:jungle')
    expect(manual.biome).toMatchObject({ id: 'minecraft:jungle', source: 'manual' })
    expect(withManualBiome(manual, null).biome).toMatchObject({ source: 'f3' })
  })

  it('keeps AI, local and manual results across an offline re-analysis', () => {
    const prev = withManualBiome(withVision(withLocal(base(), local), vision), 'minecraft:savanna')
    const again = carryOver(base(), prev)
    expect(again.vision?.provider).toBe('gemini')
    expect(again.local?.targetedMob?.id).toBe('minecraft:pig')
    expect(again.biome).toMatchObject({ id: 'minecraft:savanna', source: 'manual' })
  })

  it('drops free-text structures from older AI results', () => {
    const old = withVision(base(), { ...vision, structures: ['aldea', 'minecraft:village'] })
    expect(carryOver(base(), old).structures).toEqual([
      { id: 'minecraft:village', source: 'vision' }
    ])
  })
})

describe('biomeHiddenInF3', () => {
  const withF3 = (p: Partial<F3Data>) => base({ hasF3: true, f3: f3(p) })
  it('detects new debug screens that hide the biome', () => {
    expect(biomeHiddenInF3(withF3({ version: '26.3' }))).toBe(true)
    expect(biomeHiddenInF3(withF3({ version: '1.21.9' }))).toBe(true)
    expect(
      biomeHiddenInF3(withF3({ lines: { left: ['To edit: press [F3+F6]'], right: [] } }))
    ).toBe(true)
  })
  it('stays quiet when the biome is shown, on old versions, or without F3', () => {
    expect(biomeHiddenInF3(withF3({ version: '26.3', biome: 'minecraft:plains' }))).toBe(false)
    expect(biomeHiddenInF3(withF3({ version: '1.20.1' }))).toBe(false)
    expect(biomeHiddenInF3(base())).toBe(false)
  })
})
