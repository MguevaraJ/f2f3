import { strToU8, zipSync } from 'fflate'
import type { DataTable, TableCell } from '@shared/ipc'

/**
 * Serialises a table exactly as the UI shows it, to CSV or to a real Excel
 * workbook (.xlsx). The workbook is written as minimal SpreadsheetML zipped with
 * fflate: bold frozen header, auto-filter, column widths, and numbers stored as
 * numeric cells so Excel can sort and sum them.
 */

function csvCell(v: TableCell): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Neutralise spreadsheet formula injection from user-typed text (notes, names).
  if (typeof v === 'string' && /^[=+@\t]/.test(s)) s = `'${s}`
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function tableToCsv(table: DataTable): string {
  const lines = [
    table.columns.map((c) => csvCell(c.header)),
    ...table.rows.map((r) => r.map(csvCell))
  ]
  // BOM + CRLF: Excel opens accents and line breaks correctly.
  return '﻿' + lines.map((l) => l.join(',')).join('\r\n')
}

const xml = (s: string): string =>
  s
    // Characters XML 1.0 forbids would corrupt the workbook.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 0 → "A", 26 → "AA". */
export function columnName(index: number): string {
  let n = index + 1
  let name = ''
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function cellXml(ref: string, v: TableCell, header: boolean): string {
  const style = header ? ' s="1"' : ''
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`
}

export function tableToXlsx(table: DataTable): Uint8Array {
  const cols = table.columns
  const lastCol = columnName(Math.max(0, cols.length - 1))
  const lastRow = table.rows.length + 1
  const rowsXml = [cols.map((c) => c.header), ...table.rows]
    .map((row, r) => {
      const cells = row.map((v, c) => cellXml(`${columnName(c)}${r + 1}`, v, r === 0)).join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  const colsXml = cols
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.max(10, c.header.length + 4)}" customWidth="1"/>`
    )
    .join('')
  const sheetName = xml(table.sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja1')

  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>` +
      `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName}'!$A$1:$${lastCol}$${lastRow}</definedName></definedNames>` +
      '</workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    'xl/styles.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF3C8527"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<dimension ref="A1:${lastCol}${lastRow}"/>` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<cols>${colsXml}</cols>` +
      `<sheetData>${rowsXml}</sheetData>` +
      `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
      '</worksheet>'
  }
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), {
    level: 6
  })
}
