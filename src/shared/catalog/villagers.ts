import { prettifyId } from './biomes'

/** Spanish names as the game shows them (es_es). */
const PROFESSIONS: Record<string, string> = {
  none: 'Sin profesión',
  armorer: 'Herrero de armaduras',
  butcher: 'Carnicero',
  cartographer: 'Cartógrafo',
  cleric: 'Clérigo',
  farmer: 'Granjero',
  fisherman: 'Pescador',
  fletcher: 'Flechero',
  leatherworker: 'Peletero',
  librarian: 'Bibliotecario',
  mason: 'Albañil',
  nitwit: 'Simple',
  shepherd: 'Pastor',
  toolsmith: 'Herrero de herramientas',
  weaponsmith: 'Herrero de armas'
}

const LEVELS = ['Novato', 'Aprendiz', 'Oficial', 'Experto', 'Maestro']

const ENCHANTMENTS: Record<string, string> = {
  aqua_affinity: 'Afinidad acuática',
  bane_of_arthropods: 'Perdición de los artrópodos',
  binding_curse: 'Maldición de ligamiento',
  blast_protection: 'Protección contra explosiones',
  breach: 'Brecha',
  channeling: 'Conductividad',
  density: 'Densidad',
  depth_strider: 'Agilidad acuática',
  efficiency: 'Eficiencia',
  feather_falling: 'Caída de pluma',
  fire_aspect: 'Aspecto ígneo',
  fire_protection: 'Protección contra el fuego',
  flame: 'Fuego',
  fortune: 'Fortuna',
  frost_walker: 'Paso helado',
  impaling: 'Empalamiento',
  infinity: 'Infinidad',
  knockback: 'Empuje',
  looting: 'Botín',
  loyalty: 'Lealtad',
  luck_of_the_sea: 'Suerte marina',
  lure: 'Atracción',
  mending: 'Reparación',
  multishot: 'Multidisparo',
  piercing: 'Perforación',
  power: 'Poder',
  projectile_protection: 'Protección contra proyectiles',
  protection: 'Protección',
  punch: 'Retroceso',
  quick_charge: 'Carga rápida',
  respiration: 'Respiración',
  riptide: 'Propulsión acuática',
  sharpness: 'Filo',
  silk_touch: 'Toque de seda',
  smite: 'Castigo',
  soul_speed: 'Velocidad de alma',
  sweeping_edge: 'Filo arrasador',
  swift_sneak: 'Sigilo rápido',
  thorns: 'Espinas',
  unbreaking: 'Irrompibilidad',
  vanishing_curse: 'Maldición de desaparición',
  wind_burst: 'Ráfaga de viento'
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

const path = (id: string): string => id.split(':').pop() ?? id

export const professionName = (id: string): string => PROFESSIONS[path(id)] ?? prettifyId(id)

export const villagerLevelName = (level: number): string => LEVELS[level - 1] ?? `Nivel ${level}`

export function enchantmentName(id: string, level: number): string {
  const name = ENCHANTMENTS[path(id)] ?? prettifyId(id)
  return `${name} ${ROMAN[level] ?? level}`
}
