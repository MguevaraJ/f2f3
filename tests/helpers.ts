import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { findGameJars, loadFontFrom, type MinecraftFont } from '../src/core/font/minecraftFont'

export const fixture = (name: string): PNG =>
  PNG.sync.read(readFileSync(join(__dirname, 'fixtures', name)))

/** The OCR needs Minecraft's font from a local game jar; tests using it are skipped without one. */
export const jar = process.env.MINECRAFT_JAR ?? findGameJars(join(homedir(), '.minecraft'))[0]
let font: MinecraftFont | null | undefined
export function gameFont(): MinecraftFont {
  font ??= jar ? loadFontFrom(jar) : null
  if (!font) throw new Error('No Minecraft jar available')
  return font
}
