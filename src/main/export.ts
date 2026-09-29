import { biomeName, dimensionName } from '@shared/catalog/biomes'
import { mobName } from '@shared/catalog/mobs'
import type { ScreenshotEntry } from '@shared/types'

const COLUMNS = [
  'archivo',
  'carpeta',
  'fecha',
  'dimension',
  'bioma',
  'fuente_bioma',
  'x',
  'y',
  'z',
  'bloque_x',
  'bloque_y',
  'bloque_z',
  'chunk_x',
  'chunk_z',
  'region',
  'orientacion',
  'yaw',
  'pitch',
  'mobs',
  'version',
  'favorito',
  'nota'
]

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(entries: ScreenshotEntry[]): string {
  const rows = entries.map((e) => {
    const a = e.analysis
    const f = a?.f3
    return [
      e.name,
      e.folder,
      new Date(e.capturedAt).toISOString(),
      a?.dimension ? dimensionName(a.dimension.id) : '',
      a?.biome ? biomeName(a.biome.id) : '',
      a?.biome?.source,
      f?.position?.x,
      f?.position?.y,
      f?.position?.z,
      f?.block?.x,
      f?.block?.y,
      f?.block?.z,
      f?.chunk?.x,
      f?.chunk?.z,
      f?.region,
      f?.facing?.direction,
      f?.facing?.yaw,
      f?.facing?.pitch,
      a?.mobs.map((m) => `${mobName(m.id)} x${m.count}`).join(' | '),
      f?.version,
      e.meta.favorite ? 'si' : '',
      e.meta.note
    ]
      .map(cell)
      .join(',')
  })
  // BOM so Excel opens accents correctly.
  return '﻿' + [COLUMNS.join(','), ...rows].join('\n')
}

export function toJson(entries: ScreenshotEntry[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      file: e.id,
      capturedAt: new Date(e.capturedAt).toISOString(),
      meta: e.meta,
      dimension: e.analysis?.dimension,
      biome: e.analysis?.biome,
      mobs: e.analysis?.mobs,
      f3: e.analysis?.f3 && { ...e.analysis.f3, lines: undefined },
      vision: e.analysis?.vision
    })),
    null,
    2
  )
}
