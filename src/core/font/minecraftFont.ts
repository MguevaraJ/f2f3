import { readFileSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { PNG } from 'pngjs'

/**
 * Loads the bitmap glyphs of Minecraft's default font straight from a game jar
 * (or a resource pack zip / extracted folder). Using the real font lets the OCR
 * match the debug overlay pixel-perfectly instead of guessing like a generic OCR.
 *
 * Glyph columns are stored as bit masks over the rows -4..8 of a text line
 * (bit i ⇔ row i - 4), which covers accents that rise above the line box.
 */

export const ROW_OFFSET = 4
/** Rows 0..7 of the line: must match exactly. */
export const EXACT_ROWS = 0xff << ROW_OFFSET
/** Rows -4..-1: glyph ink must be present, extra ink is tolerated (previous line). */
export const ABOVE_ROWS = (1 << ROW_OFFSET) - 1

export interface Glyph {
  char: string
  /** Horizontal advance in font pixels, including the 1px spacing column. */
  advance: number
  /** One mask per column, length === advance (last column(s) are empty). */
  columns: Uint32Array
  /** Number of ink pixels, used to break ties towards richer glyphs. */
  ink: number
}

export interface MinecraftFont {
  source: string
  glyphs: Glyph[]
  spaceAdvance: number
  /** Glyphs bucketed by the mask of their first column. */
  byFirstColumn: Map<number, Glyph[]>
}

interface FontFileSystem {
  label: string
  read(path: string): Uint8Array | undefined
}

interface BitmapProviderDef {
  type: 'bitmap'
  file: string
  ascent?: number
  height?: number
  chars: string[]
}

interface ProviderDef {
  type: string
  id?: string
  file?: string
  advances?: Record<string, number>
}

/** Code points worth recognising in the debug overlay. Keeps confusables (Greek/Cyrillic) out. */
function isInteresting(cp: number): boolean {
  if (cp >= 0x21 && cp <= 0x7e) return true
  if (cp >= 0xa1 && cp <= 0x17f) return true // Latin-1 + Latin Extended-A (accents)
  return [0x2190, 0x2191, 0x2192, 0x2193, 0x2013, 0x2014, 0x2022, 0x2026, 0x221e].includes(cp)
}

function zipFileSystem(path: string): FontFileSystem {
  const wanted = (name: string): boolean =>
    name.startsWith('assets/') &&
    (name.includes('/font/') || name.includes('/textures/font/')) &&
    (name.endsWith('.json') || name.endsWith('.png'))
  const entries = unzipSync(readFileSync(path), { filter: (f) => wanted(f.name) })
  return { label: path, read: (p) => entries[p] }
}

function dirFileSystem(root: string): FontFileSystem {
  return {
    label: root,
    read: (p) => {
      try {
        return readFileSync(join(root, p))
      } catch {
        return undefined
      }
    }
  }
}

function resourcePath(id: string, kind: 'font' | 'textures'): string {
  const [ns, path] = id.includes(':') ? id.split(':', 2) : ['minecraft', id]
  return kind === 'font' ? `assets/${ns}/font/${path}.json` : `assets/${ns}/textures/${path}`
}

function collectProviders(fs: FontFileSystem, fontId: string, depth = 0): ProviderDef[] {
  if (depth > 4) return []
  const raw = fs.read(resourcePath(fontId, 'font'))
  if (!raw) return []
  const json = JSON.parse(strFromU8(raw)) as { providers?: ProviderDef[] }
  const out: ProviderDef[] = []
  for (const p of json.providers ?? []) {
    if (p.type === 'reference' && p.id) out.push(...collectProviders(fs, p.id, depth + 1))
    else out.push(p)
  }
  return out
}

function glyphsFromBitmap(fs: FontFileSystem, def: BitmapProviderDef): Glyph[] {
  const raw = fs.read(resourcePath(def.file, 'textures'))
  if (!raw) return []
  const png = PNG.sync.read(Buffer.from(raw))
  const rows = def.chars.length
  const cols = Math.max(...def.chars.map((r) => [...r].length))
  const cellW = Math.floor(png.width / cols)
  const cellH = Math.floor(png.height / rows)
  const height = def.height ?? 8
  // Only 1:1 providers render crisply at GUI scale — the default font is always 1:1.
  if (height !== cellH) return []
  const ascent = def.ascent ?? 7
  const top = 7 - ascent // row of the glyph's first pixel relative to the line top
  if (top + ROW_OFFSET < 0 || top + cellH > 9) return []

  const alphaAt = (x: number, y: number): number => png.data[(y * png.width + x) * 4 + 3]
  const glyphs: Glyph[] = []
  def.chars.forEach((rowChars, row) => {
    ;[...rowChars].forEach((char, col) => {
      const cp = char.codePointAt(0) ?? 0
      if (!isInteresting(cp)) return
      const x0 = col * cellW
      const y0 = row * cellH
      let width = 0
      for (let x = cellW - 1; x >= 0 && width === 0; x--) {
        for (let y = 0; y < cellH; y++) {
          if (alphaAt(x0 + x, y0 + y) > 0) {
            width = x + 1
            break
          }
        }
      }
      if (width === 0) return
      const advance = width + 1
      const columns = new Uint32Array(advance)
      let ink = 0
      for (let x = 0; x < width; x++) {
        let mask = 0
        for (let y = 0; y < cellH; y++) {
          if (alphaAt(x0 + x, y0 + y) > 0) {
            mask |= 1 << (top + y + ROW_OFFSET)
            ink++
          }
        }
        columns[x] = mask
      }
      glyphs.push({ char, advance, columns, ink })
    })
  })
  return glyphs
}

/** Builds the font from an already-opened archive/folder. */
export function buildFont(fs: FontFileSystem): MinecraftFont | null {
  let providers = collectProviders(fs, 'minecraft:default')
  if (providers.length === 0) {
    // Pre-1.13 layout: only ascii.png exists. Fall back to the implicit 16x16 code page.
    providers = [
      {
        type: 'bitmap',
        file: 'minecraft:font/ascii.png',
        chars: Array.from({ length: 16 }, (_, r) =>
          Array.from({ length: 16 }, (_, c) => String.fromCharCode(r * 16 + c)).join('')
        )
      } as ProviderDef
    ]
  }

  let spaceAdvance = 4
  const unique = new Map<string, Glyph>()
  for (const p of providers) {
    if (p.type === 'space' && p.advances?.[' '] !== undefined) spaceAdvance = p.advances[' ']
    if (p.type !== 'bitmap') continue
    for (const g of glyphsFromBitmap(fs, p as unknown as BitmapProviderDef)) {
      // Identical bitmaps (e.g. "-" vs "‐"): keep the lowest code point, ASCII wins.
      const key = Array.from(g.columns).join(',')
      const prev = unique.get(key)
      if (!prev || (g.char.codePointAt(0) ?? 0) < (prev.char.codePointAt(0) ?? 0))
        unique.set(key, g)
    }
  }
  const glyphs = [...unique.values()]
  if (glyphs.length < 60) return null

  const byFirstColumn = new Map<number, Glyph[]>()
  for (const g of glyphs) {
    const key = g.columns[0] & EXACT_ROWS
    const bucket = byFirstColumn.get(key) ?? []
    bucket.push(g)
    byFirstColumn.set(key, bucket)
  }
  // Glyphs that rise above the line (capital accents) last: stray pixels from the line
  // above must not turn "l" into "ĺ". Then wider/richer glyphs first ("m" over "r").
  const rises = (g: Glyph): number => Number(g.columns.some((c) => (c & ABOVE_ROWS) !== 0))
  for (const bucket of byFirstColumn.values())
    bucket.sort((a, b) => rises(a) - rises(b) || b.advance - a.advance || b.ink - a.ink)

  return { source: fs.label, glyphs, spaceAdvance, byFirstColumn }
}

export function loadFontFrom(path: string): MinecraftFont | null {
  const st = statSync(path)
  return buildFont(st.isDirectory() ? dirFileSystem(path) : zipFileSystem(path))
}

/**
 * Candidate font sources inside a .minecraft folder, newest vanilla client first.
 * Snapshots/releases share the same default font, so any recent jar works.
 */
export function findGameJars(minecraftDir: string): string[] {
  const versionsDir = join(minecraftDir, 'versions')
  let names: string[]
  try {
    names = readdirSync(versionsDir)
  } catch {
    return []
  }
  const jars: { path: string; key: number[]; modded: boolean }[] = []
  for (const name of names) {
    const jar = join(versionsDir, name, `${name}.jar`)
    try {
      const st = statSync(jar)
      if (st.size < 1_000_000) continue // loader stubs (fabric/forge) are tiny
      jars.push({ path: jar, key: versionKey(name), modded: /forge|fabric|quilt|neo/i.test(name) })
    } catch {
      /* not a client jar */
    }
  }
  return jars
    .sort((a, b) => Number(a.modded) - Number(b.modded) || compareKeys(b.key, a.key))
    .map((j) => j.path)
}

/** "1.21.8" → [1, 21, 8]; "26.3" → [26, 3]; snapshots "25w14a" → [25, 0, 14]. */
function versionKey(name: string): number[] {
  const snapshot = /^(\d{2})w(\d{2})/.exec(name)
  if (snapshot) return [Number(snapshot[1]) - 1, 99, Number(snapshot[2])]
  const release = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(name)
  // Legacy "1.x" releases sort below the year-based ones (26.x) automatically.
  return release ? [Number(release[1]), Number(release[2]), Number(release[3] ?? 0)] : [0]
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d
  }
  return 0
}
