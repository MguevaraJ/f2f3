/**
 * Precomputes CLIP text embeddings for the local analyser's labels.
 *   npm run build:labels
 * Output: src/core/localvision/labels.json (committed; tiny compared to the model).
 */
import { writeFileSync } from 'node:fs'
import { AutoTokenizer, CLIPTextModelWithProjection, env } from '@huggingface/transformers'
import {
  BIOME_PROMPTS,
  MOB_PROMPTS,
  PROMPT,
  type LabelEmbeddings
} from '../src/core/localvision/labels'
import { LOCAL_MODEL } from '../src/core/localvision/model'

env.cacheDir = process.env.MODEL_CACHE ?? '.cache/models'
const tokenizer = await AutoTokenizer.from_pretrained(LOCAL_MODEL.id)
// Full precision at build time: users never download the text half.
const text = await CLIPTextModelWithProjection.from_pretrained(LOCAL_MODEL.id, { dtype: 'fp32' })

async function embed(prompts: string[]): Promise<number[][]> {
  const out = await text(tokenizer(prompts, { padding: true, truncation: true }))
  const [n, d] = out.text_embeds.dims
  const data = out.text_embeds.data as Float32Array
  return Array.from({ length: n }, (_, i) => {
    const v = Array.from(data.slice(i * d, (i + 1) * d))
    const norm = Math.hypot(...v)
    return v.map((x) => Math.round((x / norm) * 1e5) / 1e5)
  })
}

const groups: LabelEmbeddings['groups'] = {}
for (const [dim, set] of Object.entries(BIOME_PROMPTS))
  groups[`biome:${dim}`] = {
    ids: Object.keys(set),
    vectors: await embed(Object.values(set).map(PROMPT))
  }
groups.mob = {
  ids: Object.keys(MOB_PROMPTS),
  vectors: await embed(Object.values(MOB_PROMPTS).map(PROMPT))
}

const result: LabelEmbeddings = {
  model: LOCAL_MODEL.id,
  dim: groups.mob.vectors[0].length,
  logitScale: 100,
  groups
}
writeFileSync('src/core/localvision/labels.json', JSON.stringify(result))
console.log(
  'labels:',
  Object.entries(groups)
    .map(([k, g]) => `${k}=${g.ids.length}`)
    .join(' ')
)
