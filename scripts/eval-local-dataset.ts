/**
 * Scores the local analyser against a labelled set of screenshots: the biome comes from
 * each capture's companion sidecar, the mob at the crosshair from a manifest
 * ("file<TAB>biome:x" or "file<TAB>mob:minecraft:x" per line).
 *   npm run eval:dataset -- <screenshots dir> <manifest.tsv> [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLIPVisionModelWithProjection, env, Tensor } from '@huggingface/transformers'
import { PNG } from 'pngjs'
import {
  classifyScene,
  colourAgrees,
  CROSSHAIR_REGION,
  preprocess,
  rank,
  SCENE_REGION
} from '../src/core/localvision/classify'
import { MOBS_BY_DIMENSION } from '../src/core/localvision/labels'
import { estimateScene } from '../src/core/vision/sceneHeuristics'
import type { LabelEmbeddings } from '../src/core/localvision/labels'
import { LOCAL_MODEL } from '../src/core/localvision/model'

const [dir, manifestPath, outPath] = process.argv.slice(2)
env.cacheDir = process.env.MODEL_CACHE ?? '.cache/models'
const labels = JSON.parse(
  readFileSync('src/core/localvision/labels.json', 'utf8')
) as LabelEmbeddings
const vision = await CLIPVisionModelWithProjection.from_pretrained(LOCAL_MODEL.id, {
  dtype: LOCAL_MODEL.dtype
})
const embed = async (px: Float32Array): Promise<Float32Array> => {
  const s = LOCAL_MODEL.inputSize
  const out = await vision({ pixel_values: new Tensor('float32', px, [1, 3, s, s]) })
  const v = out.image_embeds.data as Float32Array
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}

const known = new Set(
  Object.entries(labels.groups)
    .filter(([k]) => k.startsWith('biome:'))
    .flatMap(([, g]) => g.ids)
)

interface Row {
  file: string
  dimension: string
  biome: string
  biomeKnown: boolean
  biomeGuess: string | null
  mob: string | null
  mobGuess: string | null
  ms: number
  /** Raw ranking, to study thresholds offline. */
  biomeTop: { id: string; p: number; colour: boolean }[]
  mobTop: { id: string; p: number }[]
}

const rows: Row[] = []
for (const line of readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean)) {
  const [file, label] = line.split('\t')
  const side = JSON.parse(readFileSync(join(dir, file.replace(/\.png$/, '.f2f3.json')), 'utf8'))
  const png = PNG.sync.read(readFileSync(join(dir, file)))
  const t = performance.now()
  const r = await classifyScene(png, labels, embed, side.world.dimension)
  const ms = Math.round(performance.now() - t)
  const group =
    side.world.dimension === 'minecraft:the_nether'
      ? 'nether'
      : side.world.dimension === 'minecraft:the_end'
        ? 'end'
        : 'overworld'
  const scene = estimateScene(png, side.world.dimension)
  const biomeTop = rank(
    await embed(preprocess(png, SCENE_REGION)),
    labels.groups[`biome:${group}`],
    labels.logitScale
  )
    .slice(0, 3)
    .map((b) => ({ ...b, colour: colourAgrees(b.id, scene) }))
  const allowed = new Set([...MOBS_BY_DIMENSION[group], 'none'])
  const keep = labels.groups.mob.ids
    .map((id, i) => (allowed.has(id) ? i : -1))
    .filter((i) => i >= 0)
  const mobGroup = {
    ids: keep.map((i) => labels.groups.mob.ids[i]),
    vectors: keep.map((i) => labels.groups.mob.vectors[i])
  }
  const mobTop = rank(
    await embed(preprocess(png, CROSSHAIR_REGION)),
    mobGroup,
    labels.logitScale
  ).slice(0, 3)
  rows.push({
    biomeTop,
    mobTop,
    file,
    dimension: side.world.dimension,
    biome: side.biome,
    biomeKnown: known.has(side.biome),
    biomeGuess: r.biome?.id ?? null,
    mob: label.startsWith('mob:') ? label.slice(4) : null,
    mobGuess: r.targetedMob?.id ?? null,
    ms
  })
}

const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 1000) / 10 : 0)
const tally = (set: Row[], truth: (r: Row) => string | null, guess: (r: Row) => string | null) => {
  const answered = set.filter((r) => guess(r) !== null)
  const correct = answered.filter((r) => guess(r) === truth(r))
  return {
    total: set.length,
    answered: answered.length,
    correct: correct.length,
    wrong: answered.length - correct.length,
    precision: pct(correct.length, answered.length),
    coverage: pct(answered.length, set.length)
  }
}

const biomeRows = rows.filter((r) => r.mob === null)
const mobRows = rows.filter((r) => r.mob !== null)
const summary = {
  model: `${LOCAL_MODEL.id} (${LOCAL_MODEL.dtype})`,
  captures: rows.length,
  msPerCapture: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
  biomeKnown: tally(
    biomeRows.filter((r) => r.biomeKnown),
    (r) => r.biome,
    (r) => r.biomeGuess
  ),
  biomeUnknown: tally(
    biomeRows.filter((r) => !r.biomeKnown),
    (r) => r.biome,
    (r) => r.biomeGuess
  ),
  mob: tally(
    mobRows,
    (r) => r.mob,
    (r) => r.mobGuess
  ),
  mobFalseAlarms: {
    total: biomeRows.length,
    answered: biomeRows.filter((r) => r.mobGuess !== null).length
  }
}
console.log(JSON.stringify(summary, null, 2))
if (outPath) writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2))
