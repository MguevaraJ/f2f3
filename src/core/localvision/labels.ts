/**
 * Prompts for the local zero-shot model (CLIP). Their text embeddings are
 * precomputed at build time (scripts/build-clip-labels.ts → labels.json) so users
 * only download the vision half of the model.
 *
 * Biome candidates are split per dimension: knowing the dimension (from F3 or the
 * colour estimate) removes most confusions (e.g. dark Nether vs. caves).
 */

export const PROMPT = (s: string): string => `a Minecraft screenshot of ${s}`

export const BIOME_PROMPTS: Record<'overworld' | 'nether' | 'end', Record<string, string>> = {
  overworld: {
    'minecraft:desert': 'a sandy desert',
    'minecraft:beach': 'a sandy beach next to water',
    'minecraft:ocean': 'an open ocean',
    'minecraft:river': 'a river between grassy banks',
    'minecraft:plains': 'flat grassy plains',
    'minecraft:forest': 'an oak and birch forest',
    'minecraft:dark_forest': 'a dense dark oak forest',
    'minecraft:taiga': 'a spruce taiga forest',
    'minecraft:snowy_plains': 'snowy plains',
    'minecraft:jungle': 'a lush jungle',
    'minecraft:savanna': 'a dry savanna with acacia trees',
    'minecraft:badlands': 'orange terracotta badlands',
    'minecraft:swamp': 'a murky swamp',
    'minecraft:cherry_grove': 'a pink cherry blossom grove',
    'minecraft:meadow': 'a flowery mountain meadow',
    'minecraft:stony_peaks': 'rocky stone mountains',
    'minecraft:mushroom_fields': 'purple mycelium mushroom fields',
    'minecraft:dripstone_caves': 'a dark underground cave'
  },
  nether: {
    'minecraft:nether_wastes': 'red netherrack nether wastes with lava',
    'minecraft:crimson_forest': 'a crimson forest with red huge fungi',
    'minecraft:warped_forest': 'a warped forest with teal huge fungi',
    'minecraft:soul_sand_valley': 'a soul sand valley with blue fire',
    'minecraft:basalt_deltas': 'grey basalt deltas'
  },
  end: {
    'minecraft:the_end': 'the End with end stone islands and obsidian pillars',
    'minecraft:end_highlands': 'end stone highlands with purple chorus plants'
  }
}

/** Mob at the crosshair. The last label is the "nothing there" option. */
export const MOB_PROMPTS: Record<string, string> = {
  'minecraft:zombie': 'a zombie',
  'minecraft:skeleton': 'a skeleton',
  'minecraft:creeper': 'a creeper',
  'minecraft:spider': 'a spider',
  'minecraft:enderman': 'an enderman',
  'minecraft:witch': 'a witch',
  'minecraft:slime': 'a green slime cube',
  'minecraft:pig': 'a pig',
  'minecraft:cow': 'a cow',
  'minecraft:sheep': 'a sheep',
  'minecraft:chicken': 'a chicken',
  'minecraft:horse': 'a horse',
  'minecraft:wolf': 'a wolf',
  'minecraft:villager': 'a villager',
  'minecraft:iron_golem': 'an iron golem',
  'minecraft:piglin': 'a piglin',
  'minecraft:zombified_piglin': 'a zombified piglin',
  'minecraft:ghast': 'a ghast',
  'minecraft:hoglin': 'a hoglin',
  'minecraft:blaze': 'a blaze',
  'minecraft:strider': 'a strider',
  none: 'no creature, just blocks and terrain'
}

/** Mobs that can be at the crosshair in each dimension (slimes don't spawn in the Nether…). */
export const MOBS_BY_DIMENSION: Record<'overworld' | 'nether' | 'end', string[]> = {
  overworld: [
    'minecraft:zombie',
    'minecraft:skeleton',
    'minecraft:creeper',
    'minecraft:spider',
    'minecraft:enderman',
    'minecraft:witch',
    'minecraft:slime',
    'minecraft:pig',
    'minecraft:cow',
    'minecraft:sheep',
    'minecraft:chicken',
    'minecraft:horse',
    'minecraft:wolf',
    'minecraft:villager',
    'minecraft:iron_golem'
  ],
  nether: [
    'minecraft:skeleton',
    'minecraft:enderman',
    'minecraft:piglin',
    'minecraft:zombified_piglin',
    'minecraft:ghast',
    'minecraft:hoglin',
    'minecraft:blaze',
    'minecraft:strider'
  ],
  end: ['minecraft:enderman']
}

export interface LabelEmbeddings {
  model: string
  dim: number
  logitScale: number
  groups: Record<string, { ids: string[]; vectors: number[][] }>
}
