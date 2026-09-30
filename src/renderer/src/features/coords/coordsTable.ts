import { biomeName, dimensionName } from '@shared/catalog/biomes'
import { mobName } from '@shared/catalog/mobs'
import { structureName } from '@shared/catalog/structures'
import type { DataTable, TableCell } from '@shared/ipc'
import type { InfoSource, ScreenshotEntry, Vec3 } from '@shared/types'
import { blockString, convertDimension, DIRECTION_ES, distance, tpCommand } from '../../lib/coords'

const SOURCE: Record<InfoSource, string> = {
  mod: 'Mod (exacto)',
  f3: 'F3 (exacto)',
  vision: 'IA avanzada',
  local: 'Modelo local (estimado)',
  heuristic: 'Colores (aproximado)',
  manual: 'Manual'
}

const pad = (n: number): string => String(n).padStart(2, '0')
/** Local time, sortable as text in any spreadsheet: 2026-09-24 23:03:51. */
function localStamp(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export interface CoordsTableOptions {
  /** Coordinates converted to the other dimension (÷8 / ×8), as the table shows them. */
  convert: boolean
  reference: Vec3 | null
}

/**
 * The coordinates tab as an exportable table: same rows, same order and same
 * conversions as on screen, plus the extra F3 data a spreadsheet benefits from.
 * Screenshots passed in must have F3 block coordinates.
 */
export function buildCoordsTable(rows: ScreenshotEntry[], opts: CoordsTableOptions): DataTable {
  const suffix = opts.convert ? ' (convertida)' : ''
  const ref = opts.reference
  const columns = [
    { header: 'Captura', width: 26 },
    { header: 'Carpeta', width: 14 },
    { header: 'Fecha', width: 20 },
    { header: 'Dimensión', width: 12 },
    { header: `X${suffix}`, width: opts.convert ? 16 : 10 },
    { header: `Y${suffix}`, width: opts.convert ? 16 : 8 },
    { header: `Z${suffix}`, width: opts.convert ? 16 : 10 },
    { header: ref ? `Distancia a ${blockString(ref)}` : 'Distancia a 0,0', width: 22 },
    { header: 'Bioma', width: 24 },
    { header: 'Origen del bioma', width: 16 },
    { header: 'X exacta', width: 12 },
    { header: 'Y exacta', width: 12 },
    { header: 'Z exacta', width: 12 },
    { header: 'Chunk X', width: 9 },
    { header: 'Chunk Z', width: 9 },
    { header: 'Región', width: 13 },
    { header: 'Orientación', width: 12 },
    { header: 'Yaw', width: 8 },
    { header: 'Pitch', width: 8 },
    { header: 'Mobs', width: 24 },
    { header: 'Estructuras', width: 26 },
    { header: 'Versión', width: 10 },
    { header: 'Nota', width: 30 },
    { header: 'Comando /tp', width: 48 }
  ]

  const data: TableCell[][] = rows.map((s) => {
    const a = s.analysis!
    const f3 = a.location!
    const block = f3.block!
    const dim = a.dimension?.id
    const shown = opts.convert ? (convertDimension(block, dim)?.pos ?? block) : block
    const dist = ref ? distance(block, ref) : Math.hypot(block.x, block.z)
    return [
      s.name,
      s.folder || null,
      localStamp(s.capturedAt),
      dim ? dimensionName(dim) : null,
      shown.x,
      shown.y,
      shown.z,
      Math.round(dist),
      a.biome ? biomeName(a.biome.id) : null,
      a.biome ? SOURCE[a.biome.source] : null,
      f3.position?.x ?? null,
      f3.position?.y ?? null,
      f3.position?.z ?? null,
      f3.chunk?.x ?? null,
      f3.chunk?.z ?? null,
      f3.region ?? null,
      f3.facing ? (DIRECTION_ES[f3.facing.direction] ?? f3.facing.direction) : null,
      f3.facing?.yaw !== undefined ? round1(f3.facing.yaw) : null,
      f3.facing?.pitch !== undefined ? round1(f3.facing.pitch) : null,
      a.mobs
        .map((m) => (m.count > 1 ? `${mobName(m.id)} ×${m.count}` : mobName(m.id)))
        .join(', ') || null,
      a.structures.map((x) => structureName(x.id)).join(', ') || null,
      a.f3?.version ?? a.mod?.minecraft ?? null,
      s.meta.note ?? null,
      tpCommand(f3)
    ]
  })

  const date = new Date().toISOString().slice(0, 10)
  return {
    sheetName: 'Coordenadas',
    fileName: `craftshot-coordenadas-${date}`,
    columns,
    rows: data
  }
}
