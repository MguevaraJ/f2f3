import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { nativeImage } from 'electron'
import type { WorkerPool } from './WorkerPool'

/** Disk-cached thumbnails, generated in the worker pool (PNG) or by Chromium (JPEG). */
export class ThumbnailService {
  private readonly inflight = new Map<string, Promise<string>>()

  constructor(
    private readonly dir: string,
    private readonly pool: WorkerPool,
    private readonly width: () => number
  ) {
    mkdirSync(dir, { recursive: true })
  }

  /** Where the thumbnail for this exact file version lives (it may not exist yet). */
  async pathFor(file: string): Promise<string> {
    const st = await stat(file)
    const key = createHash('sha1')
      .update(`${file}|${st.size}|${Math.round(st.mtimeMs)}|${this.targetWidth()}`)
      .digest('hex')
    return join(this.dir, key.slice(0, 2), `${key}.png`)
  }

  targetWidth(): number {
    // Two fixed buckets (≈2x the grid cell for HiDPI) so dragging the size slider
    // doesn't regenerate every thumbnail.
    return this.width() <= 260 ? 480 : 720
  }

  async get(file: string): Promise<string> {
    const path = await this.pathFor(file)
    if (existsSync(path)) return path
    let job = this.inflight.get(path)
    if (!job) {
      job = this.generate(file, path).finally(() => this.inflight.delete(path))
      this.inflight.set(path, job)
    }
    return job
  }

  private async generate(file: string, path: string): Promise<string> {
    if (/\.png$/i.test(file)) {
      const reply = await this.pool.run(
        {
          file,
          fingerprint: '',
          fontSource: null,
          analyze: false,
          thumb: { path, width: this.targetWidth() }
        },
        'high'
      )
      if (!reply.ok) throw new Error(reply.error)
      return path
    }
    const img = nativeImage.createFromPath(file)
    if (img.isEmpty()) throw new Error('Imagen no soportada')
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, img.resize({ width: this.targetWidth(), quality: 'good' }).toPNG())
    return path
  }
}
