import { toScreen, toWorld, type View } from './view'

export interface DrawPoint {
  id: string
  x: number
  z: number
  /** Converted from the other dimension (Nether ⇄ Overworld overlay). */
  overlay: boolean
  favorite: boolean
}

export interface DrawOptions {
  view: View
  width: number
  height: number
  dimension: string
  points: DrawPoint[]
  hovered: string | null
  grid: boolean
  slime: ((cx: number, cz: number) => boolean) | null
  measure: [number, number][]
  /** Planner overlays (AFK, portals) in world coordinates. */
  shapes: Shape[]
}

export type Shape =
  | {
      kind: 'rect'
      x0: number
      z0: number
      x1: number
      z1: number
      stroke: string
      fill?: string
      dash?: boolean
    }
  | {
      kind: 'circle'
      x: number
      z: number
      r: number
      stroke: string
      fill?: string
      dash?: boolean
    }
  | { kind: 'marker'; x: number; z: number; color: string; label?: string }

const BG: Record<string, string> = {
  'minecraft:overworld': '#17221a',
  'minecraft:the_nether': '#261515',
  'minecraft:the_end': '#1d1b2c'
}
const POINT: Record<string, string> = {
  'minecraft:overworld': '#6ee08a',
  'minecraft:the_nether': '#ff7a5c',
  'minecraft:the_end': '#c9a6ff'
}

/** Chunks drawn one by one only while they are big enough to see. */
const MAX_SLIME_CHUNKS = 60_000

export function drawMap(ctx: CanvasRenderingContext2D, o: DrawOptions): { slimeHidden: boolean } {
  const { view: v, width: w, height: h } = o
  ctx.fillStyle = BG[o.dimension] ?? '#1c1c1c'
  ctx.fillRect(0, 0, w, h)

  const [wx0, wz0] = toWorld(v, w, h, 0, 0)
  const [wx1, wz1] = toWorld(v, w, h, w, h)
  const chunkPx = 16 * v.scale

  // Slime chunks (Overworld only).
  let slimeHidden = false
  if (o.slime) {
    const cx0 = Math.floor(wx0 / 16)
    const cx1 = Math.floor(wx1 / 16)
    const cz0 = Math.floor(wz0 / 16)
    const cz1 = Math.floor(wz1 / 16)
    if (chunkPx < 3 || (cx1 - cx0 + 1) * (cz1 - cz0 + 1) > MAX_SLIME_CHUNKS) slimeHidden = true
    else {
      ctx.fillStyle = 'rgba(110, 224, 110, 0.28)'
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cz = cz0; cz <= cz1; cz++)
          if (o.slime(cx, cz)) {
            const [sx, sy] = toScreen(v, w, h, cx * 16, cz * 16)
            ctx.fillRect(sx, sy, chunkPx, chunkPx)
          }
    }
  }

  // Chunk (16) and region (512) grid, plus the 0,0 axes.
  const lines = (step: number, style: string): void => {
    ctx.strokeStyle = style
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) {
      const [sx] = toScreen(v, w, h, x, 0)
      ctx.moveTo(Math.round(sx) + 0.5, 0)
      ctx.lineTo(Math.round(sx) + 0.5, h)
    }
    for (let z = Math.floor(wz0 / step) * step; z <= wz1; z += step) {
      const [, sy] = toScreen(v, w, h, 0, z)
      ctx.moveTo(0, Math.round(sy) + 0.5)
      ctx.lineTo(w, Math.round(sy) + 0.5)
    }
    ctx.stroke()
  }
  if (o.grid) {
    if (chunkPx >= 8) lines(16, 'rgba(255,255,255,0.06)')
    if (512 * v.scale >= 24) lines(512, 'rgba(255,255,255,0.16)')
  }
  const [ox, oy] = toScreen(v, w, h, 0, 0)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(Math.round(ox) + 0.5, 0)
  ctx.lineTo(Math.round(ox) + 0.5, h)
  ctx.moveTo(0, Math.round(oy) + 0.5)
  ctx.lineTo(w, Math.round(oy) + 0.5)
  ctx.stroke()
  ctx.setLineDash([])

  const areas = o.shapes.filter((sh) => sh.kind !== 'marker')
  for (const sh of areas) {
    ctx.beginPath()
    if (sh.kind === 'rect') {
      const [sx0, sy0] = toScreen(v, w, h, sh.x0, sh.z0)
      const [sx1, sy1] = toScreen(v, w, h, sh.x1, sh.z1)
      ctx.rect(sx0, sy0, sx1 - sx0, sy1 - sy0)
    } else {
      const [sx, sy] = toScreen(v, w, h, sh.x, sh.z)
      ctx.arc(sx, sy, sh.r * v.scale, 0, Math.PI * 2)
    }
    if (sh.fill) {
      ctx.fillStyle = sh.fill
      ctx.fill()
    }
    ctx.strokeStyle = sh.stroke
    ctx.lineWidth = 1.5
    ctx.setLineDash(sh.dash ? [6, 4] : [])
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Screenshots: overlays (other dimension) first, hollow; the hovered one last.
  const color = POINT[o.dimension] ?? '#e0e0e0'
  const other =
    o.dimension === 'minecraft:overworld'
      ? POINT['minecraft:the_nether']
      : POINT['minecraft:overworld']
  const sorted = [...o.points].sort(
    (a, b) =>
      Number(b.overlay) - Number(a.overlay) ||
      Number(a.id === o.hovered) - Number(b.id === o.hovered)
  )
  for (const p of sorted) {
    const [sx, sy] = toScreen(v, w, h, p.x, p.z)
    if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue
    const hot = p.id === o.hovered
    ctx.beginPath()
    ctx.arc(sx, sy, hot ? 7 : 5, 0, Math.PI * 2)
    if (p.overlay) {
      ctx.strokeStyle = other
      ctx.lineWidth = 2
      ctx.stroke()
    } else {
      ctx.fillStyle = p.favorite ? '#ffd24a' : color
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    if (hot) {
      ctx.beginPath()
      ctx.arc(sx, sy, 11, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  // Planner markers: diamonds with a label.
  ctx.font = '600 12px system-ui, sans-serif'
  for (const sh of o.shapes) {
    if (sh.kind !== 'marker') continue
    const [sx, sy] = toScreen(v, w, h, sh.x, sh.z)
    ctx.beginPath()
    ctx.moveTo(sx, sy - 8)
    ctx.lineTo(sx + 8, sy)
    ctx.lineTo(sx, sy + 8)
    ctx.lineTo(sx - 8, sy)
    ctx.closePath()
    ctx.fillStyle = sh.color
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    if (sh.label) {
      ctx.lineWidth = 3
      ctx.strokeText(sh.label, sx + 11, sy + 4)
      ctx.fillStyle = '#fff'
      ctx.fillText(sh.label, sx + 11, sy + 4)
    }
  }

  // Measuring tape.
  if (o.measure.length) {
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    o.measure.forEach(([x, z], i) => {
      const [sx, sy] = toScreen(v, w, h, x, z)
      if (i) ctx.lineTo(sx, sy)
      else ctx.moveTo(sx, sy)
    })
    ctx.stroke()
    ctx.setLineDash([])
    for (const [x, z] of o.measure) {
      const [sx, sy] = toScreen(v, w, h, x, z)
      ctx.beginPath()
      ctx.arc(sx, sy, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return { slimeHidden }
}

/** The point under the cursor, if any (within `radius` pixels). */
export function hitTest(
  points: DrawPoint[],
  v: View,
  w: number,
  h: number,
  sx: number,
  sy: number,
  radius = 9
): DrawPoint | null {
  let best: DrawPoint | null = null
  let bestD = radius
  for (const p of points) {
    const [px, py] = toScreen(v, w, h, p.x, p.z)
    const d = Math.hypot(px - sx, py - sy)
    // Real points win over overlays at the same spot.
    if (d < bestD || (best?.overlay && !p.overlay && d <= radius)) {
      best = p
      bestD = d
    }
  }
  return best
}
