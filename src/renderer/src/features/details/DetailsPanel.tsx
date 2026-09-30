import { useState, type ReactNode } from 'react'
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
  ScreenshotEntry,
  VisionResult
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
import {
  blockStateString,
  capRows,
  HEIGHTMAP_LABEL,
  setblockCommand,
  tickInfo
} from '../../lib/technical'
import { useLocalModel } from '../../store/localModel'
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

const TIME_ES: Record<string, string> = {
  day: 'Día',
  sunrise: 'Amanecer',
  sunset: 'Atardecer',
  night: 'Noche',
  underground: 'Bajo tierra',
  unknown: '—'
}
const WEATHER_ES: Record<string, string> = {
  clear: 'Despejado',
  rain: 'Lluvia',
  thunder: 'Tormenta',
  snow: 'Nieve',
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
            title="Renombrar (F2)"
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
          title="Favorita (F)"
        >
          <Icon name="star" size={20} fill={shot.meta.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="details-actions">
        {!viewerId && (
          <button className="btn small primary" onClick={() => openViewer(shot.id)}>
            <Icon name="eye" size={15} /> Ver
          </button>
        )}
        <button className="btn small" onClick={() => void copyImage(shot.id)} title="Copiar imagen">
          <Icon name="image" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void reveal(shot.id)}
          title="Mostrar en carpeta"
        >
          <Icon name="folderOpen" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void openExternal(shot.id)}
          title="Abrir con otra aplicación"
        >
          <Icon name="external" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void reanalyze([shot.id])}
          title="Reanalizar F3"
        >
          <Icon name="refresh" size={15} />
        </button>
        <button
          className="btn small danger"
          onClick={() => deleteItems([shot.id])}
          title="Eliminar"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>

      {!a ? (
        <div className="details-pending">
          <span className="spinner" /> Analizando captura…
        </div>
      ) : (
        <>
          {a.error && <div className="details-error">No se pudo analizar: {a.error}</div>}
          <SummaryChips shot={shot} />
          {a.mod && <GameSection mod={a.mod} />}
          {loc ? <LocationSections shot={shot} loc={loc} f3={a.f3} /> : <NoF3Notice />}
          {a.f3 && <TechnicalSection f3={a.f3} target={loc?.targetedBlock ?? a.f3.targetedBlock} />}
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
      title="Mundo"
      icon="compass"
      action={
        <button
          className={`icon-btn legend-btn ${legend ? 'on' : ''}`}
          onClick={() => setLegend(!legend)}
          title="¿De dónde sale cada dato?"
          aria-expanded={legend}
        >
          <Icon name="info" size={15} />
        </button>
      }
    >
      {legend && <SourceLegend />}
      {biomeHiddenInF3(a) && <F3BiomeTip />}
      <div className="facts">
        <Fact label="Dimensión">
          {dim ? (
            <span className="fact-value">
              <span className="dot" style={{ background: DIMENSIONS[dim]?.color ?? '#888' }} />
              {dimensionName(dim)}
              <SourceTag source={a.dimension!.source} />
            </span>
          ) : (
            <span className="muted">Desconocida</span>
          )}
        </Fact>
        <Fact label="Bioma">
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
              <option value="">Automático</option>
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
              title="Cambiar bioma manualmente"
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
                <span className="muted">Sin detectar</span>
              )}
              <Icon name="pencil" size={12} />
            </button>
          )}
        </Fact>
        {a.biome && <CopyChip value={a.biome.id} what="ID del bioma" />}
      </div>
      <WorldFact shot={shot} />

      <div className="mobs">
        <div className="mobs-head">
          <CreeperFace size={16} /> Mobs
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
              ? 'No se detectaron mobs.'
              : a.local
                ? 'Ningún mob claro en la mira. La IA avanzada puede buscar todos los visibles.'
                : 'Sin mobs detectados. El modelo local o la IA avanzada pueden reconocerlos.'}
          </p>
        )}
      </div>

      <div className="mobs">
        <div className="mobs-head">
          <Icon name="layers" size={15} /> Estructuras
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
              ? 'No se ve ninguna estructura.'
              : 'Las estructuras (aldeas, templos, fortalezas…) las detecta la IA avanzada.'}
          </p>
        )}
      </div>
    </Section>
  )
}

const WORLD_SOURCE: Record<string, string> = {
  manual: 'asignado por ti',
  mod: 'del mod',
  folder: 'por la carpeta',
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
      <Fact label="Mundo">
        {editing ? (
          <>
            <input
              className="input small-select"
              list="craftshot-worlds"
              autoFocus
              defaultValue={shot.meta.world ?? ''}
              placeholder={w.source !== 'manual' && w.name ? w.name : 'Nombre del mundo'}
              onBlur={(e) => save(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(e.currentTarget.value)
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <datalist id="craftshot-worlds">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        ) : (
          <button
            className="fact-value link"
            onClick={() => setEditing(true)}
            title="Asignar esta captura a un mundo (vacío = automático)"
          >
            {w.name ? (
              <>
                {w.name} <span className="muted small">{WORLD_SOURCE[w.source]}</span>
              </>
            ) : (
              <span className="muted">Sin asignar</span>
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
      k="Chunk slime"
      v={
        near?.distance === 0
          ? 'Sí, estás en un chunk slime'
          : near
            ? `No · el más cercano a ${Math.round(near.distance)} bloques (chunk ${near.x}, ${near.z})`
            : 'No hay ninguno cerca'
      }
      hint="En los chunks slime aparecen slimes bajo Y=40 (salvo en biomas sin mobs, como el campo de champiñones)"
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
    { source: 'mod', on: true, state: 'Si tienes el mod' },
    { source: 'f3', on: true, state: 'Siempre activo' },
    {
      source: 'local',
      on: localStatus?.state === 'ready',
      state: localStatus?.state === 'ready' ? 'Activo' : 'No descargado'
    },
    {
      source: 'vision',
      on: aiOn,
      state: aiOn ? PROVIDER_LABEL[settings!.visionProvider] : 'No configurada'
    },
    { source: 'heuristic', on: true, state: 'Último recurso' }
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
        <Icon name="gear" size={14} /> Configurar el análisis
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
          Tu F3 no muestra el bioma · <u>{open ? 'Ocultar' : 'Cómo activarlo'}</u>
        </button>
        <p className="muted small" hidden={!open}>
          En esta versión de Minecraft viene oculto. Para que Craftshot lo lea exacto: en el juego
          pulsa <span className="kbd">F3</span> + <span className="kbd">F6</span>, busca la línea
          del <b>bioma</b> (Biome) y actívala. Haz lo mismo con la <b>entidad apuntada</b> para
          registrar el mob que miras. Para datos técnicos activa también <b>TPS</b>,{' '}
          <b>conteo de spawns</b> y el <b>estado del bloque apuntado</b>.
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
      <Section title="Coordenadas" icon="pin" accent action={<SourceTag source={loc.source} />}>
        {block && (
          <div className="xyz">
            <Axis label="X" value={pos?.x ?? block.x} />
            <Axis label="Y" value={pos?.y ?? block.y} />
            <Axis label="Z" value={pos?.z ?? block.z} />
          </div>
        )}
        <div className="copy-grid">
          {block && <CopyButton label="Bloque" value={blockString(block)} />}
          {pos && <CopyButton label="XYZ exacto" value={exactString(pos)} />}
          {tp && <CopyButton label="/tp" value={tp} title={tp} />}
          {converted && (
            <CopyButton
              label={`En ${converted.label}`}
              value={blockString(converted.pos)}
              title={`${converted.label}: ${blockString(converted.pos)}`}
            />
          )}
          {loc.chunk && <CopyButton label="Chunk" value={`${loc.chunk.x} ${loc.chunk.z}`} />}
          {loc.region && <CopyButton label="Región" value={loc.region} />}
        </div>
        {converted && (
          <p className="muted small convert-note">
            Portal equivalente en el {converted.label}: <b>{blockString(converted.pos)}</b>
          </p>
        )}
      </Section>

      <Section title="Posición" icon="layers">
        <Rows>
          {block && loc.dimension === 'minecraft:overworld' && (
            <SlimeRow shot={shot} x={block.x} z={block.z} />
          )}
          {pos && <Row k="XYZ" v={exactString(pos)} />}
          {block && <Row k="Bloque" v={blockString(block)} />}
          {loc.chunk && (
            <Row
              k="Chunk"
              v={`${loc.chunk.x} ${loc.chunk.y} ${loc.chunk.z}`}
              hint="x, sección y, z"
            />
          )}
          {loc.chunkRelative && <Row k="Dentro del chunk" v={blockString(loc.chunkRelative)} />}
          {loc.region && <Row k="Archivo de región" v={loc.region} />}
          {block && (
            <Row
              k="Distancia a 0,0"
              v={`${Math.round(Math.hypot(block.x, block.z)).toLocaleString('es')} bloques`}
            />
          )}
        </Rows>
      </Section>

      {loc.facing && (
        <Section title="Orientación" icon="compass">
          <div className="facing">
            <Compass yaw={loc.facing.yaw} />
            <Rows>
              <Row k="Mirando al" v={DIRECTION_ES[loc.facing.direction] ?? loc.facing.direction} />
              {loc.facing.towards && (
                <Row
                  k="Hacia"
                  v={loc.facing.towards.replace('positive', '+').replace('negative', '−')}
                />
              )}
              {loc.facing.yaw !== undefined && (
                <Row k="Yaw" v={`${formatNumber(loc.facing.yaw, 1)}°`} />
              )}
              {loc.facing.pitch !== undefined && (
                <Row k="Pitch" v={`${formatNumber(loc.facing.pitch, 1)}°`} />
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
        <Section title="Entorno" icon="eye">
          <Rows>
            {loc.light && (
              <Row
                k="Luz"
                v={`${loc.light.client ?? '—'}${loc.light.sky !== undefined ? ` (cielo ${loc.light.sky}, bloque ${loc.light.block})` : ''}`}
              />
            )}
            {loc.localDifficulty && (
              <Row
                k="Dificultad local"
                v={`${loc.localDifficulty.value} // ${loc.localDifficulty.clamped ?? '—'}`}
              />
            )}
            {loc.localDifficulty?.day !== undefined && (
              <Row k="Día del mundo" v={String(loc.localDifficulty.day)} />
            )}
            {loc.targetedBlock && (
              <Row
                k="Bloque apuntado"
                v={`${loc.targetedBlock.id ?? ''} @ ${blockString(loc.targetedBlock.pos)}`}
              />
            )}
            {loc.targetedFluid && (
              <Row
                k="Fluido apuntado"
                v={`${loc.targetedFluid.id ?? ''} @ ${blockString(loc.targetedFluid.pos)}`}
              />
            )}
            {loc.targetedEntity && <Row k="Entidad apuntada" v={loc.targetedEntity} />}
          </Rows>
        </Section>
      )}

      {f3 && (
        <>
          <Section title="Sistema" icon="gear" collapsed>
            <Rows>
              {f3.version && (
                <Row k="Versión" v={`${f3.version}${f3.modLoader ? ` (${f3.modLoader})` : ''}`} />
              )}
              {f3.fps !== undefined && <Row k="FPS" v={String(f3.fps)} />}
              {f3.java && <Row k="Java" v={f3.java} />}
              {f3.memory && <Row k="Memoria" v={f3.memory} />}
              {f3.cpu && <Row k="CPU" v={f3.cpu} />}
              {f3.gpu && <Row k="GPU" v={f3.gpu} />}
              {f3.display && <Row k="Pantalla" v={f3.display} />}
            </Rows>
          </Section>

          <Section title={`Todo el F3 (${f3.fields.length} campos)`} icon="hash" collapsed>
            <div className="raw-toolbar">
              <div className="segmented">
                <button className={!showRaw ? 'on' : ''} onClick={() => setShowRaw(false)}>
                  Campos
                </button>
                <button className={showRaw ? 'on' : ''} onClick={() => setShowRaw(true)}>
                  Pantalla F3
                </button>
              </div>
              <button
                className="btn small"
                onClick={() => void copyText(f3PlainText(f3), 'Texto del F3')}
              >
                <Icon name="copy" size={14} /> Copiar todo
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
                Leído con la fuente de Minecraft · escala GUI {ocr.guiScale} · precisión{' '}
                {(ocr.confidence * 100).toFixed(1)}% · {ocr.glyphs} caracteres en {ocr.durationMs}{' '}
                ms
              </p>
            )}
          </Section>
        </>
      )}
    </>
  )
}

const GAME_MODE_ES: Record<string, string> = {
  survival: 'Supervivencia',
  creative: 'Creativo',
  adventure: 'Aventura',
  spectator: 'Espectador'
}

const WORLD_TYPE_ES: Record<CompanionData['world']['type'], string> = {
  singleplayer: 'Un jugador',
  multiplayer: 'Multijugador',
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
    <Section title="Partida" icon="gear" action={<SourceTag source="mod" />}>
      <Rows>
        <Row
          k="Mundo"
          v={
            world.name ? `${world.name} · ${WORLD_TYPE_ES[world.type]}` : WORLD_TYPE_ES[world.type]
          }
        />
        <Row
          k="Día"
          v={`${world.day + 1} · ${gameClock(world.timeOfDay)} (${world.timeOfDay} ticks)`}
        />
        <Row k="Clima" v={WEATHER_ES[world.weather]} />
        <Row k="Modo de juego" v={GAME_MODE_ES[mod.player.gameMode] ?? mod.player.gameMode} />
        <Row k="Versión" v={`${mod.minecraft} · mod ${mod.modVersion}`} />
      </Rows>
      {world.seed && (
        <div className="copy-grid">
          <CopyButton label="Semilla" value={world.seed} title={world.seed} />
        </div>
      )}
    </Section>
  )
}

/** Redstone, farms and lag: what the debug screen tells a technical player. */
function TechnicalSection({ f3, target }: { f3: F3Data; target?: F3Data['targetedBlock'] }) {
  const [showTags, setShowTags] = useState(false)
  const tick = f3.server && tickInfo(f3.server)
  const caps = f3.spawnCounts ? capRows(f3.spawnCounts) : []
  const hasState = !!target && (!!target.state || !!target.tags)
  const heights = f3.heightmaps?.server ?? f3.heightmaps?.client
  if (
    !f3.server &&
    !caps.length &&
    !hasState &&
    f3.day === undefined &&
    f3.speed === undefined &&
    !heights
  )
    return null
  const state = target && blockStateString(target)
  const setblock = target && setblockCommand(target)

  return (
    <Section title="Técnico" icon="gauge">
      <Rows>
        {tick && (
          <Row
            k="Servidor"
            v={`${formatNumber(f3.server!.mspt!, 1)} ms/tick · ${formatNumber(tick.tps, 1)} TPS · ${tick.label}`}
            hint="MSPT: milisegundos por tick. Por encima de 50 ms el juego va a menos de 20 TPS."
          />
        )}
        {f3.server?.brand && <Row k="Servidor" v={f3.server.brand} />}
        {f3.day !== undefined && <Row k="Día del mundo" v={String(f3.day)} />}
        {f3.speed !== undefined && (
          <Row
            k="Velocidad"
            v={`${formatNumber(f3.speed, 3)} bloques/tick (${formatNumber(f3.speed * 20, 2)} m/s)`}
          />
        )}
        {heights && (
          <Row
            k="Alturas"
            v={Object.entries(heights)
              .map(([k, y]) => `${HEIGHTMAP_LABEL[k] ?? k} ${y}`)
              .join(' · ')}
            hint="Heightmaps del servidor: el bloque más alto de cada tipo en esta columna"
          />
        )}
      </Rows>

      {caps.length > 0 && (
        <div className="mob-caps">
          <div className="mobs-head">
            <CreeperFace size={16} /> Límite de mobs
            <span className="muted small"> · {f3.spawnCounts!.chunks} chunks de spawn</span>
          </div>
          {caps.map((c) => (
            <div key={c.id} className={`cap-row ${c.full ? 'full' : ''}`} title={c.hint}>
              <span className="cap-label">{c.label}</span>
              <span className="cap-bar">
                <span
                  style={{ width: `${Math.min(100, (c.count / Math.max(1, c.cap)) * 100)}%` }}
                />
              </span>
              <span className="cap-value">
                {c.count}/{c.cap}
              </span>
            </div>
          ))}
          {caps.find((c) => c.id === 'monster')?.full && (
            <p className="muted small">
              El límite de monstruos está lleno: no aparecerán más hostiles. Ilumina cuevas cercanas
              o elimina mobs persistentes para que tu granja rinda.
            </p>
          )}
        </div>
      )}

      {target && hasState && (
        <div className="block-state">
          <div className="mobs-head">
            <Icon name="layers" size={15} /> {target.id ?? 'Bloque apuntado'}
          </div>
          {target.state && (
            <div className="chip-row">
              {Object.entries(target.state).map(([k, v]) => (
                <span
                  key={k}
                  className={`chip state ${v === 'true' ? 'on' : v === 'false' ? 'off' : ''}`}
                >
                  {k} <b>{v}</b>
                </span>
              ))}
            </div>
          )}
          <div className="copy-grid">
            {state && <CopyButton label="Estado" value={state} />}
            {setblock && <CopyButton label="/setblock" value={setblock} />}
          </div>
          {target.tags && (
            <>
              <button
                className="f3-tip-toggle"
                onClick={() => setShowTags(!showTags)}
                aria-expanded={showTags}
              >
                <u>
                  {showTags ? 'Ocultar' : 'Ver'} {target.tags.length} etiquetas
                </u>
              </button>
              {showTags && (
                <div className="chip-row">
                  {target.tags.map((t) => (
                    <span key={t} className="chip tag">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
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
        <strong>Captura sin F3</strong>
        <p className="muted small">
          Sin la pantalla F3 (ni el mod Craftshot Companion) no hay coordenadas. El bioma y los mobs
          se estiman con el modelo local (o con los colores si no lo tienes); la IA avanzada da el
          resultado más preciso.
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
    <Section title="IA avanzada" icon="sparkles" collapsed={!v}>
      {v ? (
        <>
          <p className="vision-desc">{v.description}</p>
          <Rows>
            {v.timeOfDay && (
              <Row k="Momento" v={TIME_ES[v.timeOfDay] ?? v.timeOfDay} copy={false} />
            )}
            {v.weather && <Row k="Clima" v={WEATHER_ES[v.weather] ?? v.weather} copy={false} />}
            {v.biome && (
              <Row
                k="Bioma según la IA"
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
          Opcional. Con tu propio servicio de IA (Claude, Gemini, OpenAI u Ollama gratis en tu
          equipo) se detectan todos los mobs, las estructuras, el clima y la hora.
        </p>
      )}
      <button
        className="btn small"
        disabled={running}
        onClick={() => void analyzeWithAi([shot.id])}
      >
        <Icon name="sparkles" size={15} />{' '}
        {running
          ? 'Analizando…'
          : v
            ? 'Volver a analizar'
            : settings?.visionEnabled
              ? `Analizar con ${PROVIDER_LABEL[provider]}`
              : 'Configurar IA avanzada'}
      </button>
    </Section>
  )
}

function NotesSection({ shot }: { shot: ScreenshotEntry }) {
  const setMeta = useLibrary((s) => s.setMeta)
  const [note, setNote] = useState(shot.meta.note ?? '')
  const [tags, setTags] = useState((shot.meta.tags ?? []).join(', '))
  return (
    <Section title="Notas" icon="note" collapsed={!shot.meta.note && !shot.meta.tags?.length}>
      <textarea
        className="input"
        placeholder="Ej.: granja de hierro, base, portal del Nether…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (shot.meta.note ?? '') && void setMeta(shot.id, { note })}
      />
      <input
        className="input"
        placeholder="Etiquetas separadas por comas"
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

function Section({
  title,
  icon,
  children,
  collapsed = false,
  accent = false,
  action
}: {
  title: string
  icon: string
  children: ReactNode
  collapsed?: boolean
  accent?: boolean
  /** Extra control shown in the header (kept outside the toggle button). */
  action?: ReactNode
}) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <section className={`dsec ${accent ? 'accent' : ''}`}>
      <div className="dsec-headrow">
        <button className="dsec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={icon} size={16} />
          <span>{title}</span>
          <Icon name="chevronDown" size={16} className={`dsec-caret ${open ? 'open' : ''}`} />
        </button>
        {action}
      </div>
      {open && <div className="dsec-body">{children}</div>}
    </section>
  )
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="rows">{children}</dl>
}

function Row({ k, v, hint, copy = true }: { k: string; v: string; hint?: string; copy?: boolean }) {
  return (
    <div className="row">
      <dt title={hint}>{k}</dt>
      <dd>
        <span className="row-value">{v}</span>
        {copy && (
          <button className="row-copy" onClick={() => void copyText(v, k)} title={`Copiar ${k}`}>
            <Icon name="copy" size={13} />
          </button>
        )}
      </dd>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <div className="fact-label">{label}</div>
      {children}
    </div>
  )
}

function Axis({ label, value }: { label: string; value: number }) {
  return (
    <button
      className="axis"
      onClick={() => void copyText(formatNumber(value), `Coordenada ${label}`)}
      title={`Copiar ${label}`}
    >
      <span className="axis-label">{label}</span>
      <span className="axis-value">{formatNumber(value)}</span>
    </button>
  )
}

function CopyButton({ label, value, title }: { label: string; value: string; title?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className={`copy-btn ${done ? 'done' : ''}`}
      title={title ?? value}
      onClick={() => {
        void copyText(value, label)
        setDone(true)
        window.setTimeout(() => setDone(false), 1200)
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={14} />
      <span className="copy-label">{label}</span>
      <span className="copy-value">{value}</span>
    </button>
  )
}

function CopyChip({ value, what }: { value: string; what: string }) {
  return (
    <button className="chip" onClick={() => void copyText(value, what)} title={`Copiar ${what}`}>
      <Icon name="copy" size={12} /> {value}
    </button>
  )
}

function SourceTag({
  source,
  confidence,
  vision
}: {
  source: InfoSource
  confidence?: number
  vision?: VisionResult | null
}) {
  const info = SOURCE_INFO[source]
  const pct =
    confidence !== undefined && source !== 'f3' && source !== 'manual'
      ? ` · ${Math.round(confidence * 100)}%`
      : ''
  const who = source === 'vision' && vision?.provider ? ` (${PROVIDER_LABEL[vision.provider]})` : ''
  return (
    <span className={`source-tag ${source}`} title={`${info.label}${who}${pct}. ${info.hint}`}>
      {source === 'vision' && vision?.provider
        ? `IA · ${PROVIDER_LABEL[vision.provider]}`
        : info.tag}
    </span>
  )
}
