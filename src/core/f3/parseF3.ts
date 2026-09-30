import type {
  DebugField,
  F3Data,
  SpawnCategory,
  SpawnCounts,
  TargetedBlock,
  Vec3
} from '@shared/types'

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
  /^Allocated:/,
  /^Integrated server @/,
  /^SC: \d+,/,
  /^Day #\d+$/
]

/** MobCategory order, which the "SC:" line follows (labels changed between versions). */
const SPAWN_CATEGORIES: SpawnCategory[] = [
  'monster',
  'creature',
  'ambient',
  'axolotls',
  'underground_water_creature',
  'water_creature',
  'water_ambient',
  'misc'
]
const SPAWN_LABELS: Record<string, SpawnCategory> = {
  MO: 'monster',
  C: 'creature',
  AM: 'ambient',
  AX: 'axolotls',
  UWC: 'underground_water_creature',
  WC: 'water_creature',
  WA: 'water_ambient',
  MI: 'misc'
}

function parseSpawnCounts(chunks: string, rest: string): SpawnCounts {
  const pairs = [...rest.matchAll(/(\w+): (\d+)/g)]
  const counts: SpawnCounts['counts'] = {}
  pairs.forEach((p, i) => {
    const cat = pairs.length === SPAWN_CATEGORIES.length ? SPAWN_CATEGORIES[i] : SPAWN_LABELS[p[1]]
    if (cat) counts[cat] = Number(p[2])
  })
  return { chunks: Number(chunks), counts }
}

const pairsOf = (text: string): Record<string, number> =>
  Object.fromEntries([...text.matchAll(/(\w+): (-?\d+)/g)].map((p) => [p[1], Number(p[2])]))

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
  const at = (side: DebugLine['side'], index: number): string | undefined =>
    bySide[side].find((o) => o.index === index)?.text
  const next = (l: DebugLine): string | undefined => at(l.side, l.index + 1)

  /** "Targeted Block: x, y, z", then the id, its state properties and its tags. */
  const target = (l: DebugLine, pos: Vec3): TargetedBlock => {
    const out: TargetedBlock = { pos, id: matchId(next(l)) }
    for (let i = l.index + 2; ; i++) {
      const t = at(l.side, i)
      let m: RegExpExecArray | null
      if (t === undefined) break
      if ((m = /^([a-z0-9_]+): ([a-z0-9_.-]+)$/.exec(t))) (out.state ??= {})[m[1]] = m[2]
      else if (t.startsWith('#')) {
        // Background pixels can smear the end of a line: keep only clean tags.
        if ((m = new RegExp(`^#${ID}$`).exec(t))) (out.tags ??= []).push(m[1])
      } else break
    }
    return out
  }

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
      data.targetedBlock = target(l, vec(m[1], m[2], m[3]))
    if ((m = new RegExp(`^Targeted Fluid: ${INT}, ${INT}, ${INT}`).exec(t)))
      data.targetedFluid = target(l, vec(m[1], m[2], m[3]))
    if (
      (m = new RegExp(
        `^Integrated server @ ${NUM}/${NUM} ms(?: \\((frozen - stepping|frozen|sprinting)\\))?`
      ).exec(t))
    )
      data.server = {
        mspt: Number(m[1]),
        targetMs: Number(m[2]),
        tickState: m[3]
          ? m[3] === 'frozen - stepping'
            ? 'stepping'
            : (m[3] as 'frozen')
          : undefined
      }
    else if ((m = /^"(.+)" server\b/.exec(t))) data.server = { brand: m[1] }
    if ((m = /^SC: (\d+), (.+)/.exec(t))) data.spawnCounts = parseSpawnCounts(m[1], m[2])
    if ((m = /^Day #(\d+)$/.exec(t))) data.day = Number(m[1])
    if ((m = new RegExp(`^Speed: ${NUM} blocks/tick`).exec(t))) data.speed = Number(m[1])
    if ((m = /^(CH|SH) (\w+: -?\d+.*)/.exec(t)))
      (data.heightmaps ??= {})[m[1] === 'CH' ? 'client' : 'server'] = pairsOf(m[2])
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
