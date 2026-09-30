import { biomeName, dimensionName } from '@shared/catalog/biomes'
import { mobName } from '@shared/catalog/mobs'
import { structureName } from '@shared/catalog/structures'
import type { InfoSource, ScreenshotEntry } from '@shared/types'

export type SortKey = 'date' | 'name' | 'size' | 'x' | 'y' | 'z' | 'origin' | 'biome' | 'dimension'
export type SortDir = 'asc' | 'desc'

export type LibraryView =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'f3' }
  | { kind: 'mobs' }
  | { kind: 'folder'; path: string; recursive: boolean }

export interface Filters {
  dimensions: string[]
  biomes: string[]
  mobs: string[]
  structures: string[]
  onlyF3: boolean
  onlyFavorites: boolean
  biomeSources: InfoSource[]
  from: string // yyyy-mm-dd
  to: string
}

export const EMPTY_FILTERS: Filters = {
  dimensions: [],
  biomes: [],
  mobs: [],
  structures: [],
  onlyF3: false,
  onlyFavorites: false,
  biomeSources: [],
  from: '',
  to: ''
}

export interface Query {
  view: LibraryView
  search: string
  filters: Filters
  sort: { key: SortKey; dir: SortDir }
}

export function activeFilterCount(f: Filters): number {
  return (
    f.dimensions.length +
    f.biomes.length +
    f.mobs.length +
    f.structures.length +
    f.biomeSources.length +
    Number(f.onlyF3) +
    Number(f.onlyFavorites) +
    Number(!!f.from) +
    Number(!!f.to)
  )
}

/** Text a screenshot can be found by: name, folder, biome, dimension, mobs, notes, tags, version. */
export function searchableText(s: ScreenshotEntry): string {
  const a = s.analysis
  const parts = [s.name, s.folder, s.meta.note, ...(s.meta.tags ?? [])]
  if (a?.biome) parts.push(a.biome.id, biomeName(a.biome.id))
  if (a?.dimension) parts.push(a.dimension.id, dimensionName(a.dimension.id))
  for (const m of a?.mobs ?? []) parts.push(m.id, mobName(m.id))
  for (const st of a?.structures ?? []) parts.push(st.id, structureName(st.id))
  if (a?.f3?.version) parts.push(a.f3.version)
  if (a?.mod) parts.push('mod', a.mod.minecraft, a.mod.world.name)
  if (a?.location?.targetedBlock?.id) parts.push(a.location.targetedBlock.id)
  if (a?.vision) parts.push(a.vision.description)
  if (a?.hasF3) parts.push('f3')
  return parts.filter(Boolean).join(' ').toLowerCase()
}

const strip = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Coordinate predicates in the search box: "x>1000", "y<0", "z=-84". */
const COORD_RE = /^([xyz])(<=|>=|<|>|=)(-?\d+(?:\.\d+)?)$/i

function matchesSearch(s: ScreenshotEntry, search: string): boolean {
  const tokens = strip(search.toLowerCase()).split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const hay = strip(searchableText(s))
  return tokens.every((t) => {
    const c = COORD_RE.exec(t)
    if (c) {
      const pos = s.analysis?.location?.position
      if (!pos) return false
      const v = pos[c[1].toLowerCase() as 'x' | 'y' | 'z']
      const n = Number(c[3])
      switch (c[2]) {
        case '<':
          return v < n
        case '>':
          return v > n
        case '<=':
          return v <= n
        case '>=':
          return v >= n
        default:
          return Math.floor(v) === Math.floor(n)
      }
    }
    return hay.includes(t)
  })
}

function inView(s: ScreenshotEntry, view: LibraryView): boolean {
  switch (view.kind) {
    case 'all':
      return true
    case 'favorites':
      return !!s.meta.favorite
    case 'f3':
      return !!s.analysis?.location
    case 'mobs':
      return !!s.analysis?.mobs.length
    case 'folder':
      return view.recursive
        ? view.path === '' || s.folder === view.path || s.folder.startsWith(view.path + '/')
        : s.folder === view.path
  }
}

function matchesFilters(s: ScreenshotEntry, f: Filters): boolean {
  const a = s.analysis
  if (f.onlyF3 && !a?.location) return false
  if (f.onlyFavorites && !s.meta.favorite) return false
  if (f.dimensions.length && !(a?.dimension && f.dimensions.includes(a.dimension.id))) return false
  if (f.biomes.length && !(a?.biome && f.biomes.includes(a.biome.id))) return false
  if (f.biomeSources.length && !(a?.biome && f.biomeSources.includes(a.biome.source))) return false
  if (f.mobs.length && !a?.mobs.some((m) => f.mobs.includes(m.id))) return false
  if (f.structures.length && !a?.structures.some((x) => f.structures.includes(x.id))) return false
  if (f.from && s.capturedAt < new Date(`${f.from}T00:00:00`).getTime()) return false
  if (f.to && s.capturedAt > new Date(`${f.to}T23:59:59.999`).getTime()) return false
  return true
}

function sortValue(s: ScreenshotEntry, key: SortKey): number | string | null {
  const p = s.analysis?.location?.position
  switch (key) {
    case 'date':
      return s.capturedAt
    case 'name':
      return s.name.toLowerCase()
    case 'size':
      return s.size
    case 'x':
    case 'y':
    case 'z':
      return p ? p[key] : null
    case 'origin':
      return p ? Math.hypot(p.x, p.z) : null
    case 'biome':
      return s.analysis?.biome ? biomeName(s.analysis.biome.id).toLowerCase() : null
    case 'dimension':
      return s.analysis?.dimension ? dimensionName(s.analysis.dimension.id).toLowerCase() : null
  }
}

export function applyQuery(items: ScreenshotEntry[], q: Query): ScreenshotEntry[] {
  const out = items.filter(
    (s) => inView(s, q.view) && matchesFilters(s, q.filters) && matchesSearch(s, q.search)
  )
  const dir = q.sort.dir === 'asc' ? 1 : -1
  return out.sort((a, b) => {
    const va = sortValue(a, q.sort.key)
    const vb = sortValue(b, q.sort.key)
    // Screenshots without the value always go last, whatever the direction.
    if (va === null && vb === null) return b.capturedAt - a.capturedAt
    if (va === null) return 1
    if (vb === null) return -1
    const cmp =
      typeof va === 'string'
        ? va.localeCompare(vb as string, 'es', { numeric: true })
        : va - (vb as number)
    return cmp * dir || b.capturedAt - a.capturedAt
  })
}

/** Distinct values present in the library, for filter pickers. */
export function facets(items: ScreenshotEntry[]): {
  dimensions: string[]
  biomes: string[]
  mobs: string[]
  structures: string[]
} {
  const d = new Set<string>()
  const b = new Set<string>()
  const m = new Set<string>()
  const st = new Set<string>()
  for (const s of items) {
    if (s.analysis?.dimension) d.add(s.analysis.dimension.id)
    if (s.analysis?.biome) b.add(s.analysis.biome.id)
    for (const mob of s.analysis?.mobs ?? []) m.add(mob.id)
    for (const x of s.analysis?.structures ?? []) st.add(x.id)
  }
  const byName = (f: (id: string) => string) => (x: string, y: string) =>
    f(x).localeCompare(f(y), 'es')
  return {
    dimensions: [...d].sort(byName(dimensionName)),
    biomes: [...b].sort(byName(biomeName)),
    mobs: [...m].sort(byName(mobName)),
    structures: [...st].sort(byName(structureName))
  }
}

export type Facets = ReturnType<typeof facets>
