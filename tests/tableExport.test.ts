import { strFromU8, unzipSync } from 'fflate'
import { columnName, tableToCsv, tableToXlsx } from '../src/main/tableExport'
import { buildCoordsTable } from '../src/renderer/src/features/coords/coordsTable'
import type { DataTable } from '../src/shared/ipc'
import type { ScreenshotEntry } from '../src/shared/types'

const table: DataTable = {
  sheetName: 'Coordenadas',
  fileName: 'x',
  columns: [{ header: 'Captura' }, { header: 'X' }, { header: 'Nota' }],
  rows: [
    ['a.png', -1087, 'granja <hierro> & "oro"'],
    ['b.png', 12.5, '=HYPERLINK("http://x")'],
    ['c.png', null, null]
  ]
}

describe('table export', () => {
  it('writes CSV with BOM, quoting and formula neutralisation', () => {
    const csv = tableToCsv(table)
    expect(csv.startsWith('﻿Captura,X,Nota\r\n')).toBe(true)
    expect(csv).toContain('a.png,-1087,"granja <hierro> & ""oro"""')
    expect(csv).toContain(`b.png,12.5,"'=HYPERLINK(""http://x"")"`)
    expect(csv.endsWith('c.png,,')).toBe(true)
  })

  it('writes a valid xlsx package with numeric cells, escaping and a frozen filtered header', () => {
    const files = unzipSync(tableToXlsx(table))
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/workbook.xml',
        'xl/styles.xml',
        'xl/worksheets/sheet1.xml'
      ])
    )
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('<c r="B2"><v>-1087</v></c>')
    expect(sheet).toContain('granja &lt;hierro&gt; &amp; &quot;oro&quot;')
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">')
    expect(sheet).toContain('<autoFilter ref="A1:C4"/>')
    expect(sheet).toContain('state="frozen"')
    // Strings are never interpreted as formulas in xlsx: no <f> elements.
    expect(sheet).not.toContain('<f>')
  })

  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 51, 52].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })
})

describe('coordinates table', () => {
  const f3 = {
    position: { x: 1473.278, y: 44, z: -83.598 },
    block: { x: 1473, y: 44, z: -84 },
    chunk: { x: 92, y: 2, z: -6 },
    region: 'r.2.-1.mca',
    dimension: 'minecraft:the_nether',
    facing: { direction: 'north', yaw: -167.2, pitch: -42.7 },
    fields: [],
    lines: { left: [], right: [] }
  }
  const shot = {
    id: 'n.png',
    name: 'n.png',
    folder: '',
    size: 1,
    mtimeMs: 0,
    capturedAt: new Date(2026, 8, 24, 14, 40, 15).getTime(),
    width: 1,
    height: 1,
    meta: { note: 'portal' },
    analysis: {
      schema: 1,
      fingerprint: '',
      analyzedAt: 0,
      hasF3: true,
      ocr: null,
      vision: null,
      averageColor: '#000',
      dimension: { id: 'minecraft:the_nether', source: 'f3' },
      biome: { id: 'minecraft:nether_wastes', source: 'heuristic', confidence: 0.3 },
      mobs: [{ id: 'minecraft:ghast', count: 2, source: 'vision' }],
      structures: [{ id: 'minecraft:fortress', source: 'vision' }],
      heuristic: { dimension: null, biome: null },
      local: null,
      manualBiome: null,
      mod: null,
      f3,
      location: { source: 'f3', ...f3 }
    }
  } as ScreenshotEntry

  it('mirrors the on-screen values, including conversion and reference distance', () => {
    const plain = buildCoordsTable([shot], { convert: false, reference: null })
    const row = Object.fromEntries(plain.columns.map((c, i) => [c.header, plain.rows[0][i]]))
    expect(row).toMatchObject({
      Captura: 'n.png',
      Fecha: '2026-09-24 14:40:15',
      Dimensión: 'Nether',
      X: 1473,
      Z: -84,
      'Distancia a 0,0': 1475,
      Bioma: 'Desiertos del Nether',
      'Origen del bioma': 'Colores (aproximado)',
      'X exacta': 1473.278,
      Región: 'r.2.-1.mca',
      Orientación: 'Norte',
      Mobs: 'Ghast ×2',
      Estructuras: 'Fortaleza del Nether',
      Nota: 'portal'
    })
    expect(String(row['Comando /tp'])).toContain(
      '/execute in minecraft:the_nether run tp @s 1473.278 44 -83.598'
    )

    const conv = buildCoordsTable([shot], { convert: true, reference: { x: 1473, y: 44, z: -80 } })
    expect(conv.columns[4].header).toBe('X (convertida)')
    expect(conv.rows[0].slice(4, 8)).toEqual([11784, 44, -672, 4])
  })
})
