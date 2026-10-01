/**
 * Dumps the CLIP image embeddings of a labelled set (see eval-local-dataset.ts), to
 * study classifiers offline.
 *   tsx --tsconfig tsconfig.node.json scripts/embed-dataset.ts <dir> <manifest.tsv> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLIPVisionModelWithProjection, env, Tensor } from '@huggingface/transformers'
import { PNG } from 'pngjs'
import { CROSSHAIR_REGION, preprocess, SCENE_REGION } from '../src/core/localvision/classify'
import { LOCAL_MODEL } from '../src/core/localvision/model'

const [dir, manifestPath, outPath] = process.argv.slice(2)
env.cacheDir = process.env.MODEL_CACHE ?? '.cache/models'
const vision = await CLIPVisionModelWithProjection.from_pretrained(LOCAL_MODEL.id, {
  dtype: LOCAL_MODEL.dtype
})
const embed = async (px: Float32Array): Promise<number[]> => {
  const s = LOCAL_MODEL.inputSize
  const out = await vision({ pixel_values: new Tensor('float32', px, [1, 3, s, s]) })
  const v = out.image_embeds.data as Float32Array
  const n = Math.hypot(...v)
  return Array.from(v, (x) => Math.round((x / n) * 1e5) / 1e5)
}

const rows = []
for (const line of readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean)) {
  const [file, label] = line.split('\t')
  const side = JSON.parse(readFileSync(join(dir, file.replace(/\.png$/, '.f2f3.json')), 'utf8'))
  const png = PNG.sync.read(readFileSync(join(dir, file)))
  rows.push({
    file,
    label,
    dimension: side.world.dimension,
    biome: side.biome,
    time: side.world.timeOfDay,
    pos: side.player.block,
    scene: await embed(preprocess(png, SCENE_REGION)),
    crosshair: await embed(preprocess(png, CROSSHAIR_REGION))
  })
}
writeFileSync(outPath, JSON.stringify(rows))
console.log(rows.length, 'rows')
