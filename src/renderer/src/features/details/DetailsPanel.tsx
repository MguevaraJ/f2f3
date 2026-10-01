import { useState } from 'react'
import { BIOMES, biomeById, biomeName, DIMENSIONS, dimensionName } from '@shared/catalog/biomes'
import { MOB_CATEGORY_LABEL, mobName } from '@shared/catalog/mobs'
import { structureName } from '@shared/catalog/structures'
import { biomeHiddenInF3 } from '@shared/f3Tips'
import { nearestSlimeChunk, parseSeed } from '@shared/slime'
import { listWorlds, NO_WORLD, seedOf, worldOf } from '@shared/worlds'
import type {
  CompanionData,
  F3Data,
  InfoSource,
  LocationData,
  ScreenshotEntry
} from '@shared/types'
import { CreeperFace, Icon } from '../../components/icons'
import { McText } from '../../components/McText'
import {
  blockString,
  convertDimension,
  DIRECTION_ES,
  exactString,
  f3PlainText,
  tpCommand
} from '../../lib/coords'
import { formatBytes, formatDateTime, formatNumber, formatRelative } from '../../lib/format'
import { PROVIDER_LABEL, SOURCE_INFO } from '../../lib/sources'
import { useLocalModel } from '../../store/localModel'
import { BuildSection } from './BuildSection'
import { GameRulesBlock, ModsBlock, TechnicalSection, VillagerSection } from './TechnicalPanels'
import { Section, Rows, Row, Fact, Axis, CopyButton, CopyChip, SourceTag } from './parts'
import { useSettings } from '../../store/settings'
import { useLibrary } from '../../store/library'
import { useUi } from '../../store/ui'
import {
  analyzeWithAi,
  copyImage,
  copyText,
  deleteItems,
  openExternal,
  reanalyze,
  renameItem,
  reveal,
  setBiome,
  toggleFavorite
} from '../library/actions'
import { getLang, tr } from '@shared/i18n'

const TIME_ES: Record<string, string> = {
  day: tr('Día'),
  sunrise: tr('Amanecer'),
  sunset: tr('Atardecer'),
  night: tr('Noche'),
  underground: tr('Bajo tierra'),
  unknown: '—'
}
const WEATHER_ES: Record<string, string> = {
  clear: tr('Despejado'),
  rain: tr('Lluvia'),
  thunder: tr('Tormenta'),
  snow: tr('Nieve'),
  unknown: '—'
}

/** Everything known about one screenshot. Used in the gallery dock and in the viewer. */
export function DetailsPanel({
  shot,
  compact = false
}: {
  shot: ScreenshotEntry
  compact?: boolean
}) {
  const a = shot.analysis
  const loc = a?.location
  const openViewer = useUi((s) => s.openViewer)
  const viewerId = useUi((s) => s.viewerId)

  return (
    <div className={`details ${compact ? 'compact' : ''}`}>
      <div className="details-head">
        <div className="details-title">
          <button
            className="details-name"
            onClick={() => renameItem(shot.id)}
            title={tr('Renombrar (F2)')}
          >
            {shot.name}
            <Icon name="pencil" size={13} />
          </button>
          <div className="details-sub">
            {formatDateTime(shot.capturedAt)} · {formatRelative(shot.capturedAt)}
          </div>
          <div className="details-sub">
            {shot.width}×{shot.height} · {formatBytes(shot.size)}
            {shot.folder && ` · ${shot.folder}`}
          </div>
        </div>
        <button
          className={`icon-btn fav ${shot.meta.favorite ? 'on' : ''}`}
          onClick={() => toggleFavorite([shot.id])}
          title={tr('Favorita (F)')}
        >
          <Icon name="star" size={20} fill={shot.meta.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="details-actions">
        {!viewerId && (
          <button className="btn small primary" onClick={() => openViewer(shot.id)}>
            <Icon name="eye" size={15} /> {tr('Ver')}
          </button>
        )}
        <button
          className="btn small"
          onClick={() => void copyImage(shot.id)}
          title={tr('Copiar imagen')}
        >
          <Icon name="image" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void reveal(shot.id)}
          title={tr('Mostrar en carpeta')}
        >
          <Icon name="folderOpen" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void openExternal(shot.id)}
          title={tr('Abrir con otra aplicación')}
        >
          <Icon name="external" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void reanalyze([shot.id])}
          title={tr('Reanalizar F3')}
        >
          <Icon name="refresh" size={15} />
        </button>
        <button
          className="btn small danger"
          onClick={() => deleteItems([shot.id])}
          title={tr('Eliminar')}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>

      {!a ? (
        <div className="details-pending">
          <span className="spinner" /> {tr('Analizando captura…')}
        </div>
      ) : (
        <>
          {a.error && (
            <div className="details-error">
              {tr('No se pudo analizar:')} {a.error}
            </div>
          )}
          <SummaryChips shot={shot} />
          {a.mod && <GameSection mod={a.mod} />}
          {loc ? <LocationSections shot={shot} loc={loc} f3={a.f3} /> : <NoF3Notice />}
          {(a.f3 || a.mod) && (
            <TechnicalSection
              f3={a.f3}
              mod={a.mod ?? null}
              target={loc?.targetedBlock ?? a.f3?.targetedBlock}
            />
          )}
          {a.mod?.target.entity?.villager && <VillagerSection v={a.mod.target.entity.villager} />}
          {a.mod?.build && (
            <BuildSection
              shotId={shot.id}
              shotName={shot.name}
              build={a.mod.build}
              summary={a.build ?? null}
              mod={a.mod}
            />
          )}
          <VisionSection shot={shot} />
        </>
      )}
      <NotesSection
        key={`${shot.id}|${shot.meta.note ?? ''}|${(shot.meta.tags ?? []).join(',')}`}
        shot={shot}
      />
    </div>
  )
}

function SummaryChips({ shot }: { shot: ScreenshotEntry }) {
  const a = shot.analysis!
  const [editing, setEditing] = useState(false)
  const [legend, setLegend] = useState(false)
  const dim = a.dimension?.id
  return (
    <Section
      title={tr('Mundo')}
      icon="compass"
      action={
        <button
          className={`icon-btn legend-btn ${legend ? 'on' : ''}`}
          onClick={() => setLegend(!legend)}
          title={tr('¿De dónde sale cada dato?')}
          aria-expanded={legend}
        >
          <Icon name="info" size={15} />
        </button>
      }
    >
      {legend && <SourceLegend />}
      {biomeHiddenInF3(a) && <F3BiomeTip />}
      <div className="facts">
        <Fact label={tr('Dimensión')}>
          {dim ? (
            <span className="fact-value">
              <span className="dot" style={{ background: DIMENSIONS[dim]?.color ?? '#888' }} />
              {dimensionName(dim)}
              <SourceTag source={a.dimension!.source} />
            </span>
          ) : (
            <span className="muted">{tr('Desconocida')}</span>
          )}
        </Fact>
        <Fact label={tr('Bioma')}>
          {editing ? (
            <select
              className="input small-select"
              autoFocus
              defaultValue={a.manualBiome ?? ''}
              onBlur={() => setEditing(false)}
              onChange={(e) => {
                setEditing(false)
                void setBiome(shot.id, e.target.value || null)
              }}
            >
              <option value="">{tr('Automático')}</option>
              {BIOMES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <button
              className="fact-value link"
              onClick={() => setEditing(true)}
              title={tr('Cambiar bioma manualmente')}
            >
              {a.biome ? (
                <>
                  <span className="nowrap-pair">
                    <span
                      className="dot"
                      style={{ background: biomeById(a.biome.id)?.color ?? '#888' }}
                    />
                    {biomeName(a.biome.id)}
                  </span>
                  <SourceTag
                    source={a.biome.source}
                    confidence={a.biome.confidence}
                    vision={a.vision}
                  />
                </>
              ) : (
                <span className="muted">{tr('Sin detectar')}</span>
              )}
              <Icon name="pencil" size={12} />
            </button>
          )}
        </Fact>
        {a.biome && <CopyChip value={a.biome.id} what={tr('ID del bioma')} />}
      </div>
      <WorldFact shot={shot} />

      <div className="mobs">
        <div className="mobs-head">
          <CreeperFace size={16} /> {tr('Mobs')}
        </div>
        {a.mobs.length ? (
          <div className="chip-row">
            {a.mobs.map((m) => (
              <span
                key={m.id}
                className={`chip mob ${m.category ?? 'other'}`}
                title={`${m.id} · ${MOB_CATEGORY_LABEL[m.category ?? 'other']} · ${SOURCE_INFO[m.source].label}: ${SOURCE_INFO[m.source].hint}`}
              >
                {mobName(m.id)}
                {m.count > 1 && <b>×{m.count}</b>}
                <span className={`source-dot ${m.source}`} />
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">
            {a.vision
              ? tr('No se detectaron mobs.')
              : a.local
                ? tr('Ningún mob claro en la mira. La IA avanzada puede buscar todos los visibles.')
                : tr('Sin mobs detectados. El modelo local o la IA avanzada pueden reconocerlos.')}
          </p>
        )}
      </div>

      <div className="mobs">
        <div className="mobs-head">
          <Icon name="layers" size={15} /> {tr('Estructuras')}
        </div>
        {a.structures.length ? (
          <div className="chip-row">
            {a.structures.map((st) => (
              <span
                key={st.id}
                className="chip structure"
                title={`${st.id} · ${SOURCE_INFO[st.source].label}: ${SOURCE_INFO[st.source].hint}`}
              >
                {structureName(st.id)}
                <span className={`source-dot ${st.source}`} />
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">
            {a.vision
              ? tr('No se ve ninguna estructura.')
              : tr('Las estructuras (aldeas, templos, fortalezas…) las detecta la IA avanzada.')}
          </p>
        )}
      </div>
    </Section>
  )
}

const WORLD_SOURCE: Record<string, string> = {
  manual: tr('asignado por ti'),
  mod: tr('del mod'),
  folder: tr('por la carpeta'),
  none: ''
}

/** The world this screenshot belongs to (used by the map); editable. */
function WorldFact({ shot }: { shot: ScreenshotEntry }) {
  const [editing, setEditing] = useState(false)
  const all = useLibrary((s) => s.snapshot?.screenshots)
  const seeds = useSettings((s) => s.settings?.worldSeeds)
  const setMeta = useLibrary((s) => s.setMeta)
  const w = worldOf(shot)
  const names = editing
    ? listWorlds(all ?? [], seeds)
        .map((x) => x.name)
        .filter((n) => n !== NO_WORLD)
    : []
  const save = (value: string): void => {
    setEditing(false)
    if (value.trim() !== (shot.meta.world ?? '')) void setMeta(shot.id, { world: value.trim() })
  }
  return (
    <div className="facts world-fact">
      <Fact label={tr('Mundo')}>
        {editing ? (
          <>
            <input
              className="input small-select"
              list="f2f3-worlds"
              autoFocus
              defaultValue={shot.meta.world ?? ''}
              placeholder={w.source !== 'manual' && w.name ? w.name : tr('Nombre del mundo')}
              onBlur={(e) => save(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(e.currentTarget.value)
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <datalist id="f2f3-worlds">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        ) : (
          <button
            className="fact-value link"
            onClick={() => setEditing(true)}
            title={tr('Asignar esta captura a un mundo (vacío = automático)')}
          >
            {w.name ? (
              <>
                {w.name} <span className="muted small">{WORLD_SOURCE[w.source]}</span>
              </>
            ) : (
              <span className="muted">{tr('Sin asignar')}</span>
            )}
            <Icon name="pencil" size={12} />
          </button>
        )}
      </Fact>
    </div>
  )
}

/** Slime chunk check for Overworld screenshots when the world's seed is known. */
function SlimeRow({ shot, x, z }: { shot: ScreenshotEntry; x: number; z: number }) {
  const all = useLibrary((s) => s.snapshot?.screenshots)
  const seeds = useSettings((s) => s.settings?.worldSeeds)
  const found = seedOf(worldOf(shot).name, all ?? [shot], seeds)
  const seed = found ? parseSeed(found.seed) : null
  if (seed === null) return null
  const near = nearestSlimeChunk(seed, x, z)
  return (
    <Row
      k={tr('Chunk slime')}
      v={
        near?.distance === 0
          ? tr('Sí, estás en un chunk slime')
          : near
            ? tr(
                'No · el más cercano a {0} bloques (chunk {1}, {2})',
                Math.round(near.distance),
                near.x,
                near.z
              )
            : tr('No hay ninguno cerca')
      }
      hint={tr(
        'En los chunks slime aparecen slimes bajo Y=40 (salvo en biomas sin mobs, como el campo de champiñones)'
      )}
    />
  )
}

/** Explains the three levels right where the values are shown. */
function SourceLegend() {
  const localStatus = useLocalModel((s) => s.status)
  const settings = useSettings((s) => s.settings)
  const setTab = useUi((s) => s.setTab)
  const openViewer = useUi((s) => s.openViewer)
  const aiOn = !!settings?.visionEnabled
  const rows: { source: InfoSource; on: boolean; state: string }[] = [
    { source: 'mod', on: true, state: tr('Si tienes el mod') },
    { source: 'f3', on: true, state: tr('Siempre activo') },
    {
      source: 'local',
      on: localStatus?.state === 'ready',
      state: localStatus?.state === 'ready' ? tr('Activo') : tr('No descargado')
    },
    {
      source: 'vision',
      on: aiOn,
      state: aiOn ? PROVIDER_LABEL[settings!.visionProvider] : tr('No configurada')
    },
    { source: 'heuristic', on: true, state: tr('Último recurso') }
  ]
  return (
    <div className="legend">
      {rows.map((r) => (
        <div key={r.source} className="legend-row">
          <span className="legend-side">
            <span className={`source-tag ${r.source}`}>{SOURCE_INFO[r.source].tag}</span>
            <span className={`legend-state ${r.on ? 'on' : ''}`}>{r.state}</span>
          </span>
          <span className="legend-text">
            <b>{SOURCE_INFO[r.source].label}.</b> {SOURCE_INFO[r.source].hint}
          </span>
        </div>
      ))}
      <button
        className="btn small"
        onClick={() => {
          openViewer(null)
          setTab('settings')
        }}
      >
        <Icon name="gear" size={14} /> {tr('Configurar el análisis')}
      </button>
    </div>
  )
}

/** New debug screens hide the biome by default: tell the player how to show it. */
function F3BiomeTip() {
  const [open, setOpen] = useState(false)
  return (
    <div className="f3-tip">
      <span className="f3-badge">F3</span>
      <div>
        <button className="f3-tip-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {tr('Tu F3 no muestra el bioma ·')} <u>{open ? tr('Ocultar') : tr('Cómo activarlo')}</u>
        </button>
        <p className="muted small" hidden={!open}>
          {tr(
            'En esta versión de Minecraft viene oculto. Para que F2+F3 lo lea exacto: en el juego pulsa'
          )}{' '}
          <span className="kbd">F3</span> + <span className="kbd">F6</span>
          {tr(', busca la línea del')} <b>{tr('bioma')}</b>{' '}
          {tr('(Biome) y actívala. Haz lo mismo con la')} <b>{tr('entidad apuntada')}</b>{' '}
          {tr('para registrar el mob que miras. Para datos técnicos activa también')}{' '}
          <b>{tr('TPS')}</b>, <b>{tr('conteo de spawns')}</b> {tr('y el')}{' '}
          <b>{tr('estado del bloque apuntado')}</b>.
        </p>
      </div>
    </div>
  )
}

function LocationSections({
  shot,
  loc,
  f3
}: {
  shot: ScreenshotEntry
  loc: LocationData
  f3: F3Data | null
}) {
  const [showRaw, setShowRaw] = useState(false)
  const pos = loc.position
  const block = loc.block
  const converted = block ? convertDimension(block, loc.dimension) : null
  const tp = tpCommand(loc)
  const ocr = shot.analysis?.ocr

  return (
    <>
      <Section
        title={tr('Coordenadas')}
        icon="pin"
        accent
        action={<SourceTag source={loc.source} />}
      >
        {block && (
          <div className="xyz">
            <Axis label="X" value={pos?.x ?? block.x} />
            <Axis label="Y" value={pos?.y ?? block.y} />
            <Axis label="Z" value={pos?.z ?? block.z} />
          </div>
        )}
        <div className="copy-grid">
          {block && <CopyButton label={tr('Bloque')} value={blockString(block)} />}
          {pos && <CopyButton label={tr('XYZ exacto')} value={exactString(pos)} />}
          {tp && <CopyButton label="/tp" value={tp} title={tp} />}
          {converted && (
            <CopyButton
              label={`En ${converted.label}`}
              value={blockString(converted.pos)}
              title={`${converted.label}: ${blockString(converted.pos)}`}
            />
          )}
          {loc.chunk && <CopyButton label={tr('Chunk')} value={`${loc.chunk.x} ${loc.chunk.z}`} />}
          {loc.region && <CopyButton label={tr('Región')} value={loc.region} />}
        </div>
        {converted && (
          <p className="muted small convert-note">
            {tr('Portal equivalente en el')} {converted.label}: <b>{blockString(converted.pos)}</b>
          </p>
        )}
      </Section>

      <Section title={tr('Posición')} icon="layers">
        <Rows>
          {block && loc.dimension === 'minecraft:overworld' && (
            <SlimeRow shot={shot} x={block.x} z={block.z} />
          )}
          {pos && <Row k="XYZ" v={exactString(pos)} />}
          {block && <Row k={tr('Bloque')} v={blockString(block)} />}
          {loc.chunk && (
            <Row
              k={tr('Chunk')}
              v={`${loc.chunk.x} ${loc.chunk.y} ${loc.chunk.z}`}
              hint={tr('x, sección y, z')}
            />
          )}
          {loc.chunkRelative && (
            <Row k={tr('Dentro del chunk')} v={blockString(loc.chunkRelative)} />
          )}
          {loc.region && <Row k={tr('Archivo de región')} v={loc.region} />}
          {block && (
            <Row
              k={tr('Distancia a 0,0')}
              v={tr(
                '{0} bloques',
                Math.round(Math.hypot(block.x, block.z)).toLocaleString(getLang())
              )}
            />
          )}
        </Rows>
      </Section>

      {loc.facing && (
        <Section title={tr('Orientación')} icon="compass">
          <div className="facing">
            <Compass yaw={loc.facing.yaw} />
            <Rows>
              <Row
                k={tr('Mirando al')}
                v={DIRECTION_ES[loc.facing.direction] ?? loc.facing.direction}
              />
              {loc.facing.towards && (
                <Row
                  k={tr('Hacia')}
                  v={loc.facing.towards.replace('positive', '+').replace('negative', '−')}
                />
              )}
              {loc.facing.yaw !== undefined && (
                <Row k={tr('Yaw')} v={`${formatNumber(loc.facing.yaw, 1)}°`} />
              )}
              {loc.facing.pitch !== undefined && (
                <Row k={tr('Pitch')} v={`${formatNumber(loc.facing.pitch, 1)}°`} />
              )}
            </Rows>
          </div>
        </Section>
      )}

      {(loc.light ||
        loc.localDifficulty ||
        loc.targetedBlock ||
        loc.targetedFluid ||
        loc.targetedEntity) && (
        <Section title={tr('Entorno')} icon="eye">
          <Rows>
            {loc.light && (
              <Row
                k={tr('Luz')}
                v={`${loc.light.client ?? '—'}${loc.light.sky !== undefined ? tr(' (cielo {0}, bloque {1})', loc.light.sky, loc.light.block) : ''}`}
              />
            )}
            {loc.localDifficulty && (
              <Row
                k={tr('Dificultad local')}
                v={`${loc.localDifficulty.value} // ${loc.localDifficulty.clamped ?? '—'}`}
              />
            )}
            {loc.localDifficulty?.day !== undefined && (
              <Row k={tr('Día del mundo')} v={String(loc.localDifficulty.day)} />
            )}
            {loc.targetedBlock && (
              <Row
                k={tr('Bloque apuntado')}
                v={`${loc.targetedBlock.id ?? ''} @ ${blockString(loc.targetedBlock.pos)}`}
              />
            )}
            {loc.targetedFluid && (
              <Row
                k={tr('Fluido apuntado')}
                v={`${loc.targetedFluid.id ?? ''} @ ${blockString(loc.targetedFluid.pos)}`}
              />
            )}
            {loc.targetedEntity && <Row k={tr('Entidad apuntada')} v={loc.targetedEntity} />}
          </Rows>
        </Section>
      )}

      {f3 && (
        <>
          <Section title={tr('Sistema')} icon="gear" collapsed>
            <Rows>
              {f3.version && (
                <Row
                  k={tr('Versión')}
                  v={`${f3.version}${f3.modLoader ? ` (${f3.modLoader})` : ''}`}
                />
              )}
              {f3.fps !== undefined && <Row k="FPS" v={String(f3.fps)} />}
              {f3.java && <Row k={tr('Java')} v={f3.java} />}
              {f3.memory && <Row k={tr('Memoria')} v={f3.memory} />}
              {f3.cpu && <Row k="CPU" v={f3.cpu} />}
              {f3.gpu && <Row k="GPU" v={f3.gpu} />}
              {f3.display && <Row k={tr('Pantalla')} v={f3.display} />}
            </Rows>
          </Section>

          <Section title={tr('Todo el F3 ({0} campos)', f3.fields.length)} icon="hash" collapsed>
            <div className="raw-toolbar">
              <div className="segmented">
                <button className={!showRaw ? 'on' : ''} onClick={() => setShowRaw(false)}>
                  {tr('Campos')}
                </button>
                <button className={showRaw ? 'on' : ''} onClick={() => setShowRaw(true)}>
                  {tr('Pantalla F3')}
                </button>
              </div>
              <button
                className="btn small"
                onClick={() => void copyText(f3PlainText(f3), tr('Texto del F3'))}
              >
                <Icon name="copy" size={14} /> {tr('Copiar todo')}
              </button>
            </div>
            {showRaw ? (
              <F3Screen f3={f3} />
            ) : (
              <Rows>
                {f3.fields.map((f, i) => (
                  <Row key={`${f.key}-${i}`} k={f.key} v={f.value} />
                ))}
              </Rows>
            )}
            {ocr && (
              <p className="muted small">
                {tr('Leído con la fuente de Minecraft · escala GUI')} {ocr.guiScale}{' '}
                {tr('· precisión')} {(ocr.confidence * 100).toFixed(1)}% · {ocr.glyphs}{' '}
                {tr('caracteres en')} {ocr.durationMs} {tr('ms')}
              </p>
            )}
          </Section>
        </>
      )}
    </>
  )
}

const GAME_MODE_ES: Record<string, string> = {
  survival: tr('Supervivencia'),
  creative: tr('Creativo'),
  adventure: tr('Aventura'),
  spectator: tr('Espectador')
}

const DIFFICULTY_ES: Record<string, string> = {
  peaceful: tr('Pacífico'),
  easy: tr('Fácil'),
  normal: tr('Normal'),
  hard: tr('Difícil')
}

const WORLD_TYPE_ES: Record<CompanionData['world']['type'], string> = {
  singleplayer: tr('Un jugador'),
  multiplayer: tr('Multijugador'),
  realms: 'Realms'
}

/** Ticks → in-game clock (tick 0 is 06:00). */
function gameClock(ticks: number): string {
  const minutes = Math.floor((((ticks + 6000) % 24000) / 1000) * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** What only the Companion mod knows: world, seed, time, weather, game mode. */
function GameSection({ mod }: { mod: CompanionData }) {
  const { world } = mod
  return (
    <Section title={tr('Partida')} icon="gear" action={<SourceTag source="mod" />}>
      <Rows>
        <Row
          k={tr('Mundo')}
          v={
            world.name ? `${world.name} · ${WORLD_TYPE_ES[world.type]}` : WORLD_TYPE_ES[world.type]
          }
        />
        <Row
          k={tr('Día')}
          v={`${world.day + 1} · ${gameClock(world.timeOfDay)} (${world.timeOfDay} ticks)`}
        />
        <Row k={tr('Clima')} v={WEATHER_ES[world.weather]} />
        <Row k={tr('Modo de juego')} v={GAME_MODE_ES[mod.player.gameMode] ?? mod.player.gameMode} />
        {mod.game && (
          <>
            <Row
              k={tr('Dificultad')}
              v={`${DIFFICULTY_ES[mod.game.difficulty] ?? mod.game.difficulty}${mod.game.hardcore ? tr(' · Extremo') : ''}`}
            />
            <Row
              k={tr('Distancias')}
              v={tr(
                'Renderizado {0} · simulación {1} chunks',
                mod.game.renderDistance,
                mod.game.simulationDistance
              )}
              hint={tr(
                'La distancia de simulación decide qué chunks procesan entidades y granjas alrededor del jugador'
              )}
            />
            {mod.game.serverBrand && world.type !== 'singleplayer' && (
              <Row k={tr('Servidor')} v={mod.game.serverBrand} />
            )}
          </>
        )}
        <Row k={tr('Versión')} v={`${mod.minecraft} · mod ${mod.modVersion}`} />
      </Rows>
      {mod.gamerules && <GameRulesBlock rules={mod.gamerules} />}
      {mod.mods && mod.mods.length > 0 && <ModsBlock mods={mod.mods} />}
      {world.seed && (
        <div className="copy-grid">
          <CopyButton label={tr('Semilla')} value={world.seed} title={world.seed} />
        </div>
      )}
    </Section>
  )
}

function NoF3Notice() {
  return (
    <div className="no-f3">
      <span className="f3-badge">F3</span>
      <div>
        <strong>{tr('Captura sin F3')}</strong>
        <p className="muted small">
          {tr(
            'Sin la pantalla F3 (ni el mod F2+F3 Companion) no hay coordenadas. El bioma y los mobs se estiman con el modelo local (o con los colores si no lo tienes); la IA avanzada da el resultado más preciso.'
          )}
        </p>
      </div>
    </div>
  )
}

function VisionSection({ shot }: { shot: ScreenshotEntry }) {
  const v = shot.analysis?.vision
  const progress = useLibrary((s) => s.progress.vision)
  const running = progress?.current === shot.id
  const settings = useSettings((s) => s.settings)
  const provider = settings?.visionProvider ?? 'anthropic'
  return (
    <Section title={tr('IA avanzada')} icon="sparkles" collapsed={!v}>
      {v ? (
        <>
          <p className="vision-desc">{v.description}</p>
          <Rows>
            {v.timeOfDay && (
              <Row k={tr('Momento')} v={TIME_ES[v.timeOfDay] ?? v.timeOfDay} copy={false} />
            )}
            {v.weather && (
              <Row k={tr('Clima')} v={WEATHER_ES[v.weather] ?? v.weather} copy={false} />
            )}
            {v.biome && (
              <Row
                k={tr('Bioma según la IA')}
                v={`${biomeName(v.biome.id)} · ${Math.round(v.biome.confidence * 100)}%`}
                copy={false}
              />
            )}
          </Rows>
          <p className="muted small">
            {v.provider ? PROVIDER_LABEL[v.provider] : 'IA'} · {v.model} ·{' '}
            {formatRelative(v.analyzedAt)}
          </p>
        </>
      ) : (
        <p className="muted small">
          {tr(
            'Opcional. Con tu propio servicio de IA (Claude, Gemini, OpenAI u Ollama gratis en tu equipo) se detectan todos los mobs, las estructuras, el clima y la hora.'
          )}
        </p>
      )}
      <button
        className="btn small"
        disabled={running}
        onClick={() => void analyzeWithAi([shot.id])}
      >
        <Icon name="sparkles" size={15} />{' '}
        {running
          ? tr('Analizando…')
          : v
            ? tr('Volver a analizar')
            : settings?.visionEnabled
              ? tr('Analizar con {0}', PROVIDER_LABEL[provider])
              : tr('Configurar IA avanzada')}
      </button>
    </Section>
  )
}

function NotesSection({ shot }: { shot: ScreenshotEntry }) {
  const setMeta = useLibrary((s) => s.setMeta)
  const [note, setNote] = useState(shot.meta.note ?? '')
  const [tags, setTags] = useState((shot.meta.tags ?? []).join(', '))
  return (
    <Section title={tr('Notas')} icon="note" collapsed={!shot.meta.note && !shot.meta.tags?.length}>
      <textarea
        className="input"
        placeholder={tr('Ej.: granja de hierro, base, portal del Nether…')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (shot.meta.note ?? '') && void setMeta(shot.id, { note })}
      />
      <input
        className="input"
        placeholder={tr('Etiquetas separadas por comas')}
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        onBlur={() =>
          void setMeta(shot.id, {
            tags: tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          })
        }
      />
    </Section>
  )
}

/** The overlay re-drawn with the Minecraft font on its translucent panel. */
function F3Screen({ f3 }: { f3: F3Data }) {
  const render = (lines: string[], side: 'left' | 'right') => (
    <div className={`f3-col ${side}`}>
      {lines.map((l, i) =>
        l ? (
          <div key={i} className="f3-line">
            <McText text={l} scale={1} color="#e0e0e0" shadow={false} />
          </div>
        ) : (
          <div key={i} className="f3-gap" />
        )
      )}
    </div>
  )
  return (
    <div className="f3-screen">
      {render(f3.lines.left, 'left')}
      {render(f3.lines.right, 'right')}
    </div>
  )
}

function Compass({ yaw }: { yaw?: number }) {
  // Minecraft yaw: 0 = south, 90 = west, 180/-180 = north, -90 = east.
  const deg = yaw === undefined ? 0 : yaw + 180
  return (
    <svg className="compass" viewBox="-50 -50 100 100" aria-hidden>
      <circle r="46" className="compass-ring" />
      {['N', 'E', 'S', 'O'].map((l, i) => (
        <text
          key={l}
          x={Math.sin((i * Math.PI) / 2) * 34}
          y={-Math.cos((i * Math.PI) / 2) * 34 + 5}
          textAnchor="middle"
        >
          {l}
        </text>
      ))}
      <g transform={`rotate(${deg})`}>
        <path d="M0 -30 L7 4 L0 0 L-7 4Z" className="compass-needle" />
        <path d="M0 30 L7 -4 L0 0 L-7 -4Z" className="compass-tail" />
      </g>
    </svg>
  )
}

// ───────────── small building blocks ─────────────
