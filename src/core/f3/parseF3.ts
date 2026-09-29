import type { DebugField, F3Data, Vec3 } from '@shared/types'

export interface DebugLine {
  index: number
  side: 'left' | 'right'
  text: string
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`
const INT = String.raw`(-?\d+)`
const ID = String.raw`([a-z0-9_.-]+:[a-z0-9_/.-]+)`

const MARKERS = [
  /\bfps\b/,
  /^XYZ:/,
  /^Block:/,
  /^Chunk:/,
  /^Facing:/,
  /^Minecraft \S+ \(/,
  /^Java:/,
  /^Mem:/,
  /\bFC: \d/,
  /^Biome:/,
  /^Allocated:/
]

/** True when the recognised text really is a debug overlay (not a sign, chat, etc.). */
export function looksLikeDebugScreen(lines: DebugLine[]): boolean {
  const hits = new Set<number>()
  for (const l of lines) MARKERS.forEach((re, i) => re.test(l.text) && hits.add(i))
  return hits.size >= 2
}

const vec = (x: string, y: string, z: string): Vec3 => ({
  x: Number(x),
  y: Number(y),
  z: Number(z)
})

const GPU_RE =
  /(Radeon|GeForce|NVIDIA|RTX|GTX|Intel\(R\)|Intel Arc|Iris|UHD Graphics|Apple M\d|Adreno|Mali)/i

/**
 * Turns recognised overlay lines into structured data. Tolerant by design: every
 * field is optional and the raw lines are kept, so a mod that rearranges the
 * overlay still yields whatever can be understood.
 */
export function parseF3(lines: DebugLine[]): F3Data {
  const data: F3Data = { fields: [], lines: { left: [], right: [] } }
  const bySide = { left: [] as DebugLine[], right: [] as DebugLine[] }
  for (const l of [...lines].sort((a, b) => a.index - b.index)) bySide[l.side].push(l)

  for (const side of ['left', 'right'] as const) {
    const out = data.lines[side]
    let last = -1
    for (const l of bySide[side]) {
      // Preserve blank separator lines so the overlay can be re-rendered faithfully.
      for (let i = last + 1; last >= 0 && i < l.index; i++) out.push('')
      out.push(l.text)
      last = l.index
    }
  }

  const all = [...bySide.left, ...bySide.right]
  const next = (l: DebugLine): string | undefined =>
    bySide[l.side].find((o) => o.index === l.index + 1)?.text

  // When the right column overlaps the XYZ line, x and y may still be readable.
  let partialXY: { x: number; y: number } | null = null
  for (const l of all) {
    const t = l.text
    let m: RegExpExecArray | null

    if ((m = /^Minecraft (\S+) \((.+?)\)/.exec(t))) {
      data.version = m[1]
      const loader = m[2].split('/').pop()
      if (loader && loader !== m[1]) data.modLoader = loader
    }
    if ((m = /^(\d+) fps\b/.exec(t))) data.fps = Number(m[1])
    if ((m = new RegExp(`^XYZ: ${NUM} / ${NUM} / ${NUM}`).exec(t)))
      data.position = vec(m[1], m[2], m[3])
    else if ((m = new RegExp(`^XYZ: ${NUM} / ${NUM}`).exec(t)))
      partialXY = { x: Number(m[1]), y: Number(m[2]) }
    if ((m = new RegExp(`^Block: ${INT} ${INT} ${INT}(?: \\[${INT} ${INT} ${INT}\\])?`).exec(t))) {
      data.block = vec(m[1], m[2], m[3])
      if (m[4] !== undefined) data.chunkRelative = vec(m[4], m[5], m[6])
    }
    if (
      (m = new RegExp(
        `^Chunk: ${INT} ${INT} ${INT}(?: \\[${INT} ${INT} in (r\\.-?\\d+\\.-?\\d+\\.mca)\\])?`
      ).exec(t))
    ) {
      data.chunk = vec(m[1], m[2], m[3])
      if (m[6]) data.region = m[6]
    }
    if ((m = new RegExp(`^Section-relative: ${INT} ${INT} ${INT}`).exec(t)))
      data.chunkRelative = vec(m[1], m[2], m[3])
    if ((m = /^Facing: (\w+)(?: \(Towards ([^)]+)\))?(?: \(([^)]+)\))?/.exec(t))) {
      const angles = (m[3] ?? '').split('/').map((s) => Number(s.trim()))
      data.facing = {
        direction: m[1],
        towards: m[2],
        yaw: Number.isFinite(angles[0]) && m[3] ? angles[0] : undefined,
        pitch: Number.isFinite(angles[1]) ? angles[1] : undefined
      }
    }
    if ((m = new RegExp(`^${ID} FC: `).exec(t))) data.dimension = m[1]
    if ((m = new RegExp(`^Biome: ${ID}`).exec(t))) data.biome = m[1]
    if ((m = /^(?:Client )?Light: (\d+)(?: \((\d+) sky, (\d+) block\))?/.exec(t)))
      data.light = {
        client: Number(m[1]),
        sky: m[2] ? Number(m[2]) : undefined,
        block: m[3] ? Number(m[3]) : undefined
      }
    if ((m = new RegExp(`^Local Difficulty: ${NUM}(?: // ${NUM})?(?: \\(Day ${INT}\\))?`).exec(t)))
      data.localDifficulty = {
        value: Number(m[1]),
        clamped: m[2] ? Number(m[2]) : undefined,
        day: m[3] ? Number(m[3]) : undefined
      }
    if ((m = new RegExp(`^Targeted Block: ${INT}, ${INT}, ${INT}`).exec(t)))
      data.targetedBlock = { pos: vec(m[1], m[2], m[3]), id: matchId(next(l)) }
    if ((m = new RegExp(`^Targeted Fluid: ${INT}, ${INT}, ${INT}`).exec(t)))
      data.targetedFluid = { pos: vec(m[1], m[2], m[3]), id: matchId(next(l)) }
    if (/^Targeted Entity/.test(t))
      data.targetedEntity = matchId(next(l)) ?? matchId(t.split(':').slice(1).join(':').trim())
    if ((m = /^Java: (.+)/.exec(t))) data.java = m[1]
    if ((m = /^Mem: +(.+)/.exec(t))) data.memory = m[1].trim()
    if ((m = /^CPU: (.+)/.exec(t))) data.cpu = m[1]
    if ((m = /^Display: (.+)/.exec(t))) data.display = m[1]
    if (!data.gpu && l.side === 'right' && GPU_RE.test(t) && !t.startsWith('CPU')) data.gpu = t
  }

  // Overlapping columns can clip the XYZ line; the block position is a safe fallback.
  if (!data.position && data.block)
    data.position =
      partialXY &&
      Math.floor(partialXY.x) === data.block.x &&
      Math.floor(partialXY.y) === data.block.y
        ? { ...partialXY, z: data.block.z }
        : { ...data.block }
  if (!data.block && data.position)
    data.block = {
      x: Math.floor(data.position.x),
      y: Math.floor(data.position.y),
      z: Math.floor(data.position.z)
    }
  if (!data.chunk && data.block)
    data.chunk = { x: data.block.x >> 4, y: data.block.y >> 4, z: data.block.z >> 4 }
  if (!data.region && data.chunk) data.region = `r.${data.chunk.x >> 5}.${data.chunk.z >> 5}.mca`

  data.fields = extractFields(all)
  return data
}

function matchId(text: string | undefined): string | undefined {
  return text ? new RegExp(ID).exec(text)?.[1] : undefined
}

function extractFields(lines: DebugLine[]): DebugField[] {
  const fields: DebugField[] = []
  for (const l of lines) {
    const m = /^([A-Za-z][\w\s\-[\]().]{0,32}?): +(.+)$/.exec(l.text)
    if (m) fields.push({ key: m[1].trim(), value: m[2].trim(), side: l.side })
  }
  return fields
}
