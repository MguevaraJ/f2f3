import {
  ABOVE_ROWS,
  EXACT_ROWS,
  ROW_OFFSET,
  type Glyph,
  type MinecraftFont
} from '../font/minecraftFont'

/**
 * Pixel-exact OCR for Minecraft's F3 debug overlay.
 *
 * The overlay is drawn with the vanilla bitmap font at an integer GUI scale, on a
 * fixed 9px line grid starting at (2, 2), left- and right-aligned. Text pixels use
 * exact palette colours (#E0E0E0 plus the chat formatting colours) and sit on a
 * translucent grey panel, which makes those colours unreachable for the world
 * behind it. So we can: detect the scale, downsample to font pixels, and decode
 * each line glyph by glyph with the real font — no guessing involved.
 */

export interface RgbaImage {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray | Buffer
}

export interface OcrLine {
  index: number
  side: 'left' | 'right'
  text: string
  /** Hex colour of the majority of the glyphs. */
  color: string
}

export interface OcrOutput {
  guiScale: number
  lines: OcrLine[]
  exact: number
  fuzzy: number
  failed: number
  confidence: number
}

const TEXT_COLORS = [
  // #555555 is left out on purpose: the translucent panel can produce that grey.
  0xe0e0e0, 0xffffff, 0xaaaaaa, 0x55ff55, 0x00aa00, 0xff5555, 0xaa0000, 0xffff55, 0xffaa00,
  0x55ffff, 0x00aaaa, 0x5555ff, 0x0000aa, 0xff55ff, 0xaa00aa
]
/** Per-channel tolerance: some mod renderers tint the text slightly (e.g. #DDDDDD). */
const COLOR_TOLERANCE = 8
const PALETTE = TEXT_COLORS.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255])
const LINE_HEIGHT = 9
const MARGIN = 2
/** Empty font-pixel columns that terminate a run of text (a single space is 4 + 1). */
const RUN_BREAK = 7
const MAX_EMPTY_LINES = 3

function colorIndexAt(img: RgbaImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4
  const r = img.data[i]
  const g = img.data[i + 1]
  const b = img.data[i + 2]
  for (let k = 0; k < PALETTE.length; k++) {
    const p = PALETTE[k]
    if (
      Math.abs(r - p[0]) <= COLOR_TOLERANCE &&
      Math.abs(g - p[1]) <= COLOR_TOLERANCE &&
      Math.abs(b - p[2]) <= COLOR_TOLERANCE
    )
      return k + 1
  }
  return 0
}

/**
 * Finds the GUI scale by checking that text-coloured pixels form aligned, uniform
 * s×s blocks in the top area of the screen. Returns candidate scales, best first.
 */
export function detectGuiScales(img: RgbaImage): number[] {
  const candidates: number[] = []
  for (let s = 8; s >= 1; s--) {
    // Minecraft never goes below a 320×240 scaled GUI; allow some slack for cropped images.
    if (img.width / s < 300 || img.height / s < 150) continue
    const bw = Math.floor(Math.min(img.width, 420 * s) / s)
    const bh = Math.floor(Math.min(img.height, 140 * s) / s)
    let uniform = 0
    let broken = 0
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const c = colorIndexAt(img, bx * s, by * s)
        if (!c) continue
        let same = true
        for (let dy = 0; dy < s && same; dy++)
          for (let dx = 0; dx < s; dx++)
            if (colorIndexAt(img, bx * s + dx, by * s + dy) !== c) {
              same = false
              break
            }
        if (same) uniform++
        else broken++
      }
    }
    if (uniform >= 40 && broken <= uniform * 0.06) candidates.push(s)
  }
  return candidates
}

/** Downsampled map of text colour indexes, one byte per font pixel. */
class InkGrid {
  readonly w: number
  readonly h: number
  readonly cells: Uint8Array

  constructor(img: RgbaImage, scale: number) {
    this.w = Math.floor(img.width / scale)
    this.h = Math.floor(img.height / scale)
    this.cells = new Uint8Array(this.w * this.h)
    const o = Math.floor(scale / 2) // sample block centres
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        this.cells[y * this.w + x] = colorIndexAt(img, x * scale + o, y * scale + o)
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.cells[y * this.w + x]
  }

  /** Column masks for the line whose top row is `top` (rows top-4 .. top+8). */
  lineMasks(top: number): Uint32Array {
    const masks = new Uint32Array(this.w + 16)
    for (let x = 0; x < this.w; x++) {
      let m = 0
      for (let r = -ROW_OFFSET; r <= 8; r++) if (this.at(x, top + r)) m |= 1 << (r + ROW_OFFSET)
      masks[x] = m
    }
    return masks
  }
}

function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

function fits(g: Glyph, masks: Uint32Array, pos: number): boolean {
  for (let j = 0; j < g.advance; j++) {
    const obs = masks[pos + j] ?? 0
    const col = g.columns[j]
    if (((obs ^ col) & EXACT_ROWS) !== 0) return false
    if ((col & ABOVE_ROWS & ~obs) !== 0) return false
  }
  return true
}

function mismatch(g: Glyph, masks: Uint32Array, pos: number): number {
  let cost = 0
  for (let j = 0; j < g.advance; j++)
    cost += popcount(((masks[pos + j] ?? 0) ^ g.columns[j]) & EXACT_ROWS)
  return cost
}

interface Run {
  start: number
  end: number
  text: string
  exact: number
  fuzzy: number
  failed: number
  colorVotes: Map<number, number>
}

function isBlank(masks: Uint32Array, from: number, count: number): boolean {
  for (let x = from; x < from + count; x++) if ((masks[x] ?? 0) & EXACT_ROWS) return false
  return true
}

function decodeRun(
  font: MinecraftFont,
  masks: Uint32Array,
  grid: InkGrid,
  top: number,
  origin: number
): Run {
  const run: Run = {
    start: origin,
    end: origin,
    text: '',
    exact: 0,
    fuzzy: 0,
    failed: 0,
    colorVotes: new Map()
  }
  let pos = origin
  while (pos < grid.w && !isBlank(masks, pos, RUN_BREAK)) {
    const first = masks[pos] & EXACT_ROWS
    const bucket = font.byFirstColumn.get(first) ?? []
    const hit = bucket.find((g) => fits(g, masks, pos))
    if (hit) {
      vote(run, grid, top, pos, hit)
      run.text += hit.char
      run.exact++
      pos += hit.advance
      run.end = pos
      continue
    }
    if (first === 0) {
      // Word gap: a space is `spaceAdvance` empty columns.
      if (isBlank(masks, pos, font.spaceAdvance)) {
        run.text += ' '
        pos += font.spaceAdvance
      } else {
        pos++ // misaligned by a column — resync on the next ink
      }
      continue
    }
    // No exact glyph: tolerate a couple of stray pixels (crosshair, overlapping HUD).
    let best: Glyph | null = null
    let bestCost = Infinity
    for (const g of font.glyphs) {
      const cost = mismatch(g, masks, pos)
      if (cost < bestCost || (cost === bestCost && best && g.advance > best.advance)) {
        best = g
        bestCost = cost
      }
    }
    if (best && bestCost <= 2) {
      vote(run, grid, top, pos, best)
      run.text += best.char
      run.fuzzy++
      pos += best.advance
    } else {
      run.text += '?'
      run.failed++
      while (pos < grid.w && masks[pos] & EXACT_ROWS) pos++
    }
    run.end = pos
  }
  run.text = run.text.trimEnd()
  return run
}

function vote(run: Run, grid: InkGrid, top: number, pos: number, g: Glyph): void {
  for (let j = 0; j < g.advance; j++)
    for (let r = 0; r < 8; r++) {
      const c = grid.at(pos + j, top + r)
      if (c) {
        run.colorVotes.set(c, (run.colorVotes.get(c) ?? 0) + 1)
        return
      }
    }
}

function score(run: Run): number {
  return run.exact * 2 + run.fuzzy - run.failed * 3
}

function decodeLine(font: MinecraftFont, grid: InkGrid, top: number): Run[] {
  const masks = grid.lineMasks(top)
  const runs: Run[] = []
  let x = 0
  while (x < grid.w) {
    if (!(masks[x] & EXACT_ROWS)) {
      x++
      continue
    }
    // Some glyphs start with blank columns, so the true origin may sit just before the ink.
    let best: Run | null = null
    for (let back = 0; back <= 2 && x - back >= 0; back++) {
      const r = decodeRun(font, masks, grid, top, x - back)
      if (!best || score(r) > score(best)) best = r
    }
    if (!best || best.end <= x) {
      x++
      continue
    }
    runs.push(best)
    x = best.end + 1
  }
  return mergeRuns(runs, grid.w)
}

const MERGE_GAP = 12
const EDGE = MARGIN + 2

/** Joins runs split by double spaces, but never a left-anchored run with a right-anchored one. */
function mergeRuns(runs: Run[], width: number): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    const prev = out[out.length - 1]
    const bridgesColumns = prev && prev.start <= EDGE && r.end >= width - EDGE
    if (prev && !bridgesColumns && r.start - prev.end <= MERGE_GAP) {
      prev.text += ' '.repeat(Math.max(1, Math.round((r.start - prev.end) / 4))) + r.text
      prev.end = r.end
      prev.exact += r.exact
      prev.fuzzy += r.fuzzy
      prev.failed += r.failed
      for (const [k, v] of r.colorVotes) prev.colorVotes.set(k, (prev.colorVotes.get(k) ?? 0) + v)
    } else out.push({ ...r, colorVotes: new Map(r.colorVotes) })
  }
  return out
}

/**
 * Single bright world pixels next to the panel decode as tiny punctuation.
 * F3 lines never start or end with these, so trim them.
 */
const SPECKLES = "\\s.·'`´¨,¸˛?"
const EDGE_SPECKLES = new RegExp(`^[${SPECKLES}]+|[${SPECKLES}]+$`, 'g')

function stripSpeckles(text: string): string {
  return text.replace(EDGE_SPECKLES, '')
}

function isPlausible(r: Run): boolean {
  const total = r.exact + r.fuzzy + r.failed
  return r.exact >= 2 && r.failed / total < 0.25 && /[A-Za-z0-9]/.test(r.text)
}

function dominantColor(run: Run): string {
  let best = 1
  let votes = -1
  for (const [k, v] of run.colorVotes)
    if (v > votes) {
      best = k
      votes = v
    }
  return '#' + TEXT_COLORS[best - 1].toString(16).padStart(6, '0')
}

function readAtScale(font: MinecraftFont, img: RgbaImage, scale: number): OcrOutput {
  const grid = new InkGrid(img, scale)
  const lines: OcrLine[] = []
  let exact = 0
  let fuzzy = 0
  let failed = 0
  const empty = { left: 0, right: 0 }
  const seen = { left: false, right: false }

  for (let i = 0; MARGIN + i * LINE_HEIGHT + 8 <= grid.h; i++) {
    const top = MARGIN + i * LINE_HEIGHT
    const found = { left: false, right: false }
    for (const run of decodeLine(font, grid, top)) {
      if (!isPlausible(run)) continue
      const side = run.start <= EDGE ? 'left' : run.end >= grid.w - EDGE ? 'right' : null
      if (!side || (seen[side] && empty[side] >= MAX_EMPTY_LINES)) continue
      const text = stripSpeckles(run.text)
      if (!text) continue
      lines.push({ index: i, side, text, color: dominantColor(run) })
      exact += run.exact
      fuzzy += run.fuzzy
      failed += run.failed
      found[side] = true
    }
    for (const side of ['left', 'right'] as const) {
      if (found[side]) {
        seen[side] = true
        empty[side] = 0
      } else empty[side]++
    }
    const leftDone = !seen.left ? i >= 4 : empty.left >= MAX_EMPTY_LINES
    const rightDone = !seen.right ? i >= 4 : empty.right >= MAX_EMPTY_LINES
    if (leftDone && rightDone) break
  }

  const total = exact + fuzzy + failed
  return { guiScale: scale, lines, exact, fuzzy, failed, confidence: total ? exact / total : 0 }
}

/** Reads the debug overlay. Returns null when no overlay-like text is present. */
export function readDebugOverlay(font: MinecraftFont, img: RgbaImage): OcrOutput | null {
  let best: OcrOutput | null = null
  for (const scale of detectGuiScales(img)) {
    const out = readAtScale(font, img, scale)
    if (!best || out.exact > best.exact) best = out
    if (out.lines.length >= 4 && out.confidence > 0.9) break
  }
  if (!best || best.lines.length < 2) return null
  return best
}
