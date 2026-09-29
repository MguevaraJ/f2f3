import { looksLikeDebugScreen, parseF3, type DebugLine } from '../src/core/f3/parseF3'

const L = (index: number, text: string): DebugLine => ({ index, side: 'left', text })
const R = (index: number, text: string): DebugLine => ({ index, side: 'right', text })

const vanilla: DebugLine[] = [
  L(0, '119 fps T: 120 (immediate) @180Hz'),
  R(0, 'Minecraft 26.3 (26.3/vanilla)'),
  L(9, 'XYZ: 4707.790 / 73.00000 / 1904.843'),
  L(10, 'Block: 4707 73 1904'),
  L(11, 'Chunk: 294 4 119 [6 23 in r.9.3.mca]'),
  L(12, 'Facing: south (Towards positive Z) (-33.8 / 10.3)'),
  L(13, 'minecraft:overworld FC: 0'),
  L(14, 'Section-relative: 03 09 00'),
  R(5, 'Java: 25.0.1'),
  R(9, 'AMD Radeon RX 6700 XT (RADV NAVI22) (dGPU)'),
  R(12, 'Targeted Entity'),
  R(13, 'minecraft:zombie')
]

describe('parseF3', () => {
  const f3 = parseF3(vanilla)

  it('extracts coordinates, chunk and region', () => {
    expect(f3.position).toEqual({ x: 4707.79, y: 73, z: 1904.843 })
    expect(f3.block).toEqual({ x: 4707, y: 73, z: 1904 })
    expect(f3.chunk).toEqual({ x: 294, y: 4, z: 119 })
    expect(f3.region).toBe('r.9.3.mca')
    expect(f3.chunkRelative).toEqual({ x: 3, y: 9, z: 0 })
  })

  it('extracts facing, dimension, version and hardware', () => {
    expect(f3.facing).toEqual({
      direction: 'south',
      towards: 'positive Z',
      yaw: -33.8,
      pitch: 10.3
    })
    expect(f3.dimension).toBe('minecraft:overworld')
    expect(f3.version).toBe('26.3')
    expect(f3.fps).toBe(119)
    expect(f3.java).toBe('25.0.1')
    expect(f3.gpu).toContain('RX 6700 XT')
  })

  it('reads the targeted entity from the following line', () => {
    expect(f3.targetedEntity).toBe('minecraft:zombie')
  })

  it('keeps blank lines so the overlay can be re-drawn', () => {
    expect(f3.lines.left.slice(0, 3)).toEqual(['119 fps T: 120 (immediate) @180Hz', '', ''])
  })

  it('derives chunk/region from the block when the game hides them', () => {
    const p = parseF3([L(0, 'XYZ: -610.300 / 32.00000 / 660.300')])
    expect(p.block).toEqual({ x: -611, y: 32, z: 660 })
    expect(p.chunk).toEqual({ x: -39, y: 2, z: 41 })
    expect(p.region).toBe('r.-2.1.mca')
  })

  it('recognises real overlays and rejects random text', () => {
    expect(looksLikeDebugScreen(vanilla)).toBe(true)
    expect(looksLikeDebugScreen([L(0, 'Hello world'), L(1, 'Welcome to the server')])).toBe(false)
  })
})
