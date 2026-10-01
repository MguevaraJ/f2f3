import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildGameIndex } from '@shared/gameIndex'
import type { LibraryService } from './LibraryService'

const DELAY_MS = 1500

/**
 * Keeps "<game dir>/craftshot/app-index.json" up to date for the Companion mod's in-game
 * gallery: notes, tags, favourites and everything the app worked out for each screenshot.
 * One file per game folder; only written when the screenshots folder sits inside one.
 */
export class GameIndexExporter {
  private timer: NodeJS.Timeout | null = null
  /** Last content written, by file. */
  private readonly last = new Map<string, string>()

  constructor(private readonly library: LibraryService) {}

  schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.write().catch(() => {
        /* best effort: the mod falls back to its own sidecars */
      })
    }, DELAY_MS)
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
  }

  private async write(): Promise<void> {
    const snap = await this.library.snapshot()
    // One index per game folder, with ids as the mod sees them: relative to its screenshots.
    for (const root of snap.roots) {
      const gameDir = dirname(root.path)
      if (!existsSync(join(gameDir, 'saves')) && !existsSync(join(gameDir, 'options.txt'))) continue
      const own = snap.screenshots
        .filter((s) => (s.source ?? '') === root.mount)
        .map((s) => (root.mount ? { ...s, id: s.id.slice(root.mount.length + 1) } : s))
      const json = JSON.stringify(buildGameIndex(own))
      const file = join(gameDir, 'craftshot', 'app-index.json')
      if (json === this.last.get(file) && existsSync(file)) continue
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file + '.tmp', json, 'utf8')
      await rename(file + '.tmp', file)
      this.last.set(file, json)
    }
  }
}
