import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BackupAccount, BackupStatus, BackupSummary, ScreenshotEntry } from '@shared/types'
import {
  baseName,
  folderOf,
  planBackup,
  sourceName,
  type BackupAction,
  type LocalFile
} from '@core/backup/plan'
import type { DriveApi, DriveItem } from '../google/drive'
import { AuthError, type GoogleAuth } from '../google/oauth'
import { fingerprintOf, type LibraryService } from './LibraryService'
import type { MetadataStore } from './MetadataStore'
import { JsonStore } from './JsonStore'
import type { SettingsService } from './SettingsService'

interface BackupState {
  account: BackupAccount | null
  lastRun: BackupSummary | null
  folderId: string | null
  /** md5 per absolute path, valid while the file fingerprint matches. */
  md5: Record<string, { fp: string; md5: string }>
}

const META_FILE = 'craftshot-datos.json'
const PARALLEL = 3
const AUTO_DELAY_MS = 20_000

const mimeOf = (path: string): string => (/\.jpe?g$/i.test(path) ? 'image/jpeg' : 'image/png')

/**
 * One-way backup of the screenshots folder to Google Drive, plus restoring
 * files that are only in Drive. Drive is the source of truth for "what is
 * already backed up" (queried every run), so a lost local index is harmless.
 */
export class BackupService extends EventEmitter<{ status: [BackupStatus] }> {
  private readonly state: JsonStore<BackupState>
  private status: BackupStatus
  private running: Promise<BackupSummary | null> | null = null
  private cancelled = false
  private autoTimer: NodeJS.Timeout | null = null

  constructor(
    userDataDir: string,
    private readonly auth: GoogleAuth,
    private readonly drive: DriveApi,
    private readonly library: LibraryService,
    private readonly metadata: MetadataStore,
    private readonly settings: SettingsService,
    private readonly configured: () => boolean
  ) {
    super()
    this.state = new JsonStore<BackupState>(
      join(userDataDir, 'backup.json'),
      { account: null, lastRun: null, folderId: null, md5: {} },
      800
    )
    if (!this.auth.connected && this.state.value.account)
      this.state.update((s) => (s.account = null))
    this.status = {
      configured: configured(),
      account: this.state.value.account,
      state: 'idle',
      done: 0,
      total: 0,
      bytesDone: 0,
      bytesTotal: 0,
      lastRun: this.state.value.lastRun,
      folderUrl: this.state.value.folderId
        ? this.drive.folderUrl(this.state.value.folderId, this.state.value.account?.email)
        : undefined
    }
  }

  get current(): BackupStatus {
    return { ...this.status, configured: this.configured() }
  }

  // ─────────────────────────── account ───────────────────────────

  async connect(): Promise<BackupStatus> {
    this.set({ state: 'connecting', error: undefined })
    try {
      await this.auth.login()
      // Nothing from a previously linked account may leak into this one.
      this.drive.reset()
      const account = await this.drive.account()
      this.state.update((s) => {
        s.account = account
        s.folderId = null
        s.lastRun = null
      })
      this.set({ state: 'idle', account, lastRun: null, folderUrl: undefined })
      this.scheduleAuto(1000)
    } catch (err) {
      this.set({ state: 'error', error: message(err) })
    }
    return this.current
  }

  cancelConnect(): void {
    this.auth.cancelLogin()
    if (this.status.state === 'connecting') this.set({ state: 'idle' })
  }

  async disconnect(): Promise<BackupStatus> {
    this.cancel()
    await this.running?.catch(() => undefined)
    await this.auth.logout()
    this.drive.reset()
    this.state.update((s) => {
      s.account = null
      s.folderId = null
      s.lastRun = null
    })
    this.set({
      account: null,
      state: 'idle',
      error: undefined,
      lastRun: null,
      folderUrl: undefined
    })
    return this.current
  }

  // ─────────────────────────── backup ───────────────────────────

  /** Debounced automatic run after the library changes (new screenshots). */
  scheduleAuto(delay = AUTO_DELAY_MS): void {
    if (!this.settings.value.backupAuto || !this.status.account || !this.auth.connected) return
    if (this.autoTimer) clearTimeout(this.autoTimer)
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null
      if (this.running) this.scheduleAuto()
      else void this.run()
    }, delay)
  }

  cancel(): void {
    this.cancelled = true
  }

  run(): Promise<BackupSummary | null> {
    this.running ??= this.execute().finally(() => (this.running = null))
    return this.running
  }

  private async execute(): Promise<BackupSummary | null> {
    if (!this.status.account) throw new AuthError('Conecta una cuenta de Google primero', true)
    this.cancelled = false
    const summary: BackupSummary = {
      uploaded: 0,
      updated: 0,
      moved: 0,
      skipped: 0,
      failed: 0,
      remoteOnly: 0,
      bytes: 0,
      finishedAt: 0,
      errors: []
    }
    try {
      const snap = await this.library.snapshot()
      const entries = snap.screenshots
      this.set({
        state: 'running',
        phase: 'scanning',
        done: 0,
        total: entries.length,
        bytesDone: 0,
        bytesTotal: 0,
        error: undefined
      })
      const local: (LocalFile & { entry: ScreenshotEntry; abs: string })[] = []
      for (const [i, e] of entries.entries()) {
        if (this.cancelled) return this.finish(summary, 'Cancelado')
        const abs = this.library.resolveId(e.id)
        local.push({ path: e.id, size: e.size, md5: await this.md5(abs, e), entry: e, abs })
        if (i % 10 === 0) this.set({ done: i + 1, current: e.name })
      }

      this.set({ phase: 'listing', current: undefined })
      const source = sourceName(snap.root)
      const appFolder = await this.drive.ensureAppFolder()
      const remote = await this.drive.listSource(source)
      const folderIds = new Map(
        remote.filter((r) => r.kind === 'folder').map((r) => [r.path, r.id])
      )
      if (!folderIds.has(''))
        folderIds.set('', await this.drive.createFolder(source, '', source, appFolder))
      const rootId = folderIds.get('')!
      this.state.update((s) => (s.folderId = rootId))
      this.set({ folderUrl: this.drive.folderUrl(rootId, this.status.account?.email) })

      const remoteFiles = remote.filter((r) => r.kind === 'file')
      const plan = planBackup(local, remoteFiles)
      summary.remoteOnly = plan.remoteOnly.length
      for (const folder of plan.folders) {
        if (folderIds.has(folder)) continue
        const parent = folderIds.get(folderOf(folder))!
        folderIds.set(
          folder,
          await this.drive.createFolder(source, folder, baseName(folder), parent)
        )
      }

      const work = plan.actions.filter((a) => a.kind !== 'skip')
      summary.skipped = plan.actions.length - work.length
      const byPath = new Map(local.map((l) => [l.path, l]))
      const bytesOf = (a: BackupAction): number => (a.kind === 'move' ? 0 : a.local.size)
      this.set({
        phase: 'uploading',
        done: 0,
        total: work.length,
        bytesDone: 0,
        bytesTotal: work.reduce((n, a) => n + bytesOf(a), 0)
      })

      await forEachParallel(work, PARALLEL, async (action) => {
        if (this.cancelled) return
        const l = byPath.get(action.local.path)!
        this.set({ current: l.entry.name })
        try {
          const parent = folderIds.get(folderOf(l.path))!
          if (action.kind === 'move') {
            await this.drive.move(
              action.remote.id,
              source,
              l.path,
              l.entry.name,
              remoteParent(remote, action.remote.id),
              parent
            )
            summary.moved++
          } else {
            const data = await readFile(l.abs)
            const md5 =
              action.kind === 'update'
                ? (await this.drive.updateContent(action.remote.id, data, mimeOf(l.path))).md5
                : (
                    await this.drive.upload(source, l.path, parent, {
                      name: l.entry.name,
                      data,
                      mimeType: mimeOf(l.path),
                      mtime: new Date(l.entry.mtimeMs)
                    })
                  ).md5
            if (md5 && md5 !== l.md5) throw new Error('la verificación MD5 no coincide')
            if (action.kind === 'update') summary.updated++
            else summary.uploaded++
            summary.bytes += data.byteLength
          }
        } catch (err) {
          if (err instanceof AuthError) throw err
          summary.failed++
          if (summary.errors.length < 10) summary.errors.push(`${l.path}: ${message(err)}`)
        }
        this.set({ done: this.status.done + 1, bytesDone: this.status.bytesDone + bytesOf(action) })
      })
      if (this.cancelled) return this.finish(summary, 'Cancelado')

      await this.uploadMetadata(source, rootId, remote, local)
      return this.finish(summary)
    } catch (err) {
      if (err instanceof AuthError && err.needsReconnect) {
        this.state.update((s) => (s.account = null))
        this.set({ account: null })
      }
      summary.errors.unshift(message(err))
      return this.finish(summary, message(err))
    }
  }

  /** Downloads every backed-up screenshot that is missing locally. */
  async restoreMissing(): Promise<{ restored: number; failed: number }> {
    if (this.running) throw new Error('Espera a que termine el respaldo en curso')
    const result = { restored: 0, failed: 0 }
    const job = (async (): Promise<null> => {
      this.set({
        state: 'running',
        phase: 'listing',
        done: 0,
        total: 0,
        bytesDone: 0,
        bytesTotal: 0,
        error: undefined
      })
      try {
        const snap = await this.library.snapshot()
        const have = new Set(snap.screenshots.map((s) => s.id))
        const remote = (await this.drive.listSource(sourceName(snap.root))).filter(
          (r) => r.kind === 'file' && !have.has(r.path) && safeRelative(r.path)
        )
        this.set({
          phase: 'restoring',
          total: remote.length,
          bytesTotal: remote.reduce((n, r) => n + r.size, 0)
        })
        await forEachParallel(remote, PARALLEL, async (r) => {
          if (this.cancelled) return
          this.set({ current: r.name })
          try {
            const target = this.library.resolveId(r.path)
            if (!existsSync(target)) {
              const data = await this.drive.download(r.id)
              await mkdir(dirname(target), { recursive: true })
              await writeFile(target, data, { flag: 'wx' }) // never overwrite a local file
              result.restored++
            }
          } catch {
            result.failed++
          }
          this.set({ done: this.status.done + 1, bytesDone: this.status.bytesDone + r.size })
        })
        this.set({ state: 'idle', phase: undefined, current: undefined })
      } catch (err) {
        this.set({ state: 'error', phase: undefined, current: undefined, error: message(err) })
        throw err
      } finally {
        await this.library.refresh()
      }
      return null
    })()
    this.running = job.finally(() => (this.running = null))
    await this.running
    return result
  }

  flush(): void {
    this.state.flush()
  }

  // ─────────────────────────── internals ───────────────────────────

  /** Notes, tags, favourites and analyses travel with the images. */
  private async uploadMetadata(
    source: string,
    rootId: string,
    remote: DriveItem[],
    local: { path: string; entry: ScreenshotEntry; abs: string }[]
  ): Promise<void> {
    const doc = {
      app: 'Craftshot',
      version: 1,
      source,
      screenshots: local.map((l) => ({
        path: l.path,
        capturedAt: new Date(l.entry.capturedAt).toISOString(),
        meta: this.metadata.meta(l.abs),
        analysis: l.entry.analysis && {
          ...l.entry.analysis,
          f3: l.entry.analysis.f3 && { ...l.entry.analysis.f3, lines: undefined }
        }
      }))
    }
    const data = Buffer.from(JSON.stringify(doc, null, 1))
    const md5 = createHash('md5').update(data).digest('hex')
    const existing = remote.find((r) => r.kind === 'meta')
    if (existing?.md5 === md5) return
    if (existing) await this.drive.updateContent(existing.id, data, 'application/json')
    else
      await this.drive.upload(
        source,
        META_FILE,
        rootId,
        { name: META_FILE, data, mimeType: 'application/json' },
        'meta'
      )
  }

  private async md5(abs: string, e: ScreenshotEntry): Promise<string> {
    const fp = fingerprintOf(e.size, e.mtimeMs)
    const cached = this.state.value.md5[abs]
    if (cached?.fp === fp) return cached.md5
    const hash = createHash('md5')
    for await (const chunk of createReadStream(abs)) hash.update(chunk as Buffer)
    const md5 = hash.digest('hex')
    this.state.update((s) => (s.md5[abs] = { fp, md5 }))
    return md5
  }

  private finish(summary: BackupSummary, error?: string): BackupSummary {
    summary.finishedAt = Date.now()
    this.state.update((s) => (s.lastRun = summary))
    this.set({
      state: error && error !== 'Cancelado' ? 'error' : 'idle',
      phase: undefined,
      current: undefined,
      lastRun: summary,
      error: error === 'Cancelado' ? undefined : error
    })
    this.state.flush()
    return summary
  }

  private set(patch: Partial<BackupStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.current)
  }
}

function remoteParent(remote: DriveItem[], id: string): string | undefined {
  return remote.find((r) => r.id === id)?.parentId
}

/** Paths coming from Drive must stay inside the screenshots folder. */
function safeRelative(path: string): boolean {
  return !!path && !path.startsWith('/') && !path.split('/').some((p) => p === '..' || p === '')
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function forEachParallel<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  })
  await Promise.all(workers)
}
