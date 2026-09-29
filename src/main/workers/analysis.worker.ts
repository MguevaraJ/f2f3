import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parentPort } from 'node:worker_threads'
import { PNG } from 'pngjs'
import { analyzeImage } from '@core/analyze'
import { loadFontFrom, type MinecraftFont } from '@core/font/minecraftFont'
import { downscale } from '@core/image/resize'
import type { WorkerJob, WorkerReply } from './protocol'

/**
 * Worker thread: decodes a screenshot once and does the CPU-heavy work on it
 * (F3 OCR, colour heuristics, thumbnail) off the main process event loop.
 */

const fonts = new Map<string, MinecraftFont | null>()

function font(source: string | null): MinecraftFont | null {
  if (!source) return null
  if (!fonts.has(source)) {
    try {
      fonts.set(source, loadFontFrom(source))
    } catch {
      fonts.set(source, null)
    }
  }
  return fonts.get(source) ?? null
}

function writeAtomic(path: string, data: Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

function run(job: WorkerJob): WorkerReply {
  const png = PNG.sync.read(readFileSync(job.file))
  const reply: WorkerReply = { jobId: job.jobId, ok: true, width: png.width, height: png.height }
  if (job.thumb) {
    const small = downscale(png, job.thumb.width)
    const out = new PNG({ width: small.width, height: small.height })
    out.data = Buffer.from(small.data)
    writeAtomic(job.thumb.path, PNG.sync.write(out, { deflateLevel: 6, colorType: 2 }))
  }
  if (job.analyze) reply.analysis = analyzeImage(png, font(job.fontSource), job.fingerprint)
  return reply
}

parentPort?.on('message', (job: WorkerJob) => {
  let reply: WorkerReply
  try {
    reply = run(job)
  } catch (err) {
    reply = { jobId: job.jobId, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  parentPort?.postMessage(reply)
})
