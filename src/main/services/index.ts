import { existsSync } from 'node:fs'
import { net, shell } from 'electron'
import { DriveClient } from '../google/drive'
import { GoogleAuth, type OAuthClient } from '../google/oauth'
import { BackupService } from './BackupService'
import { CaptureWatcher } from './CaptureWatcher'
import { GameIndexExporter } from './GameIndexExporter'
import { LocalVisionService } from './LocalVisionService'
import { SecretStore } from './SecretStore'
import { basename, dirname, join } from 'node:path'
import { AnalysisService } from './AnalysisService'
import { LibraryService, type LibraryRoot } from './LibraryService'
import { MetadataStore } from './MetadataStore'
import { MinecraftLocator } from './MinecraftLocator'
import { SettingsService } from './SettingsService'
import { ThumbnailService } from './ThumbnailService'
import { VisionService } from '../vision/VisionService'
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
  backup: BackupService
  captures: CaptureWatcher
  gameIndex: GameIndexExporter
  localVision: LocalVisionService
  fontSource(): string | null
  dispose(): Promise<void>
}

/** Composition root: wires services together (manual DI keeps them unit-testable). */
export function createServices(
  userDataDir: string,
  workerEntry: URL,
  localWorkerEntry: URL
): Services {
  const locator = new MinecraftLocator()
  const secrets = new SecretStore(userDataDir)
  const settings = new SettingsService(userDataDir, locator, secrets)
  const metadata = new MetadataStore(userDataDir)
  // Named like in the game folder list: launcher and instance, or the folder's own name.
  const rootsOf = (dirs: string[]): LibraryRoot[] => {
    const found = locator.detectSources()
    return dirs.map((path) => ({
      path,
      label:
        found.find((s) => s.path === path)?.label ??
        basename(basename(path).toLowerCase() === 'screenshots' ? dirname(path) : path)
    }))
  }
  const library = new LibraryService(rootsOf(settings.value.screenshotsDirs), metadata)
  const pool = new WorkerPool(workerEntry)
  const thumbs = new ThumbnailService(
    join(userDataDir, 'thumbs'),
    pool,
    () => settings.value.thumbnailSize
  )
  const vision = new VisionService({
    provider: () => settings.value.visionProvider,
    config: (p) => ({
      apiKey: settings.getProviderKey(p),
      model: settings.value.visionModels[p] ?? '',
      baseUrl:
        p === 'openai'
          ? settings.value.openaiBaseUrl
          : p === 'ollama'
            ? settings.value.ollamaUrl
            : undefined
    })
  })

  let cachedFont: { key: string; value: string | null } | null = null
  const fontSource = (): string | null => {
    const { fontSource: custom, screenshotsDirs } = settings.value
    const key = `${custom}|${screenshotsDirs.join('|')}`
    if (cachedFont?.key !== key)
      cachedFont = {
        key,
        value:
          custom && existsSync(custom)
            ? custom
            : (screenshotsDirs.map((d) => locator.findFontSource(d)).find(Boolean) ?? null)
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

  // The app's own Google OAuth client, registered once by the publisher and baked in at
  // build time (.env). End users only ever see "Continuar con Google".
  const googleClient = (): OAuthClient | null => {
    const id = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID || process.env.F2F3_GOOGLE_CLIENT_ID
    const secret =
      import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET || process.env.F2F3_GOOGLE_CLIENT_SECRET
    return id ? { clientId: id, clientSecret: secret ?? '' } : null
  }
  const http = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    net.fetch(input instanceof URL ? input.toString() : input, init)
  const auth = new GoogleAuth(googleClient, secrets, http, (url) => shell.openExternal(url))
  const backup = new BackupService(
    userDataDir,
    auth,
    new DriveClient(auth, http),
    library,
    metadata,
    settings,
    () => !!googleClient()
  )

  const captures = new CaptureWatcher(library, analysis)
  const localVision = new LocalVisionService(
    join(userDataDir, 'models'),
    localWorkerEntry,
    settings,
    library,
    analysis
  )

  const gameIndex = new GameIndexExporter(library)
  analysis.on('updated', () => gameIndex.schedule())
  library.on('changed', (snap) => {
    gameIndex.schedule()
    captures.onSnapshot(snap)
    analysis.scheduleMissing(snap.screenshots)
    backup.scheduleAuto()
  })
  settings.on('changed', (next, prev) => {
    if (next.screenshotsDirs.join('|') !== prev.screenshotsDirs.join('|'))
      library.setRoots(rootsOf(next.screenshotsDirs))
    if (next.fontSource !== prev.fontSource)
      void library.snapshot().then((s) => analysis.enqueueLocal(s.screenshots.map((x) => x.id)))
    if (next.backupAuto && !prev.backupAuto) backup.scheduleAuto(1000)
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
    backup,
    captures,
    gameIndex,
    localVision,
    fontSource,
    async dispose() {
      library.dispose()
      gameIndex.dispose()
      metadata.flush()
      settings.flush()
      backup.cancel()
      await localVision.stop()
      backup.flush()
      await pool.dispose()
    }
  }
}
