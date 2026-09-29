/**
 * Debug helper: runs the F3 OCR (and parser) on screenshots from the command line.
 *   npm run ocr -- ~/.minecraft/screenshots/2026-09-20_05.19.44.png [--json]
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { findGameJars, loadFontFrom } from '../src/core/font/minecraftFont'
import { readDebugOverlay } from '../src/core/ocr/debugOverlayOcr'
import { analyzeImage } from '../src/core/analyze'

const args = process.argv.slice(2)
const json = args.includes('--json')
const files = args.filter((a) => !a.startsWith('--'))
const jar = findGameJars(join(homedir(), '.minecraft'))[0]
if (!jar) throw new Error('No Minecraft client jar found')
let t = performance.now()
const font = loadFontFrom(jar)
if (!font) throw new Error('Could not read font from ' + jar)
console.log(`font: ${jar} (${font.glyphs.length} glyphs, ${(performance.now() - t).toFixed(0)} ms)`)

for (const file of files) {
  const png = PNG.sync.read(readFileSync(file))
  t = performance.now()
  const out = readDebugOverlay(font, png)
  const ms = (performance.now() - t).toFixed(0)
  console.log(`\n=== ${file.split('/').pop()} ${ms} ms`)
  if (!out) {
    console.log('  (no F3)')
    continue
  }
  console.log(`  scale=${out.guiScale} conf=${out.confidence.toFixed(3)} exact=${out.exact} fuzzy=${out.fuzzy} failed=${out.failed}`)
  if (json) {
    const { f3, biome, dimension, mobs } = analyzeImage(png, font, 'cli')
    console.log(JSON.stringify({ f3: { ...f3, lines: undefined, fields: undefined }, biome, dimension, mobs }, null, 2))
  }
  else for (const l of out.lines) console.log(`  ${String(l.index).padStart(2)} ${l.side === 'left' ? 'L' : 'R'} ${l.color} ${l.text}`)
}
