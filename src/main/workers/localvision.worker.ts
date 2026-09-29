import { readFileSync } from 'node:fs'
import { parentPort } from 'node:worker_threads'
import { CLIPVisionModelWithProjection, env, Tensor } from '@huggingface/transformers'
import { PNG } from 'pngjs'
import { classifyScene } from '@core/localvision/classify'
import type { LabelEmbeddings } from '@core/localvision/labels'
import labelsJson from '@core/localvision/labels.json'
import { LOCAL_MODEL } from '@core/localvision/model'
import type { LocalWorkerReply, LocalWorkerRequest } from './localvision.protocol'

/**
 * On-device model thread (level 2). Loads the CLIP vision encoder once and answers
 * "which biome / which mob at the crosshair" for screenshots, off the main thread.
 */

const labels = labelsJson as LabelEmbeddings
let vision: CLIPVisionModelWithProjection | null = null
const post = (msg: LocalWorkerReply): void => parentPort?.postMessage(msg)

async function load(cacheDir: string, allowDownload: boolean): Promise<void> {
  env.cacheDir = cacheDir
  env.allowLocalModels = true
  env.allowRemoteModels = allowDownload // only after the user agreed to download
  const files = new Map<string, { loaded: number; total: number }>()
  vision = await CLIPVisionModelWithProjection.from_pretrained(LOCAL_MODEL.id, {
    dtype: LOCAL_MODEL.dtype,
    // Leave CPU for the game: two threads are plenty for one image at a time.
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      post({ type: 'progress', loaded, total })
    }
  } as never)
}

async function embed(pixels: Float32Array): Promise<Float32Array> {
  const s = LOCAL_MODEL.inputSize
  const out = await vision!({ pixel_values: new Tensor('float32', pixels, [1, 3, s, s]) })
  const v = out.image_embeds.data as Float32Array
  const norm = Math.hypot(...v)
  return v.map((x) => x / norm)
}

// Jobs are handled one at a time, in order.
let chain = Promise.resolve()
parentPort?.on('message', (msg: LocalWorkerRequest) => {
  chain = chain.then(async () => {
    if (msg.type === 'load') {
      try {
        await load(msg.cacheDir, msg.allowDownload)
        post({ type: 'ready' })
      } catch (err) {
        post({ type: 'load-error', message: err instanceof Error ? err.message : String(err) })
      }
      return
    }
    try {
      if (!vision) throw new Error('Modelo no cargado')
      const png = PNG.sync.read(readFileSync(msg.file))
      post({
        type: 'result',
        jobId: msg.jobId,
        result: await classifyScene(png, labels, embed, msg.dimension)
      })
    } catch (err) {
      post({
        type: 'result',
        jobId: msg.jobId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  })
})
