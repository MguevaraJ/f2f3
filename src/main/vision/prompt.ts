import { z } from 'zod'
import { BIOMES } from '@shared/catalog/biomes'
import { MOBS } from '@shared/catalog/mobs'
import { STRUCTURES } from '@shared/catalog/structures'

/** Shared prompt + output contract for every advanced-AI provider. */

export const VisionSchema = z.object({
  description: z.string(),
  dimension: z.enum([
    'minecraft:overworld',
    'minecraft:the_nether',
    'minecraft:the_end',
    'unknown'
  ]),
  biome_id: z.string(),
  biome_confidence: z.number(),
  time_of_day: z.enum(['day', 'sunrise', 'sunset', 'night', 'underground', 'unknown']),
  weather: z.enum(['clear', 'rain', 'thunder', 'snow', 'unknown']),
  mobs: z.array(z.object({ id: z.string(), count: z.number().int() })),
  structures: z.array(z.string())
})
export type VisionOutput = z.infer<typeof VisionSchema>

/** Plain JSON Schema of the same shape, for providers that take one (OpenAI, Gemini, Ollama). */
export const VISION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'description',
    'dimension',
    'biome_id',
    'biome_confidence',
    'time_of_day',
    'weather',
    'mobs',
    'structures'
  ],
  properties: {
    description: { type: 'string' },
    dimension: {
      type: 'string',
      enum: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end', 'unknown']
    },
    biome_id: { type: 'string' },
    biome_confidence: { type: 'number' },
    time_of_day: {
      type: 'string',
      enum: ['day', 'sunrise', 'sunset', 'night', 'underground', 'unknown']
    },
    weather: { type: 'string', enum: ['clear', 'rain', 'thunder', 'snow', 'unknown'] },
    mobs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'count'],
        properties: { id: { type: 'string' }, count: { type: 'integer' } }
      }
    },
    structures: { type: 'array', items: { type: 'string' } }
  }
} as const

export const SYSTEM_PROMPT = [
  'You analyse Minecraft Java Edition screenshots for a screenshot manager used by technical players.',
  'Report only what is visible in the image. Write the description in Spanish; keep ids as vanilla namespaced ids.',
  'Reply with a single JSON object matching the requested schema, nothing else.',
  '',
  'biome_id: the most likely biome the player stands in, from this list (or "unknown"):',
  BIOMES.map((b) => b.id).join(', '),
  'Use terrain, vegetation, grass/foliage/water tint, sky/fog colour and blocks as evidence.',
  'biome_confidence: 0..1, be honest — plains vs meadow or ocean variants are often ambiguous.',
  '',
  "mobs: every living entity clearly visible in the world (not the HUD, not the player's own hand, not item",
  'drops, heads, spawners or paintings). Group by id with a count. Use these ids:',
  MOBS.map((m) => m.id).join(', '),
  'Other players are "minecraft:player". Empty list when there are none.',
  '',
  'structures: generated structures (or portals) clearly visible, using ONLY these ids:',
  STRUCTURES.map((x) => x.id).join(', '),
  'Do not guess: player-built houses are not villages. Empty list when there are none.',
  '',
  'description: one short Spanish sentence describing the scene.'
].join('\n')

export function userPrompt(facts: string[]): string {
  return ['Analyse this screenshot.', ...facts].join('\n')
}
