import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildGameIndex } from '@shared/gameIndex'
import type { LibraryService } from './LibraryService'

const DELAY_MS = 1500

/**
 * Keeps "<game dir>/craftshot/app-index.json" up to date for the Companion mod's in-game
 * gallery: notes, tags, favourites and everything the app worked out for each screenshot.
 * Only written when the screenshots folder sits inside a game folder.
 */
export class GameIndexExporter {
  private timer: NodeJS.Timeout | null = null
  private last = ''

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
    const gameDir = dirname(snap.root)
    if (!existsSync(join(gameDir, 'saves')) && !existsSync(join(gameDir, 'options.txt'))) return
    const json = JSON.stringify(buildGameIndex(snap.screenshots))
    const file = join(gameDir, 'craftshot', 'app-index.json')
    if (json === this.last && existsSync(file)) return
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file + '.tmp', json, 'utf8')
    await rename(file + '.tmp', file)
    this.last = json
  }
}
