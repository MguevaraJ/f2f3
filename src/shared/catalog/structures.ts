import { normalizeId, prettifyId } from './biomes'

/** Recognisable structures (generated, plus the portals players build), with Spanish names. */
export interface StructureDef {
  id: string
  name: string
  dimension: 'overworld' | 'nether' | 'end'
}

const s = (
  id: string,
  name: string,
  dimension: StructureDef['dimension'] = 'overworld'
): StructureDef => ({
  id: `minecraft:${id}`,
  name,
  dimension
})

export const STRUCTURES: StructureDef[] = [
  s('village', 'Aldea'),
  s('desert_pyramid', 'Templo del desierto'),
  s('jungle_pyramid', 'Templo de la jungla'),
  s('swamp_hut', 'Cabaña de bruja'),
  s('igloo', 'Iglú'),
  s('pillager_outpost', 'Puesto de saqueadores'),
  s('mansion', 'Mansión del bosque'),
  s('monument', 'Monumento oceánico'),
  s('shipwreck', 'Naufragio'),
  s('ocean_ruin', 'Ruinas oceánicas'),
  s('ruined_portal', 'Portal en ruinas'),
  s('mineshaft', 'Mina abandonada'),
  s('stronghold', 'Fortaleza (portal del End)'),
  s('ancient_city', 'Ciudad antigua'),
  s('trail_ruins', 'Ruinas de senderos'),
  s('trial_chambers', 'Cámaras de desafío'),
  s('dungeon', 'Mazmorra'),
  s('desert_well', 'Pozo del desierto'),
  s('fossil', 'Fósil'),
  s('nether_portal', 'Portal del Nether'),
  s('fortress', 'Fortaleza del Nether', 'nether'),
  s('bastion_remnant', 'Restos de bastión', 'nether'),
  s('end_city', 'Ciudad del End', 'end'),
  s('end_ship', 'Barco del End', 'end'),
  s('end_gateway', 'Portal de acceso del End', 'end')
]

const byId = new Map(STRUCTURES.map((x) => [x.id, x]))

export function structureName(id: string): string {
  return byId.get(normalizeId(id))?.name ?? prettifyId(id)
}

export const isKnownStructure = (id: string): boolean => byId.has(normalizeId(id))
