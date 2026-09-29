import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AnalysisService } from './AnalysisService'
import { LibraryService } from './LibraryService'
import { MetadataStore } from './MetadataStore'
import { MinecraftLocator } from './MinecraftLocator'
import { SettingsService } from './SettingsService'
import { ThumbnailService } from './ThumbnailService'
import { VisionService } from './VisionService'
import { WorkerPool } from './WorkerPool'

export interface Services {
  locator: MinecraftLocator
  settings: SettingsService
  metadata: MetadataStore
  library: LibraryService
  pool: WorkerPool
  thumbs: ThumbnailService
  vision: VisionService
  analysis: AnalysisService
  fontSource(): string | null
  dispose(): Promise<void>
}

/** Composition root: wires services together (manual DI keeps them unit-testable). */
export function createServices(userDataDir: string, workerEntry: URL): Services {
  const locator = new MinecraftLocator()
  const settings = new SettingsService(userDataDir, locator)
  const metadata = new MetadataStore(userDataDir)
  const library = new LibraryService(settings.value.screenshotsDir, metadata)
  const pool = new WorkerPool(workerEntry)
  const thumbs = new ThumbnailService(
    join(userDataDir, 'thumbs'),
    pool,
    () => settings.value.thumbnailSize
  )
  const vision = new VisionService(() => settings.getApiKey())

  let cachedFont: { key: string; value: string | null } | null = null
  const fontSource = (): string | null => {
    const { fontSource: custom, screenshotsDir } = settings.value
    const key = `${custom}|${screenshotsDir}`
    if (cachedFont?.key !== key)
      cachedFont = {
        key,
        value: custom && existsSync(custom) ? custom : locator.findFontSource(screenshotsDir)
      }
    return cachedFont.value
  }

  const analysis = new AnalysisService(
    library,
    metadata,
    settings,
    pool,
    thumbs,
    vision,
    fontSource
  )

  library.on('changed', (snap) => analysis.scheduleMissing(snap.screenshots))
  settings.on('changed', (next, prev) => {
    if (next.screenshotsDir !== prev.screenshotsDir) library.setRoot(next.screenshotsDir)
    if (next.fontSource !== prev.fontSource)
      void library.snapshot().then((s) => analysis.enqueueLocal(s.screenshots.map((x) => x.id)))
    if (next.autoAnalyze && !prev.autoAnalyze)
      void library.snapshot().then((s) => analysis.scheduleMissing(s.screenshots))
  })

  return {
    locator,
    settings,
    metadata,
    library,
    pool,
    thumbs,
    vision,
    analysis,
    fontSource,
    async dispose() {
      library.dispose()
      metadata.flush()
      settings.flush()
      await pool.dispose()
    }
  }
}
