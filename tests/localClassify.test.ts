import { classifyScene, colourAgrees, rank } from '../src/core/localvision/classify'
import type { LabelEmbeddings } from '../src/core/localvision/labels'
import type { SceneEstimate } from '../src/core/vision/sceneHeuristics'

// Tiny fake "embedding space": one axis per label.
const labels: LabelEmbeddings = {
  model: 'fake',
  dim: 4,
  logitScale: 10,
  groups: {
    'biome:overworld': {
      ids: ['minecraft:plains', 'minecraft:cherry_grove'],
      vectors: [
        [1, 0, 0, 0],
        [0, 1, 0, 0]
      ]
    },
    'biome:nether': { ids: ['minecraft:nether_wastes'], vectors: [[1, 0, 0, 0]] },
    'biome:end': { ids: ['minecraft:the_end'], vectors: [[1, 0, 0, 0]] },
    mob: {
      ids: ['minecraft:pig', 'minecraft:slime', 'minecraft:enderman', 'none'],
      vectors: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
      ]
    }
  }
}
const img = { width: 400, height: 300, data: new Uint8Array(400 * 300 * 4).fill(90) }
/** Returns a scripted embedding: first call = scene, second = crosshair. */
const scripted = (scene: number[], crosshair: number[]) => {
  const q = [scene, crosshair]
  return async () => Float32Array.from(q.shift()!)
}

describe('local classifier decisions', () => {
  it('ranks with a softmax over scaled similarities', () => {
    const r = rank(Float32Array.from([1, 0, 0, 0]), labels.groups['biome:overworld'], 10)
    expect(r[0].id).toBe('minecraft:plains')
    expect(r[0].p + r[1].p).toBeCloseTo(1)
  })

  it('answers only when clearly confident', async () => {
    const sure = await classifyScene(
      img,
      labels,
      scripted([1, 0, 0, 0], [1, 0, 0, 0]),
      'minecraft:overworld'
    )
    expect(sure.biome?.id).toBe('minecraft:plains')
    expect(sure.targetedMob?.id).toBe('minecraft:pig')
    expect(sure.biome!.confidence).toBeLessThanOrEqual(0.85) // estimates never claim certainty

    const unsure = await classifyScene(
      img,
      labels,
      scripted([0.5, 0.5, 0, 0], [0.4, 0, 0, 0.4]),
      'minecraft:overworld'
    )
    expect(unsure.biome).toBeNull()
    expect(unsure.targetedMob).toBeNull()
  })

  it('does not report "nothing there" as a mob', async () => {
    const r = await classifyScene(
      img,
      labels,
      scripted([1, 0, 0, 0], [0, 0, 0, 1]),
      'minecraft:overworld'
    )
    expect(r.targetedMob).toBeNull()
  })

  it('only considers mobs of the dimension (no slimes in the Nether)', async () => {
    const r = await classifyScene(
      img,
      labels,
      scripted([1, 0, 0, 0], [0, 1, 0, 0]),
      'minecraft:the_nether'
    )
    expect(r.targetedMob).toBeNull()
  })

  it('requires a much higher score for endermen (portals and dark tunnels fool the model)', async () => {
    const r = await classifyScene(
      img,
      labels,
      scripted([1, 0, 0, 0], [0, 0, 0.24, 0]), // ≈78%: fine for a pig, not for an enderman
      'minecraft:overworld'
    )
    expect(r.targetedMob).toBeNull()
  })

  it('colour-defined biomes must show their colour', () => {
    const scene = (m: Partial<SceneEstimate['materials']>) => ({ materials: m }) as SceneEstimate
    expect(colourAgrees('minecraft:cherry_grove', scene({ cherry: 0.01 }))).toBe(false) // a pink pig
    expect(colourAgrees('minecraft:cherry_grove', scene({ cherry: 0.2 }))).toBe(true)
    expect(colourAgrees('minecraft:badlands', scene({ terracotta: 0.02 }))).toBe(false) // lava
    expect(colourAgrees('minecraft:plains', scene({}))).toBe(true)
  })
})
