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

describe('parseF3 technical entries (26.3 debug screen)', () => {
  const f3 = parseF3([
    L(5, 'Day #12'),
    L(6, 'SC: 289, MO: 70, C: 162, AM: 15, AX: 0, UWC: 5, WC: 7, WA: 0, MI: 0'),
    R(6, 'Integrated server @ 6.7/50.0 ms (sprinting), 21 tx, 450 rx'),
    L(8, 'CH S: 101 M: 101 ML: 101'),
    L(9, 'SH S: 101 O: 99 M: 101 ML: 101'),
    L(13, 'Targeted Block: -1020, 102, -702'),
    L(14, 'minecraft:repeater'),
    L(15, 'delay: 3'),
    L(16, 'facing: south'),
    L(17, 'powered: false'),
    L(18, '#minecraft:mineable/pickaxe'),
    L(19, '#minecraft:blocks_fluid_flow., •'),
    L(20, '#c:redstone'),
    R(21, 'Speed: 0.215 blocks/tick')
  ])

  it('reads the server tick time and /tick state', () => {
    expect(f3.server).toEqual({ mspt: 6.7, targetMs: 50, tickState: 'sprinting' })
    expect(parseF3([R(0, '"Paper" server, 3 tx, 40 rx')]).server).toEqual({ brand: 'Paper' })
    expect(
      parseF3([R(0, 'Integrated server @ 61.2/50.0 ms (frozen - stepping), 1 tx, 2 rx')]).server
        ?.tickState
    ).toBe('stepping')
  })

  it('reads the mob cap counts in MobCategory order', () => {
    expect(f3.spawnCounts).toEqual({
      chunks: 289,
      counts: {
        monster: 70,
        creature: 162,
        ambient: 15,
        axolotls: 0,
        underground_water_creature: 5,
        water_creature: 7,
        water_ambient: 0,
        misc: 0
      }
    })
    // 1.20.1 used ambiguous single letters: position decides.
    const old = parseF3([L(0, 'SC: 144, M: 12, C: 3, A: 1, A: 0, U: 0, W: 2, W: 0, M: 0')])
    expect(old.spawnCounts?.counts).toMatchObject({
      monster: 12,
      ambient: 1,
      water_creature: 2,
      misc: 0
    })
  })

  it('reads the targeted block state and clean tags', () => {
    expect(f3.targetedBlock).toEqual({
      pos: { x: -1020, y: 102, z: -702 },
      id: 'minecraft:repeater',
      state: { delay: '3', facing: 'south', powered: 'false' },
      tags: ['minecraft:mineable/pickaxe', 'c:redstone']
    })
  })

  it('reads day, speed and heightmaps', () => {
    expect(f3.day).toBe(12)
    expect(f3.speed).toBe(0.215)
    expect(f3.heightmaps).toEqual({
      client: { S: 101, M: 101, ML: 101 },
      server: { S: 101, O: 99, M: 101, ML: 101 }
    })
  })

  it('recognises a trimmed overlay by its technical lines', () => {
    expect(
      looksLikeDebugScreen([L(0, 'Day #3'), R(0, 'Integrated server @ 5.0/50.0 ms, 1 tx, 1 rx')])
    ).toBe(true)
  })
})
