import type { ServerTick, SpawnCategory, SpawnCounts, TargetedBlock } from '@shared/types'

/** Vanilla mob caps per category for one player (MobCategory; misc has none). */
export const MOB_CAPS: { id: SpawnCategory; label: string; hint: string; cap: number }[] = [
  { id: 'monster', label: 'Monstruos', hint: 'Zombis, esqueletos, creepers…', cap: 70 },
  { id: 'creature', label: 'Animales', hint: 'Vacas, ovejas, cerdos…', cap: 10 },
  { id: 'ambient', label: 'Ambiente', hint: 'Murciélagos', cap: 15 },
  { id: 'axolotls', label: 'Ajolotes', hint: 'Ajolotes', cap: 5 },
  {
    id: 'underground_water_creature',
    label: 'Acuáticos de cueva',
    hint: 'Calamares luminosos',
    cap: 5
  },
  { id: 'water_creature', label: 'Acuáticos', hint: 'Calamares, delfines', cap: 5 },
  { id: 'water_ambient', label: 'Peces', hint: 'Bacalaos, salmones, peces tropicales…', cap: 20 }
]

/** The cap grows with the chunks eligible for spawning (289 per player, 17×17). */
export const scaledCap = (cap: number, chunks: number): number => Math.floor((cap * chunks) / 289)

export interface CapRow {
  id: SpawnCategory
  label: string
  hint: string
  count: number
  cap: number
  full: boolean
}

export function capRows(sc: SpawnCounts): CapRow[] {
  return MOB_CAPS.filter((c) => sc.counts[c.id] !== undefined).map((c) => {
    const cap = scaledCap(c.cap, sc.chunks)
    const count = sc.counts[c.id]!
    return { ...c, count, cap, full: cap > 0 && count >= cap }
  })
}

export interface TickInfo {
  tps: number
  lagging: boolean
  label: string
}

/** TPS the server actually reaches: limited by the target rate and by MSPT. */
export function tickInfo(s: ServerTick): TickInfo | null {
  if (s.mspt === undefined) return null
  const target = s.targetMs ?? 50
  const tps = 1000 / Math.max(s.mspt, target)
  const lagging = s.mspt > target && s.tickState !== 'sprinting'
  const state =
    s.tickState === 'frozen'
      ? 'Congelado (/tick freeze)'
      : s.tickState === 'stepping'
        ? 'Avanzando paso a paso (/tick step)'
        : s.tickState === 'sprinting'
          ? 'Acelerado (/tick sprint)'
          : lagging
            ? 'Con lag'
            : 'Sin lag'
  return { tps, lagging, label: state }
}

/** "minecraft:repeater[delay=3,facing=south]", ready for /setblock or /fill. */
export function blockStateString(b: TargetedBlock): string | null {
  if (!b.id) return null
  const props = Object.entries(b.state ?? {})
  return props.length ? `${b.id}[${props.map(([k, v]) => `${k}=${v}`).join(',')}]` : b.id
}

export function setblockCommand(b: TargetedBlock): string | null {
  const state = blockStateString(b)
  return state ? `/setblock ${b.pos.x} ${b.pos.y} ${b.pos.z} ${state}` : null
}

/** Heightmap keys as the debug screen abbreviates them. */
export const HEIGHTMAP_LABEL: Record<string, string> = {
  S: 'superficie',
  M: 'sólido',
  ML: 'sólido sin hojas',
  O: 'fondo oceánico',
  SW: 'superficie (gen.)',
  OW: 'fondo oceánico (gen.)'
}
