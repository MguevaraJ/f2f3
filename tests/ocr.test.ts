import { analyzeImage } from '../src/core/analyze'
import { readDebugOverlay } from '../src/core/ocr/debugOverlayOcr'
import { fixture, gameFont, jar } from './helpers'

describe.skipIf(!jar)('F3 OCR with the real Minecraft font', () => {
  it('reads a vanilla 26.3 overlay at GUI scale 2 exactly', () => {
    const out = readDebugOverlay(gameFont(), fixture('f3-26.3-nether-scale2.png'))!
    expect(out.guiScale).toBe(2)
    expect(out.confidence).toBe(1)
    const text = out.lines.map((l) => l.text)
    expect(text).toContain('Minecraft 26.3 (26.3/vanilla)')
    expect(text).toContain('XYZ: 1473.278 / 44.00000 / -83.598')
    expect(text).toContain('Chunk: 92 2 -6 [28 26 in r.2.-1.mca]')
    expect(text).toContain('minecraft:the_nether FC: 0')
  })

  it('reads a modded 1.20.1 overlay at GUI scale 4 (tinted text, coloured lines)', () => {
    const out = readDebugOverlay(gameFont(), fixture('f3-1.20.1-forge-scale4.png'))!
    expect(out.guiScale).toBe(4)
    expect(out.confidence).toBeGreaterThan(0.98)
    const embeddium = out.lines.find((l) => l.text.startsWith('Embeddium Renderer'))
    expect(embeddium?.color).toBe('#55ff55')
    expect(embeddium?.side).toBe('right')
  })

  it('produces a structured analysis with F3 precedence', () => {
    const a = analyzeImage(fixture('f3-1.20.1-forge-scale4.png'), gameFont(), 'fp')
    expect(a.hasF3).toBe(true)
    expect(a.biome).toEqual({ id: 'minecraft:sparse_jungle', source: 'f3', confidence: 1 })
    expect(a.dimension).toEqual({ id: 'minecraft:overworld', source: 'f3' })
    expect(a.f3?.block).toEqual({ x: 40, y: 63, z: 40 })
    // The XYZ line is partially covered by the right column: x/y survive, z comes from Block.
    expect(a.f3?.position).toEqual({ x: 40.058, y: 63, z: 40 })
    expect(a.f3?.localDifficulty?.day).toBe(12)
  })

  it('does not hallucinate an overlay on a plain screenshot', () => {
    const a = analyzeImage(fixture('no-f3.png'), gameFont(), 'fp')
    expect(a.hasF3).toBe(false)
    expect(a.f3).toBeNull()
  })
})
