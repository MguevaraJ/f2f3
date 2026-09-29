import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { LOCAL_MODEL } from '@core/localvision/model'
import type { LocalModelStatus, LocalVisionResult, ScreenshotAnalysis } from '@shared/types'
import type { LocalWorkerReply } from '../workers/localvision.protocol'
import type { AnalysisService } from './AnalysisService'
import type { LibraryService } from './LibraryService'
import type { SettingsService } from './SettingsService'

/**
 * Version of the local classifier (model + labels + thresholds). Bump it after
 * recalibrating so existing screenshots get the improved estimate.
 */
export const LOCAL_VISION_VERSION = `${LOCAL_MODEL.id.split('/').pop()}@${LOCAL_MODEL.dtype}#1`

/**
 * Level 2: on-device recognition (basic biome + mob at the crosshair).
 * Downloaded once with the user's consent, then fully offline and private.
 */
export class LocalVisionService extends EventEmitter<{ status: [LocalModelStatus] }> {
  private worker: Worker | null = null
  private statusValue: LocalModelStatus = {
    state: 'absent',
    progress: 0,
    sizeMB: LOCAL_MODEL.approxMB,
    pending: 0
  }
  private readonly queue: string[] = []
  private readonly inflight = new Map<number, { id: string; resolve: () => void }>()
  private busy = false
  private seq = 0

  constructor(
    private readonly cacheDir: string,
    private readonly workerEntry: URL,
    private readonly settings: SettingsService,
    private readonly library: LibraryService,
    private readonly analysis: AnalysisService
  ) {
    super()
    // Every fresh offline analysis lacking a (current) local result gets queued.
    analysis.on('updated', (id, a) => {
      if (this.statusValue.state === 'ready' && this.needs(id, a)) this.enqueue([id])
    })
  }

  get status(): LocalModelStatus {
    return { ...this.statusValue, pending: this.queue.length + (this.busy ? 1 : 0) }
  }

  /** Files of the model already on disk. */
  isDownloaded(): boolean {
    return existsSync(
      join(this.cacheDir, LOCAL_MODEL.id, 'onnx', `vision_model_${LOCAL_MODEL.dtype}.onnx`)
    )
  }

  /** On startup: load the model if the user enabled it and it is on disk. */
  start(): void {
    if (this.settings.value.localModelEnabled && this.isDownloaded()) this.load(false)
  }

  /** User consented: download (if needed) and enable. */
  enable(): LocalModelStatus {
    this.settings.update({ localModelEnabled: true })
    if (this.statusValue.state !== 'ready' && this.statusValue.state !== 'downloading')
      this.load(!this.isDownloaded())
    return this.status
  }

  /** Disable and delete the model files. */
  async remove(): Promise<LocalModelStatus> {
    this.settings.update({ localModelEnabled: false })
    await this.stop()
    await rm(join(this.cacheDir, LOCAL_MODEL.id), { recursive: true, force: true })
    this.set({ state: 'absent', progress: 0, error: undefined })
    return this.status
  }

  /** Re-run the local model on some screenshots. */
  enqueue(ids: string[]): void {
    for (const id of ids) if (/\.png$/i.test(id) && !this.queue.includes(id)) this.queue.push(id)
    this.emitStatus()
    void this.pump()
  }

  async stop(): Promise<void> {
    this.queue.length = 0
    for (const job of this.inflight.values()) job.resolve()
    this.inflight.clear()
    // Detach synchronously: a new worker may be assigned before terminate() settles.
    const worker = this.worker
    this.worker = null
    await worker?.terminate()
  }

  private needs(id: string, a: ScreenshotAnalysis | null): boolean {
    return /\.png$/i.test(id) && !!a && !a.error && a.local?.model !== LOCAL_VISION_VERSION
  }

  private load(allowDownload: boolean): void {
    void this.stop()
    this.set({ state: allowDownload ? 'downloading' : 'loading', progress: 0, error: undefined })
    const worker = new Worker(this.workerEntry)
    this.worker = worker
    worker.on('message', (msg: LocalWorkerReply) => {
      switch (msg.type) {
        case 'progress':
          if (msg.total > 0)
            this.set({ state: 'downloading', progress: Math.min(1, msg.loaded / msg.total) })
          break
        case 'ready':
          this.set({ state: 'ready', progress: 1 })
          void this.queueMissing()
          break
        case 'load-error':
          this.set({ state: 'error', error: friendly(msg.message) })
          void this.stop()
          break
        case 'result': {
          const job = this.inflight.get(msg.jobId)
          this.inflight.delete(msg.jobId)
          if (job && msg.result) {
            const result: LocalVisionResult = {
              model: LOCAL_VISION_VERSION,
              analyzedAt: Date.now(),
              biome: msg.result.biome,
              targetedMob: msg.result.targetedMob
            }
            try {
              this.analysis.applyLocal(job.id, result)
            } catch {
              /* file moved/deleted meanwhile */
            }
          }
          job?.resolve()
          break
        }
      }
    })
    worker.on('error', (err: Error) => this.set({ state: 'error', error: friendly(err.message) }))
    worker.postMessage({ type: 'load', cacheDir: this.cacheDir, allowDownload })
  }

  private async queueMissing(): Promise<void> {
    const snap = await this.library.snapshot()
    this.enqueue(snap.screenshots.filter((s) => this.needs(s.id, s.analysis)).map((s) => s.id))
  }

  private async pump(): Promise<void> {
    if (this.busy || this.statusValue.state !== 'ready' || !this.worker) return
    this.busy = true
    try {
      while (this.queue.length && this.worker) {
        const id = this.queue.shift()!
        this.emitStatus()
        const entry = this.library.entry(id)
        if (!entry?.analysis || !this.needs(id, entry.analysis)) continue
        let file: string
        try {
          file = this.library.resolveId(id)
        } catch {
          continue
        }
        const jobId = ++this.seq
        await new Promise<void>((resolve) => {
          this.inflight.set(jobId, { id, resolve })
          this.worker!.postMessage({
            type: 'analyze',
            jobId,
            file,
            dimension: entry.analysis!.dimension?.id
          })
        })
      }
    } finally {
      this.busy = false
      this.emitStatus()
    }
  }

  private set(patch: Partial<LocalModelStatus>): void {
    this.statusValue = { ...this.statusValue, ...patch }
    this.emitStatus()
  }

  private emitStatus(): void {
    this.emit('status', this.status)
  }
}

function friendly(message: string): string {
  if (/fetch|network|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(message))
    return 'No se pudo descargar el modelo. Revisa tu conexión a internet e inténtalo de nuevo.'
  if (/ENOSPC/i.test(message)) return 'No hay espacio suficiente en el disco para el modelo.'
  return `No se pudo cargar el modelo local: ${message}`
}
