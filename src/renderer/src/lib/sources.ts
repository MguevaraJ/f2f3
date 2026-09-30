import type { InfoSource, VisionProviderId } from '@shared/types'

/**
 * The three levels of information, explained the same way everywhere
 * (tags, legend, settings, onboarding).
 */
export interface SourceInfo {
  /** Short tag shown next to a value. */
  tag: string
  /** Human label. */
  label: string
  /** One-line explanation for tooltips and the legend. */
  hint: string
}

export const SOURCE_INFO: Record<InfoSource, SourceInfo> = {
  mod: {
    tag: 'Mod',
    label: 'Exacto',
    hint: 'Guardado por el mod Craftshot Companion en el momento de la captura. Es el dato real del juego.'
  },
  f3: {
    tag: 'F3',
    label: 'Exacto',
    hint: 'Leído de la pantalla F3 del juego. Es el dato real, sin estimaciones.'
  },
  vision: {
    tag: 'IA',
    label: 'IA avanzada',
    hint: 'Identificado por el servicio de IA que configuraste. Muy preciso, pero puede equivocarse.'
  },
  local: {
    tag: 'Local',
    label: 'Estimado',
    hint: 'Estimado por el modelo que corre en tu equipo. Solo responde cuando está bastante seguro.'
  },
  heuristic: {
    tag: 'Colores',
    label: 'Aproximado',
    hint: 'Aproximado por los colores de la imagen. Es la estimación menos fiable.'
  },
  manual: {
    tag: 'Manual',
    label: 'Elegido por ti',
    hint: 'Lo asignaste tú manualmente.'
  }
}

export const PROVIDER_LABEL: Record<VisionProviderId, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama'
}

/** Optional extra for Fabric players: exact data without the F3. */
export const MOD_LEVEL = {
  id: 'mod',
  title: 'Mod Craftshot Companion',
  badge: 'Exacto · Opcional · Fabric 26.3',
  gives:
    'Coordenadas, bioma, mobs visibles, estructuras, semilla, hora y clima sin abrir el F3; y para técnico: TPS, límite de mobs, reglas del juego, contenido de cofres y tolvas, señal de redstone y tratos de aldeanos.',
  needs:
    'Minecraft 26.3 con Fabric Loader. Guarda el mod y ponlo en la carpeta mods de ese perfil; al pulsar F2 deja un .craftshot.json junto a la captura.'
} as const

/** The levels as presented in onboarding and settings. */
export const LEVELS = [
  {
    id: 'f3',
    number: 1,
    title: 'Pantalla F3',
    badge: 'Exacto · Gratis',
    gives: 'Coordenadas, dimensión, orientación, bioma y el mob que apuntas.',
    needs: 'Hacer la captura con el F3 abierto. Funciona sin internet.'
  },
  {
    id: 'local',
    number: 2,
    title: 'Modelo local',
    badge: 'Estimado · Gratis · Privado',
    gives: 'Bioma aproximado y el mob que tienes en la mira, cuando no hay F3.',
    needs:
      'Una descarga única de unos 170 MB. Luego funciona sin internet y nada sale de tu equipo.'
  },
  {
    id: 'vision',
    number: 3,
    title: 'IA avanzada',
    badge: 'Opcional · Tu servicio',
    gives: 'Bioma preciso, todos los mobs visibles, estructuras (aldeas, templos…), clima y hora.',
    needs: 'Una cuenta de Claude, Gemini u OpenAI, o Ollama instalado en tu equipo (gratis).'
  }
] as const
