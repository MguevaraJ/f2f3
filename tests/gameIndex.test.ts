import { describe, expect, it } from 'vitest'
import { buildGameIndex, gameClock } from '../src/shared/gameIndex'
import type { ScreenshotEntry } from '../src/shared/types'

const entry = (id: string, analysis: unknown, meta = {}): ScreenshotEntry =>
  ({
    id,
    name: id,
    folder: '',
    size: 1,
    mtimeMs: 0,
    capturedAt: 0,
    width: 1,
    height: 1,
    meta,
    analysis
  }) as never

describe('gameIndex', () => {
  it('formats the game clock', () => {
    expect(gameClock(0)).toBe('06:00')
    expect(gameClock(6000)).toBe('12:00')
    expect(gameClock(18500)).toBe('00:30')
  })

  it('exports what the app knows, worded', () => {
    const pos = { x: 10, y: 64, z: -3 }
    const index = buildGameIndex([
      entry(
        'a.png',
        {
          mod: null,
          location: { block: pos, position: pos },
          dimension: { id: 'minecraft:the_nether', source: 'f3' },
          biome: { id: 'minecraft:plains', source: 'vision' },
          mobs: [{ id: 'minecraft:cow', count: 3, source: 'f3' }],
          structures: []
        },
        { favorite: true, note: 'Base', tags: ['granja'], world: 'Mi mundo' }
      ),
      entry('b.png', null)
    ])
    const a = index.shots['a.png']
    expect(a).toMatchObject({
      world: 'Mi mundo',
      dimension: 'minecraft:the_nether',
      block: pos,
      favorite: true,
      note: 'Base',
      tags: ['granja']
    })
    const rows = Object.fromEntries(a.sections.flatMap((s) => s.rows))
    expect(rows['Coordenadas']).toBe('10 64 -3')
    expect(rows['Dimensión']).toBe('Nether (F3)')
    expect(rows['Bioma']).toMatch(/\(IA\)$/)
    expect(a.sections.find((s) => s.title === 'Mobs')?.rows[0][1]).toBe('×3')
    expect(index.shots['b.png']).toEqual({ world: '', sections: [] })
  })
})
