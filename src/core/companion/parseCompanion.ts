import { z } from 'zod'
import type { CompanionData, LocationData, Vec3 } from '@shared/types'

/**
 * Sidecar written by the Craftshot Companion mod (Fabric) next to each screenshot:
 * "2026-09-29_21.38.54.png" → "2026-09-29_21.38.54.craftshot.json".
 * Pure module — the caller reads the file.
 */
export const COMPANION_SUFFIX = '.craftshot.json'

export const companionPathFor = (imagePath: string): string =>
  imagePath.replace(/\.[^./\\]+$/, '') + COMPANION_SUFFIX

const num = z.number().finite()
const vec = z.object({ x: num, y: num, z: num })
const blockVec = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() })
const id = z.string().regex(/^[a-z0-9_.-]+:[a-z0-9_/.-]+$/)

const item = z.object({
  id,
  count: z.number().int().nonnegative(),
  enchantments: z.record(id, z.number().int()).optional()
})
const globalPos = z.object({
  dimension: id,
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int()
})
const ruleValue = z.union([z.boolean(), z.number(), z.string()])

/** Sections added after the first release: a malformed one is dropped, not the whole file. */
const lenient = <T extends z.ZodType>(t: T) => t.optional().catch(undefined)

const schema = z.object({
  format: z.literal('craftshot-companion'),
  schema: z.literal(1),
  mod: z.object({ version: z.string(), minecraft: z.string() }),
  capturedAt: z.string(),
  world: z.object({
    type: z.enum(['singleplayer', 'multiplayer', 'realms']),
    name: z.string(),
    seed: z.string().regex(/^-?\d+$/).optional(),
    dimension: id,
    day: z.number().int().nonnegative(),
    timeOfDay: z.number().int().min(0).max(23999),
    weather: z.enum(['clear', 'rain', 'thunder'])
  }),
  player: z.object({
    position: vec,
    block: blockVec,
    chunk: blockVec,
    facing: z.object({ direction: z.string(), yaw: num, pitch: num }),
    gameMode: z.string()
  }),
  biome: z.string(),
  light: z.object({ sky: z.number().int(), block: z.number().int() }).optional(),
  target: z
    .object({
      block: z
        .object({
          id,
          pos: blockVec,
          state: lenient(z.record(z.string(), z.string())),
          signal: lenient(
            z.object({
              received: z.number().int(),
              comparatorOutput: z.number().int().optional(),
              containerSignal: z.number().int().optional()
            })
          ),
          container: lenient(
            z.object({
              size: z.number().int(),
              items: z.array(item.extend({ slot: z.number().int() }))
            })
          )
        })
        .optional(),
      entity: z
        .object({
          id,
          distance: num,
          villager: lenient(
            z.object({
              profession: z.string().optional(),
              type: z.string().optional(),
              level: z.number().int().optional(),
              xp: z.number().int().optional(),
              home: globalPos.optional(),
              jobSite: globalPos.optional(),
              meetingPoint: globalPos.optional(),
              golemDetectedRecently: z.boolean().optional(),
              trades: z.array(
                z.object({
                  buy: z.array(item),
                  sell: item,
                  uses: z.number().int(),
                  maxUses: z.number().int()
                })
              )
            })
          )
        })
        .optional()
    })
    .default({}),
  entities: z
    .array(z.object({ id, count: z.number().int().positive(), nearest: num }))
    .default([]),
  structures: z.object({ inside: z.array(id), target: z.array(id) }).optional(),
  nearby: lenient(z.array(z.object({ id, count: z.number().int() }))),
  game: lenient(
    z.object({
      difficulty: z.string(),
      hardcore: z.boolean(),
      renderDistance: z.number().int(),
      simulationDistance: z.number().int(),
      serverBrand: z.string().optional(),
      tick: z.object({
        rate: num,
        state: z.enum(['normal', 'frozen', 'stepping', 'sprinting']),
        mspt: num.optional()
      })
    })
  ),
  mods: lenient(z.array(z.object({ id: z.string(), name: z.string(), version: z.string() }))),
  spawn: lenient(
    z.object({
      chunks: z.number().int(),
      counts: z.record(z.string(), z.number().int())
    })
  ),
  gamerules: lenient(z.record(z.string(), z.object({ value: ruleValue, default: ruleValue })))
})

/** Parses the sidecar's text; null when it is not a valid schema-1 file. */
export function parseCompanion(text: string): CompanionData | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const r = schema.safeParse(json)
  if (!r.success) return null
  const d = r.data
  return {
    modVersion: d.mod.version,
    minecraft: d.mod.minecraft,
    capturedAt: d.capturedAt,
    world: d.world,
    player: d.player,
    biome: d.biome,
    light: d.light,
    target: d.target,
    entities: d.entities,
    structures: d.structures,
    nearby: d.nearby,
    game: d.game,
    mods: d.mods,
    spawn: d.spawn as CompanionData['spawn'],
    gamerules: d.gamerules
  }
}

/** Mod structure ids are variants ("village_plains"); the catalog groups them. */
const STRUCTURE_GROUPS: [RegExp, string][] = [
  [/^village_/, 'village'],
  [/^ocean_ruin_/, 'ocean_ruin'],
  [/^ruined_portal/, 'ruined_portal'],
  [/^shipwreck/, 'shipwreck'],
  [/^mineshaft/, 'mineshaft'],
  [/^nether_fossil$/, 'fossil']
]

export function catalogStructureId(structure: string): string {
  const [ns, path] = structure.includes(':') ? structure.split(':', 2) : ['minecraft', structure]
  if (ns !== 'minecraft') return structure
  const group = STRUCTURE_GROUPS.find(([re]) => re.test(path))
  return `minecraft:${group ? group[1] : path}`
}

/** Distinct catalog ids of the structures around the player and the targeted block. */
export function companionStructures(c: CompanionData): string[] | null {
  if (!c.structures) return null
  return [...new Set([...c.structures.inside, ...c.structures.target].map(catalogStructureId))]
}

const TOWARDS: Record<string, string> = {
  north: 'negative Z',
  south: 'positive Z',
  east: 'positive X',
  west: 'negative X'
}

const mod16 = (n: number): number => ((n % 16) + 16) % 16

/** The mod's data in the same shape the F3 parser produces. */
export function companionLocation(c: CompanionData): LocationData {
  const { block, chunk, facing } = c.player
  const rel: Vec3 = { x: mod16(block.x), y: mod16(block.y), z: mod16(block.z) }
  return {
    source: 'mod',
    dimension: c.world.dimension,
    position: c.player.position,
    block,
    chunk,
    chunkRelative: rel,
    region: `r.${chunk.x >> 5}.${chunk.z >> 5}.mca`,
    facing: { ...facing, towards: TOWARDS[facing.direction] },
    light: c.light,
    targetedBlock: c.target.block && {
      pos: c.target.block.pos,
      id: c.target.block.id,
      state: c.target.block.state
    },
    targetedEntity: c.target.entity?.id
  }
}

