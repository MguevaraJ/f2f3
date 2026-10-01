import { biomeName, dimensionName, prettifyId } from './catalog/biomes'
import { mobName } from './catalog/mobs'
import { structureName } from './catalog/structures'
import type { InfoSource, ScreenshotEntry, Vec3 } from './types'
import { worldOf } from './worlds'
import { tr } from './i18n'

/**
 * What the app knows about each screenshot, written for the Companion mod's in-game
 * gallery ("<game dir>/f2f3/app-index.json"). The rows are already worded (Spanish
 * names, sources), so the mod only lays them out. Pure.
 */

export interface GameIndexSection {
  title: string
  /** [label, value] */
  rows: [string, string][]
}

export interface GameIndexShot {
  world: string
  dimension?: string
  block?: Vec3
  favorite?: boolean
  note?: string
  tags?: string[]
  sections: GameIndexSection[]
}

export interface GameIndex {
  format: 'f2f3-app-index'
  schema: 1
  /** By screenshot id: its path relative to the screenshots folder. */
  shots: Record<string, GameIndexShot>
}

const SOURCE_TAG: Record<InfoSource, string> = {
  manual: tr('Manual'),
  mod: 'Mod',
  f3: 'F3',
  vision: 'IA',
  local: tr('Modelo local'),
  heuristic: tr('Estimado')
}

const WEATHER: Record<string, string> = {
  clear: tr('Despejado'),
  rain: tr('Lluvia'),
  thunder: tr('Tormenta')
}
const GAME_MODE: Record<string, string> = {
  survival: tr('Supervivencia'),
  creative: tr('Creativo'),
  adventure: tr('Aventura'),
  spectator: tr('Espectador')
}
const DIFFICULTY: Record<string, string> = {
  peaceful: tr('Pacífico'),
  easy: tr('Fácil'),
  normal: tr('Normal'),
  hard: tr('Difícil')
}
const FACING: Record<string, string> = {
  north: tr('Norte'),
  south: tr('Sur'),
  east: tr('Este'),
  west: tr('Oeste')
}

/** Ticks of the day → "14:30" (0 ticks = 06:00). */
export function gameClock(ticks: number): string {
  const minutes = Math.floor((((ticks + 6000) % 24000) * 60) / 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

const tagged = (value: string, source: InfoSource): string => `${value} (${SOURCE_TAG[source]})`

function sectionsOf(e: ScreenshotEntry): GameIndexSection[] {
  const a = e.analysis
  if (!a) return []
  const out: GameIndexSection[] = []
  const push = (
    title: string,
    rows: ([string, string] | null | undefined | false | '')[]
  ): void => {
    const kept = rows.filter((r): r is [string, string] => !!r && !!r[1])
    if (kept.length) out.push({ title, rows: kept })
  }
  const loc = a.location
  const world = worldOf(e).name

  push(tr('Ubicación'), [
    world && [tr('Mundo'), world],
    a.dimension && [tr('Dimensión'), tagged(dimensionName(a.dimension.id), a.dimension.source)],
    loc?.block && [tr('Coordenadas'), `${loc.block.x} ${loc.block.y} ${loc.block.z}`],
    loc?.chunk && ['Chunk', `${loc.chunk.x} ${loc.chunk.z}`],
    loc?.facing?.direction && [
      tr('Mirando al'),
      FACING[loc.facing.direction] ?? loc.facing.direction
    ],
    a.biome && [tr('Bioma'), tagged(biomeName(a.biome.id), a.biome.source)],
    loc?.light && [tr('Luz'), tr('cielo {0} · bloque {1}', loc.light.sky, loc.light.block)]
  ])

  const mod = a.mod
  if (mod) {
    push(tr('Partida'), [
      [tr('Día'), `${mod.world.day + 1} · ${gameClock(mod.world.timeOfDay)}`],
      [tr('Clima'), WEATHER[mod.world.weather] ?? mod.world.weather],
      [tr('Modo'), GAME_MODE[mod.player.gameMode] ?? mod.player.gameMode],
      mod.game?.difficulty && [
        tr('Dificultad'),
        DIFFICULTY[mod.game.difficulty] ?? mod.game.difficulty
      ],
      mod.world.seed && [tr('Semilla'), mod.world.seed]
    ])
    const target = mod.target.block
    push(tr('Apuntando a'), [
      target && [tr('Bloque'), prettifyId(target.id)],
      target && [tr('Posición'), `${target.pos.x} ${target.pos.y} ${target.pos.z}`],
      mod.target.entity && [tr('Entidad'), mobName(mod.target.entity.id)]
    ])
  }

  if (a.mobs.length)
    push(
      tr('Mobs'),
      a.mobs.map((m) => [mobName(m.id), `×${m.count}`])
    )
  if (a.structures.length)
    push(
      tr('Estructuras'),
      a.structures.map((s) => [structureName(s.id), SOURCE_TAG[s.source]])
    )

  if (a.build) {
    const { size, blocks, materials } = a.build
    push('Build', [
      [tr('Tamaño'), `${size.x}×${size.y}×${size.z}`],
      [tr('Bloques'), String(blocks)],
      ...materials.slice(0, 8).map((m): [string, string] => [prettifyId(m.id), `×${m.count}`])
    ])
  }
  return out
}

export function buildGameIndex(entries: ScreenshotEntry[]): GameIndex {
  const shots: Record<string, GameIndexShot> = {}
  for (const e of entries) {
    const a = e.analysis
    const shot: GameIndexShot = { world: worldOf(e).name, sections: sectionsOf(e) }
    const dimension = a?.dimension?.id ?? a?.location?.dimension
    if (dimension) shot.dimension = dimension
    if (a?.location?.block) shot.block = a.location.block
    if (e.meta.favorite) shot.favorite = true
    if (e.meta.note) shot.note = e.meta.note
    if (e.meta.tags?.length) shot.tags = e.meta.tags
    shots[e.id] = shot
  }
  return { format: 'f2f3-app-index', schema: 1, shots }
}
