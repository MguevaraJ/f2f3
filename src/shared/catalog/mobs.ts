import { tr } from '../i18n'
import { localName, normalizeId, prettifyId } from './biomes'

export type MobCategory = 'hostile' | 'neutral' | 'passive' | 'boss' | 'player' | 'other'

export interface MobDef {
  id: string
  name: string
  category: MobCategory
}

const m = (id: string, name: string, category: MobCategory): MobDef => ({
  id: `minecraft:${id}`,
  name: localName(id, name),
  category
})

export const MOBS: MobDef[] = [
  m('zombie', 'Zombi', 'hostile'),
  m('zombie_villager', 'Aldeano zombi', 'hostile'),
  m('husk', 'Zombi momificado', 'hostile'),
  m('drowned', 'Ahogado', 'hostile'),
  m('skeleton', 'Esqueleto', 'hostile'),
  m('stray', 'Esqueleto glacial', 'hostile'),
  m('bogged', 'Esqueleto pantanoso', 'hostile'),
  m('wither_skeleton', 'Esqueleto wither', 'hostile'),
  m('creeper', 'Creeper', 'hostile'),
  m('spider', 'Araña', 'hostile'),
  m('cave_spider', 'Araña de cueva', 'hostile'),
  m('witch', 'Bruja', 'hostile'),
  m('slime', 'Slime', 'hostile'),
  m('magma_cube', 'Cubo de magma', 'hostile'),
  m('phantom', 'Phantom', 'hostile'),
  m('pillager', 'Saqueador', 'hostile'),
  m('vindicator', 'Vindicador', 'hostile'),
  m('evoker', 'Invocador', 'hostile'),
  m('vex', 'Vex', 'hostile'),
  m('ravager', 'Devastador', 'hostile'),
  m('guardian', 'Guardián', 'hostile'),
  m('elder_guardian', 'Guardián anciano', 'hostile'),
  m('silverfish', 'Lepisma', 'hostile'),
  m('endermite', 'Endermite', 'hostile'),
  m('blaze', 'Blaze', 'hostile'),
  m('ghast', 'Ghast', 'hostile'),
  m('hoglin', 'Hoglin', 'hostile'),
  m('zoglin', 'Zoglin', 'hostile'),
  m('piglin_brute', 'Piglin bruto', 'hostile'),
  m('shulker', 'Shulker', 'hostile'),
  m('warden', 'Warden', 'hostile'),
  m('breeze', 'Breeze', 'hostile'),
  m('creaking', 'Crujidor', 'hostile'),
  m('enderman', 'Enderman', 'neutral'),
  m('piglin', 'Piglin', 'neutral'),
  m('zombified_piglin', 'Piglin zombificado', 'neutral'),
  m('wolf', 'Lobo', 'neutral'),
  m('bee', 'Abeja', 'neutral'),
  m('llama', 'Llama', 'neutral'),
  m('trader_llama', 'Llama de comerciante', 'neutral'),
  m('polar_bear', 'Oso polar', 'neutral'),
  m('panda', 'Panda', 'neutral'),
  m('dolphin', 'Delfín', 'neutral'),
  m('goat', 'Cabra', 'neutral'),
  m('iron_golem', 'Gólem de hierro', 'neutral'),
  m('pig', 'Cerdo', 'passive'),
  m('cow', 'Vaca', 'passive'),
  m('mooshroom', 'Champiñaca', 'passive'),
  m('sheep', 'Oveja', 'passive'),
  m('chicken', 'Gallina', 'passive'),
  m('rabbit', 'Conejo', 'passive'),
  m('horse', 'Caballo', 'passive'),
  m('donkey', 'Burro', 'passive'),
  m('mule', 'Mula', 'passive'),
  m('skeleton_horse', 'Caballo esqueleto', 'passive'),
  m('zombie_horse', 'Caballo zombi', 'passive'),
  m('camel', 'Camello', 'passive'),
  m('villager', 'Aldeano', 'passive'),
  m('wandering_trader', 'Vendedor ambulante', 'passive'),
  m('cat', 'Gato', 'passive'),
  m('ocelot', 'Ocelote', 'passive'),
  m('parrot', 'Loro', 'passive'),
  m('fox', 'Zorro', 'passive'),
  m('turtle', 'Tortuga', 'passive'),
  m('cod', 'Bacalao', 'passive'),
  m('salmon', 'Salmón', 'passive'),
  m('tropical_fish', 'Pez tropical', 'passive'),
  m('pufferfish', 'Pez globo', 'passive'),
  m('squid', 'Calamar', 'passive'),
  m('glow_squid', 'Calamar brillante', 'passive'),
  m('axolotl', 'Ajolote', 'passive'),
  m('frog', 'Rana', 'passive'),
  m('tadpole', 'Renacuajo', 'passive'),
  m('allay', 'Allay', 'passive'),
  m('sniffer', 'Sniffer', 'passive'),
  m('armadillo', 'Armadillo', 'passive'),
  m('strider', 'Strider', 'passive'),
  m('bat', 'Murciélago', 'passive'),
  m('snow_golem', 'Gólem de nieve', 'passive'),
  m('happy_ghast', 'Ghast feliz', 'passive'),
  m('ender_dragon', 'Dragón del End', 'boss'),
  m('wither', 'Wither', 'boss'),
  m('player', 'Jugador', 'player')
]

const byId = new Map(MOBS.map((x) => [x.id, x]))

export function mobById(id: string): MobDef | undefined {
  return byId.get(normalizeId(id))
}

export function mobName(id: string): string {
  return mobById(id)?.name ?? prettifyId(id)
}

export const MOB_CATEGORY_LABEL: Record<MobCategory, string> = {
  hostile: tr('Hostil'),
  neutral: tr('Neutral'),
  passive: tr('Pasivo'),
  boss: tr('Jefe'),
  player: tr('Jugador'),
  other: tr('Otro')
}
