import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { ANALYSIS_SCHEMA, carryOver, withLocal, withManualBiome, withVision } from '@core/analyze'
import type {
  AnalysisProgress,
  LocalVisionResult,
  ScreenshotAnalysis,
  ScreenshotEntry
} from '@shared/types'
import { fingerprintOf, type LibraryService } from './LibraryService'
import type { MetadataStore } from './MetadataStore'
import type { SettingsService } from './SettingsService'
import type { ThumbnailService } from './ThumbnailService'
import type { VisionService } from '../vision/VisionService'
import type { WorkerPool } from './WorkerPool'
import { tr } from '@shared/i18n'

interface Events {
  updated: [id: string, analysis: ScreenshotAnalysis]
  progress: [AnalysisProgress]
  error: [message: string]
}

/**
 * Orchestrates the two analysis stages:
 *  1. local — OCR + heuristics in the worker pool, automatic and free;
 *  2. vision — Claude, on demand (or automatic if the user opts in).
 * Results are cached in the MetadataStore by absolute path + file fingerprint.
 */
export class AnalysisService extends EventEmitter<Events> {
  private readonly localQueue = new Set<string>()
  /** Fresh captures the user is waiting for (notification popup): processed first. */
  private readonly urgent = new Set<string>()
  private localRunning = 0
  private localDone = 0
  private readonly visionQueue: string[] = []
  private visionRunning = false
  private visionDone = 0

  constructor(
    private readonly library: LibraryService,
    private readonly metadata: MetadataStore,
    private readonly settings: SettingsService,
    private readonly pool: WorkerPool,
    private readonly thumbs: ThumbnailService,
    private readonly vision: VisionService,
    private readonly fontSource: () => string | null
  ) {
    super()
  }

  /** Queues every screenshot whose cached analysis is missing, stale or from an older pipeline. */
  scheduleMissing(entries: ScreenshotEntry[]): void {
    if (!this.settings.value.autoAnalyze) return
    const stale = entries.filter(
      (e) => /\.png$/i.test(e.name) && (!e.analysis || e.analysis.schema !== ANALYSIS_SCHEMA)
    )
    this.enqueueLocal(stale.map((e) => e.id))
    if (
      this.settings.value.visionEnabled &&
      this.settings.value.visionAuto &&
      this.vision.isReady()
    ) {
      const noVision = entries.filter((e) => e.analysis && !e.analysis.vision && !e.analysis.error)
      this.enqueueVision(noVision.map((e) => e.id))
    }
  }

  enqueueLocal(ids: string[], urgent = false): void {
    const wanted = ids.filter((id) => /\.png$/i.test(id))
    if (urgent) {
      // Re-insert in front of everything already queued.
      const rest = [...this.localQueue].filter((id) => !wanted.includes(id))
      this.localQueue.clear()
      for (const id of [...wanted, ...rest]) this.localQueue.add(id)
      for (const id of wanted) this.urgent.add(id)
    } else for (const id of wanted) this.localQueue.add(id)
    this.pumpLocal()
  }

  enqueueVision(ids: string[]): void {
    for (const id of ids) if (!this.visionQueue.includes(id)) this.visionQueue.push(id)
    void this.pumpVision()
  }

  /** Manual biome override from the UI; `null` restores the automatic value. */
  async setBiome(id: string, biomeId: string | null): Promise<void> {
    const abs = this.library.resolveId(id)
    const current = this.metadata.analysis(abs)
    if (current) this.save(id, abs, withManualBiome(current, biomeId))
  }

  /** Result of the on-device model for one screenshot. */
  applyLocal(id: string, local: LocalVisionResult): void {
    const abs = this.library.resolveId(id)
    const current = this.metadata.analysis(abs)
    if (current) this.save(id, abs, withLocal(current, local))
  }

  private pumpLocal(): void {
    const parallel = 3
    while (this.localRunning < parallel && this.localQueue.size) {
      const id = this.localQueue.values().next().value as string
      this.localQueue.delete(id)
      this.localRunning++
      void this.runLocal(id).finally(() => {
        this.localRunning--
        this.localDone++
        this.emitProgress('ocr', id)
        this.pumpLocal()
      })
    }
    if (!this.localRunning && !this.localQueue.size) this.localDone = 0
  }

  private async runLocal(id: string): Promise<void> {
    let abs: string
    try {
      abs = this.library.resolveId(id)
    } catch {
      return
    }
    const entry = this.library.entry(id)
    if (!entry || !existsSync(abs)) return
    const fingerprint = fingerprintOf(entry.size, entry.mtimeMs, entry.companionMtimeMs)
    const thumbPath = await this.thumbs.pathFor(abs)
    const priority = this.urgent.delete(id) ? 'high' : 'low'
    const reply = await this.pool.run(
      {
        file: abs,
        fingerprint,
        fontSource: this.fontSource(),
        analyze: true,
        // Generate the thumbnail in the same decode when it is missing.
        thumb: existsSync(thumbPath) ? null : { path: thumbPath, width: this.thumbs.targetWidth() }
      },
      priority
    )
    const previous = this.metadata.analysis(abs)
    const analysis: ScreenshotAnalysis =
      reply.ok && reply.analysis
        ? carryOver(reply.analysis, previous)
        : {
            schema: ANALYSIS_SCHEMA,
            fingerprint,
            analyzedAt: Date.now(),
            hasF3: false,
            f3: null,
            ocr: null,
            mod: null,
            heuristic: { dimension: null, biome: null },
            local: null,
            vision: null,
            manualBiome: null,
            location: null,
            dimension: null,
            biome: null,
            mobs: [],
            structures: [],
            averageColor: '#333333',
            error: reply.error ?? tr('Error desconocido')
          }
    this.save(id, abs, analysis)
  }

  private async pumpVision(): Promise<void> {
    if (this.visionRunning) return
    this.visionRunning = true
    try {
      while (this.visionQueue.length) {
        const id = this.visionQueue.shift()!
        this.emitProgress('vision', id)
        try {
          await this.runVision(id)
        } catch (err) {
          this.emit('error', err instanceof Error ? err.message : String(err))
          if (/API key|permiso|conexión/i.test(String(err))) this.visionQueue.length = 0 // fatal: stop the batch
        }
        this.visionDone++
      }
    } finally {
      this.visionRunning = false
      this.visionDone = 0
      this.emitProgress('vision')
    }
  }

  private async runVision(id: string): Promise<void> {
    const abs = this.library.resolveId(id)
    let base = this.metadata.analysis(abs)
    if (!base || base.schema !== ANALYSIS_SCHEMA) {
      // Local analysis first so the prompt can use the F3 facts.
      await this.runLocal(id)
      base = this.metadata.analysis(abs)
    }
    const result = await this.vision.analyze(abs, base)
    const current = this.metadata.analysis(abs) ?? base
    if (!current) return
    this.save(id, abs, withVision(current, result))
  }

  private save(id: string, abs: string, analysis: ScreenshotAnalysis): void {
    this.metadata.setAnalysis(abs, analysis)
    const entry = this.library.entry(id)
    if (entry) entry.analysis = analysis
    this.emit('updated', id, analysis)
  }

  private emitProgress(kind: 'ocr' | 'vision', current?: string): void {
    if (kind === 'ocr') {
      const pending = this.localQueue.size
      this.emit('progress', {
        kind,
        pending,
        running: this.localRunning,
        done: this.localDone,
        total: this.localDone + pending + this.localRunning,
        current
      })
    } else {
      const pending = this.visionQueue.length
      this.emit('progress', {
        kind,
        pending,
        running: this.visionRunning && current ? 1 : 0,
        done: this.visionDone,
        total: this.visionDone + pending + (this.visionRunning && current ? 1 : 0),
        current
      })
    }
  }
}
