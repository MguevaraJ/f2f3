/**
 * Evaluates the local analyser on screenshots (dimension from Craftshot's cache when known).
 *   npm run eval:local -- ~/.minecraft/screenshots/*.png
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { CLIPVisionModelWithProjection, env, Tensor } from '@huggingface/transformers'
import { PNG } from 'pngjs'
import { classifyScene } from '../src/core/localvision/classify'
import type { LabelEmbeddings } from '../src/core/localvision/labels'
import { LOCAL_MODEL } from '../src/core/localvision/model'

env.cacheDir = process.env.MODEL_CACHE ?? '.cache/models'
const labels = JSON.parse(
  readFileSync('src/core/localvision/labels.json', 'utf8')
) as LabelEmbeddings
const vision = await CLIPVisionModelWithProjection.from_pretrained(LOCAL_MODEL.id, {
  dtype: LOCAL_MODEL.dtype
})
let cache: Record<string, { dimension?: { id: string } }> = {}
try {
  cache = JSON.parse(readFileSync(homedir() + '/.config/Craftshot/library.json', 'utf8')).analyses
} catch {
  /* no cache */
}
const embed = async (px: Float32Array): Promise<Float32Array> => {
  const s = LOCAL_MODEL.inputSize
  const out = await vision({ pixel_values: new Tensor('float32', px, [1, 3, s, s]) })
  const v = out.image_embeds.data as Float32Array
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}
for (const f of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(f))
  const t = performance.now()
  const r = await classifyScene(png, labels, embed, cache[f]?.dimension?.id)
  const fmt = (g: { id: string; confidence: number } | null) =>
    g ? `${g.id.slice(10)} ${(g.confidence * 100).toFixed(0)}%` : '—'
  console.log(
    `${f.split('/').pop()} ${(performance.now() - t).toFixed(0)}ms  bioma: ${fmt(r.biome).padEnd(26)} mob: ${fmt(r.targetedMob)}`
  )
}
