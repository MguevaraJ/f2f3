import { applyQuery, EMPTY_FILTERS, facets, type Query } from '../src/renderer/src/lib/query'
import type { ScreenshotAnalysis, ScreenshotEntry } from '../src/shared/types'

function shot(
  id: string,
  capturedAt: number,
  a: Partial<ScreenshotAnalysis> | null,
  meta = {}
): ScreenshotEntry {
  return {
    id,
    name: id,
    folder: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '',
    size: 1,
    mtimeMs: capturedAt,
    capturedAt,
    width: 1,
    height: 1,
    meta,
    analysis: a && {
      schema: 1,
      fingerprint: '',
      analyzedAt: 0,
      hasF3: false,
      f3: null,
      ocr: null,
      dimension: null,
      biome: null,
      mobs: [],
      structures: [],
      heuristic: { dimension: null, biome: null },
      local: null,
      manualBiome: null,
      vision: null,
      averageColor: '#000',
      ...a
    }
  }
}

const f3 = (x: number, y: number, z: number) =>
  ({
    position: { x, y, z },
    block: { x, y, z },
    fields: [],
    lines: { left: [], right: [] }
  }) as never

const items = [
  shot(
    'base.png',
    3,
    {
      hasF3: true,
      f3: f3(100, 64, -20),
      biome: { id: 'minecraft:plains', source: 'f3', confidence: 1 },
      dimension: { id: 'minecraft:overworld', source: 'f3' }
    },
    { favorite: true, note: 'granja de hierro' }
  ),
  shot('nether/portal.png', 2, {
    hasF3: true,
    f3: f3(12, 70, -3),
    dimension: { id: 'minecraft:the_nether', source: 'f3' },
    mobs: [{ id: 'minecraft:ghast', count: 2, source: 'vision' }]
  }),
  shot('plain.png', 1, { biome: { id: 'minecraft:desert', source: 'heuristic', confidence: 0.4 } })
]

const q = (patch: Partial<Query> = {}): Query => ({
  view: { kind: 'all' },
  search: '',
  filters: EMPTY_FILTERS,
  sort: { key: 'date', dir: 'desc' },
  ...patch
})
const ids = (list: ScreenshotEntry[]) => list.map((s) => s.id)

describe('library query', () => {
  it('sorts by date descending by default', () => {
    expect(ids(applyQuery(items, q()))).toEqual(['base.png', 'nether/portal.png', 'plain.png'])
  })

  it('searches names, Spanish biome names, notes and mobs (accent-insensitive)', () => {
    expect(ids(applyQuery(items, q({ search: 'llanura' })))).toEqual(['base.png'])
    expect(ids(applyQuery(items, q({ search: 'hierro' })))).toEqual(['base.png'])
    expect(ids(applyQuery(items, q({ search: 'ghast' })))).toEqual(['nether/portal.png'])
    expect(ids(applyQuery(items, q({ search: 'desierto' })))).toEqual(['plain.png'])
  })

  it('supports coordinate predicates', () => {
    expect(ids(applyQuery(items, q({ search: 'x>50' })))).toEqual(['base.png'])
    expect(ids(applyQuery(items, q({ search: 'y>=70' })))).toEqual(['nether/portal.png'])
  })

  it('filters by dimension, F3, favourites and folder', () => {
    expect(
      ids(
        applyQuery(
          items,
          q({ filters: { ...EMPTY_FILTERS, dimensions: ['minecraft:the_nether'] } })
        )
      )
    ).toEqual(['nether/portal.png'])
    expect(ids(applyQuery(items, q({ filters: { ...EMPTY_FILTERS, onlyF3: true } })))).toHaveLength(
      2
    )
    expect(ids(applyQuery(items, q({ view: { kind: 'favorites' } })))).toEqual(['base.png'])
    expect(
      ids(applyQuery(items, q({ view: { kind: 'folder', path: 'nether', recursive: false } })))
    ).toEqual(['nether/portal.png'])
  })

  it('puts screenshots without the sort value last in both directions', () => {
    expect(ids(applyQuery(items, q({ sort: { key: 'x', dir: 'asc' } }))).at(-1)).toBe('plain.png')
    expect(ids(applyQuery(items, q({ sort: { key: 'x', dir: 'desc' } })))).toEqual([
      'base.png',
      'nether/portal.png',
      'plain.png'
    ])
  })

  it('computes facets from the library', () => {
    expect(facets(items).mobs).toEqual(['minecraft:ghast'])
    expect(facets(items).dimensions).toHaveLength(2)
  })
})
