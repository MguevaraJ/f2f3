/** Top-down map view: X to the right, Z downwards (north up), like Minecraft maps. */
export interface View {
  /** World coordinates at the centre of the canvas. */
  cx: number
  cz: number
  /** Pixels per block. */
  scale: number
}

export const MIN_SCALE = 1 / 256
export const MAX_SCALE = 32

export const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

export function toScreen(v: View, w: number, h: number, x: number, z: number): [number, number] {
  return [w / 2 + (x - v.cx) * v.scale, h / 2 + (z - v.cz) * v.scale]
}

export function toWorld(v: View, w: number, h: number, sx: number, sy: number): [number, number] {
  return [v.cx + (sx - w / 2) / v.scale, v.cz + (sy - h / 2) / v.scale]
}

/** Zoom keeping the world point under the cursor in place. */
export function zoomAt(
  v: View,
  w: number,
  h: number,
  sx: number,
  sy: number,
  factor: number
): View {
  const [wx, wz] = toWorld(v, w, h, sx, sy)
  const scale = clampScale(v.scale * factor)
  return { scale, cx: wx - (sx - w / 2) / scale, cz: wz - (sy - h / 2) / scale }
}

/** Frames every point with a margin; a lone point gets a close-up. */
export function fitView(points: { x: number; z: number }[], w: number, h: number): View {
  if (!points.length) return { cx: 0, cz: 0, scale: 1 }
  const xs = points.map((p) => p.x)
  const zs = points.map((p) => p.z)
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  if (points.length === 1) return { cx: x0, cz: z0, scale: 2 }
  const scale = clampScale(
    Math.min((w - 120) / Math.max(x1 - x0, 1), (h - 120) / Math.max(z1 - z0, 1))
  )
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, scale: Math.min(scale, 4) }
}

/** A "nice" length for the scale bar: 1, 2, 5 × 10^n blocks, about `target` pixels long. */
export function scaleBar(scale: number, target = 120): { blocks: number; px: number } {
  const raw = target / scale
  const p = 10 ** Math.floor(Math.log10(raw))
  const blocks = [1, 2, 5, 10].map((m) => m * p).find((b) => b >= raw) ?? 10 * p
  const nice =
    [1, 2, 5, 10]
      .map((m) => m * p)
      .filter((b) => b <= raw)
      .pop() ?? p
  const pick = Math.abs(blocks - raw) < Math.abs(nice - raw) ? blocks : nice
  return { blocks: pick, px: pick * scale }
}

/** Nether ⇄ Overworld: 1 block in the Nether is 8 in the Overworld. */
export function convertXZ(x: number, z: number, from: string, to: string): [number, number] | null {
  if (from === to) return [x, z]
  if (from === 'minecraft:the_nether' && to === 'minecraft:overworld') return [x * 8, z * 8]
  if (from === 'minecraft:overworld' && to === 'minecraft:the_nether') return [x / 8, z / 8]
  return null
}
