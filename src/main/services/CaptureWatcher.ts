import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { LibrarySnapshot, ScreenshotAnalysis, ScreenshotEntry } from '@shared/types'
import { companionPathFor } from '@core/companion/parseCompanion'
import type { AnalysisService } from './AnalysisService'
import { capturedAtFromName, type LibraryService } from './LibraryService'

/** A capture counts as new only if Minecraft named it within this window. */
export const FRESH_WINDOW_MS = 2 * 60_000

interface Events {
  /** A screenshot Minecraft just saved (analysis may still be pending). */
  capture: [ScreenshotEntry]
  /** The F3 analysis of a recent capture finished. */
  analyzed: [ScreenshotEntry]
}

/**
 * Turns library changes into "the player just pressed F2" events.
 *
 * New files alone are not enough: pasting, importing or restoring from Drive also
 * add files. A fresh capture is a file that (1) wasn't in the previous snapshot of
 * the same folder and (2) carries a Minecraft timestamp name from the last couple
 * of minutes — copies and restores keep their original, older names.
 */
export class CaptureWatcher extends EventEmitter<Events> {
  private known: Set<string> | null = null
  private root: string | null = null
  private readonly waiting = new Map<string, { retried: boolean }>()
  /** Set once a capture came with the Companion mod sidecar. */
  private modSeen = false

  constructor(
    private readonly library: LibraryService,
    private readonly analysis: AnalysisService,
    private readonly now: () => number = Date.now
  ) {
    super()
    analysis.on('updated', (id, a) => this.onAnalyzed(id, a))
  }

  /** Feed every library snapshot here. */
  onSnapshot(snap: LibrarySnapshot): void {
    const ids = new Set(snap.screenshots.map((s) => s.id))
    // First snapshot, or a different folder: just take a baseline.
    if (!this.known || this.root !== snap.root) {
      this.known = ids
      this.root = snap.root
      return
    }
    const fresh = snap.screenshots.filter((s) => !this.known!.has(s.id) && this.isFresh(s))
    this.known = ids
    // Oldest first, so the popup ends up showing the latest one.
    for (const entry of fresh.sort((a, b) => a.capturedAt - b.capturedAt)) void this.handle(entry)
  }

  isFresh(entry: ScreenshotEntry): boolean {
    const t = capturedAtFromName(entry.name)
    if (t === null) return false
    const age = this.now() - t
    return age >= -5_000 && age <= FRESH_WINDOW_MS // small tolerance for clock rounding
  }

  private async handle(entry: ScreenshotEntry): Promise<void> {
    this.emit('capture', entry)
    if (!/\.png$/i.test(entry.name)) return
    this.waiting.set(entry.id, { retried: false })
    await this.waitUntilWritten(entry.id)
    if (this.modSeen) await this.waitForCompanion(entry.id)
    this.analysis.enqueueLocal([entry.id], true)
  }

  /**
   * The Companion mod writes its sidecar right after the image (a bit later in
   * singleplayer, while the server looks up structures). Only waited for once the
   * mod has shown up, so players without it get the popup as fast as before.
   */
  private async waitForCompanion(id: string): Promise<void> {
    const path = companionPathFor(this.library.resolveId(id))
    for (let i = 0; i < 20 && !existsSync(path); i++)
      await new Promise((r) => setTimeout(r, 120))
  }

  /** Minecraft writes the PNG in a background thread: wait until its size settles. */
  private async waitUntilWritten(id: string): Promise<void> {
    let last = -1
    for (let i = 0; i < 25; i++) {
      try {
        const { size } = await stat(this.library.resolveId(id))
        if (size > 0 && size === last) return
        last = size
      } catch {
        /* not there yet */
      }
      await new Promise((r) => setTimeout(r, 120))
    }
  }

  private onAnalyzed(id: string, analysis: ScreenshotAnalysis): void {
    const state = this.waiting.get(id)
    if (!state) return
    if (analysis.mod) this.modSeen = true
    // A read that raced the game still writing the file (image or mod sidecar): try once more.
    const lateSidecar = !analysis.mod && existsSync(companionPathFor(this.library.resolveId(id)))
    if ((analysis.error || lateSidecar) && !state.retried) {
      state.retried = true
      setTimeout(() => this.analysis.enqueueLocal([id], true), 400)
      return
    }
    this.waiting.delete(id)
    const entry = this.library.entry(id)
    if (entry) this.emit('analyzed', { ...entry, analysis })
  }
}
