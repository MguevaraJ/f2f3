/**
 * Waypoints in Xaero's Minimap format (verified against xaerominimap 26.5.3 for 26.3:
 * WaypointIO.saveWaypoints). JourneyMap 6 can import these files too.
 *
 * File: .minecraft/xaero/minimap/<world>/<dim%0|dim%-1|dim%1>/mw$default_1.txt
 */
export interface Waypoint {
  name: string
  x: number
  y: number
  z: number
  dimension: string
  /** Xaero colour index (WaypointColor ordinal). */
  color?: number
}

/** WaypointColor ordinals used here. */
export const XAERO_COLOR = { gold: 6, aqua: 11, red: 12, green: 10 } as const

export const XAERO_FILE = 'mw$default_1.txt'

const HEADER =
  'sets:gui.xaero_default\n#\n#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination\n#\n'

/** Xaero's folder for a dimension (MinimapDimensionHelper). */
export function xaeroDimFolder(dimension: string): string {
  if (dimension === 'minecraft:overworld') return 'dim%0'
  if (dimension === 'minecraft:the_nether') return 'dim%-1'
  if (dimension === 'minecraft:the_end') return 'dim%1'
  const [ns, path] = dimension.split(':')
  return `dim%${ns}$${(path ?? '').replace(/\//g, '%fs%')}`
}

/** Colons separate fields: Xaero stores them as "§§". */
const safe = (s: string): string =>
  s
    .replace(/:/g, '§§')
    .replace(/[\r\n]+/g, ' ')
    .trim()

const initials = (name: string): string => (name.match(/[\p{L}\p{N}]/u)?.[0] ?? 'C').toUpperCase()

export function xaeroLine(w: Waypoint): string {
  const name = safe(w.name) || 'Captura'
  return [
    'waypoint',
    name,
    safe(initials(w.name)),
    Math.floor(w.x),
    Math.floor(w.y),
    Math.floor(w.z),
    w.color ?? XAERO_COLOR.aqua,
    'false', // disabled
    0, // type: normal
    'gui.xaero_default',
    'false', // rotate_on_tp
    0, // tp_yaw
    0, // visibility_type: LOCAL
    'false' // destination
  ].join(':')
}

/** One file per dimension: { "dim%0/mw$default_1.txt": "…" }. */
export function xaeroFiles(waypoints: Waypoint[]): Record<string, string> {
  const byDim = new Map<string, string[]>()
  for (const w of waypoints) {
    const dir = xaeroDimFolder(w.dimension)
    byDim.set(dir, [...(byDim.get(dir) ?? []), xaeroLine(w)])
  }
  return Object.fromEntries(
    [...byDim].map(([dir, lines]) => [`${dir}/${XAERO_FILE}`, HEADER + lines.join('\n') + '\n'])
  )
}
