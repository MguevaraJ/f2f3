import { existsSync } from 'node:fs'
import { net, shell } from 'electron'
import { DriveClient } from '../google/drive'
import { GoogleAuth, type OAuthClient } from '../google/oauth'
import { BackupService } from './BackupService'
import { SecretStore } from './SecretStore'
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
  backup: BackupService
  fontSource(): string | null
  dispose(): Promise<void>
}

/** Composition root: wires services together (manual DI keeps them unit-testable). */
export function createServices(userDataDir: string, workerEntry: URL): Services {
  const locator = new MinecraftLocator()
  const secrets = new SecretStore(userDataDir)
  const settings = new SettingsService(userDataDir, locator, secrets)
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

  // Google Drive backup. The OAuth client comes from Ajustes, or is baked in at build time.
  const googleClient = (): OAuthClient | null => {
    const { googleClientId, googleClientSecret } = settings.value
    if (googleClientId) return { clientId: googleClientId, clientSecret: googleClientSecret }
    const id = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? process.env.CRAFTSHOT_GOOGLE_CLIENT_ID
    const secret =
      import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? process.env.CRAFTSHOT_GOOGLE_CLIENT_SECRET
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

  library.on('changed', (snap) => {
    analysis.scheduleMissing(snap.screenshots)
    backup.scheduleAuto()
  })
  settings.on('changed', (next, prev) => {
    if (next.screenshotsDir !== prev.screenshotsDir) library.setRoot(next.screenshotsDir)
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
    fontSource,
    async dispose() {
      library.dispose()
      metadata.flush()
      settings.flush()
      backup.cancel()
      backup.flush()
      await pool.dispose()
    }
  }
}
