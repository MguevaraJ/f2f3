import { useState, type ReactNode } from 'react'
import { BIOMES, biomeById, biomeName, DIMENSIONS, dimensionName } from '@shared/catalog/biomes'
import { MOB_CATEGORY_LABEL, mobName } from '@shared/catalog/mobs'
import type { F3Data, InfoSource, ScreenshotEntry } from '@shared/types'
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

const SOURCE_LABEL: Record<InfoSource, string> = {
  f3: 'F3',
  vision: 'IA',
  heuristic: 'Estimado',
  manual: 'Manual'
}

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
  const f3 = a?.f3
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
          {f3 ? <F3Sections shot={shot} f3={f3} /> : <NoF3Notice />}
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
  const dim = a.dimension?.id
  return (
    <Section title="Mundo" icon="compass">
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
              defaultValue={a.biome?.id ?? ''}
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
                  <SourceTag source={a.biome.source} confidence={a.biome.confidence} />
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
                title={`${m.id} · ${MOB_CATEGORY_LABEL[m.category ?? 'other']} · ${SOURCE_LABEL[m.source]}`}
              >
                {mobName(m.id)}
                {m.count > 1 && <b>×{m.count}</b>}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">
            {a.vision
              ? 'No se detectaron mobs.'
              : 'Sin mobs detectados todavía. El análisis IA puede reconocerlos.'}
          </p>
        )}
      </div>
    </Section>
  )
}

function F3Sections({ shot, f3 }: { shot: ScreenshotEntry; f3: F3Data }) {
  const [showRaw, setShowRaw] = useState(false)
  const pos = f3.position
  const block = f3.block
  const converted = block ? convertDimension(block, f3.dimension) : null
  const tp = tpCommand(f3)
  const ocr = shot.analysis?.ocr

  return (
    <>
      <Section title="Coordenadas" icon="pin" accent>
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
          {f3.chunk && <CopyButton label="Chunk" value={`${f3.chunk.x} ${f3.chunk.z}`} />}
          {f3.region && <CopyButton label="Región" value={f3.region} />}
        </div>
        {converted && (
          <p className="muted small convert-note">
            Portal equivalente en el {converted.label}: <b>{blockString(converted.pos)}</b>
          </p>
        )}
      </Section>

      <Section title="Posición" icon="layers">
        <Rows>
          {pos && <Row k="XYZ" v={exactString(pos)} />}
          {block && <Row k="Bloque" v={blockString(block)} />}
          {f3.chunk && (
            <Row k="Chunk" v={`${f3.chunk.x} ${f3.chunk.y} ${f3.chunk.z}`} hint="x, sección y, z" />
          )}
          {f3.chunkRelative && <Row k="Dentro del chunk" v={blockString(f3.chunkRelative)} />}
          {f3.region && <Row k="Archivo de región" v={f3.region} />}
          {block && (
            <Row
              k="Distancia a 0,0"
              v={`${Math.round(Math.hypot(block.x, block.z)).toLocaleString('es')} bloques`}
            />
          )}
        </Rows>
      </Section>

      {f3.facing && (
        <Section title="Orientación" icon="compass">
          <div className="facing">
            <Compass yaw={f3.facing.yaw} />
            <Rows>
              <Row k="Mirando al" v={DIRECTION_ES[f3.facing.direction] ?? f3.facing.direction} />
              {f3.facing.towards && (
                <Row
                  k="Hacia"
                  v={f3.facing.towards.replace('positive', '+').replace('negative', '−')}
                />
              )}
              {f3.facing.yaw !== undefined && (
                <Row k="Yaw" v={`${formatNumber(f3.facing.yaw, 1)}°`} />
              )}
              {f3.facing.pitch !== undefined && (
                <Row k="Pitch" v={`${formatNumber(f3.facing.pitch, 1)}°`} />
              )}
            </Rows>
          </div>
        </Section>
      )}

      {(f3.light ||
        f3.localDifficulty ||
        f3.targetedBlock ||
        f3.targetedFluid ||
        f3.targetedEntity) && (
        <Section title="Entorno" icon="eye">
          <Rows>
            {f3.light && (
              <Row
                k="Luz"
                v={`${f3.light.client ?? '—'}${f3.light.sky !== undefined ? ` (cielo ${f3.light.sky}, bloque ${f3.light.block})` : ''}`}
              />
            )}
            {f3.localDifficulty && (
              <Row
                k="Dificultad local"
                v={`${f3.localDifficulty.value} // ${f3.localDifficulty.clamped ?? '—'}`}
              />
            )}
            {f3.localDifficulty?.day !== undefined && (
              <Row k="Día del mundo" v={String(f3.localDifficulty.day)} />
            )}
            {f3.targetedBlock && (
              <Row
                k="Bloque apuntado"
                v={`${f3.targetedBlock.id ?? ''} @ ${blockString(f3.targetedBlock.pos)}`}
              />
            )}
            {f3.targetedFluid && (
              <Row
                k="Fluido apuntado"
                v={`${f3.targetedFluid.id ?? ''} @ ${blockString(f3.targetedFluid.pos)}`}
              />
            )}
            {f3.targetedEntity && <Row k="Entidad apuntada" v={f3.targetedEntity} />}
          </Rows>
        </Section>
      )}

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
            {(ocr.confidence * 100).toFixed(1)}% · {ocr.glyphs} caracteres en {ocr.durationMs} ms
          </p>
        )}
      </Section>
    </>
  )
}

function NoF3Notice() {
  return (
    <div className="no-f3">
      <span className="f3-badge">F3</span>
      <div>
        <strong>Sin pantalla de depuración</strong>
        <p className="muted small">
          Esta captura no muestra el F3. El bioma y la dimensión se estiman por colores; usa el
          análisis IA para mayor precisión.
        </p>
      </div>
    </div>
  )
}

function VisionSection({ shot }: { shot: ScreenshotEntry }) {
  const v = shot.analysis?.vision
  const progress = useLibrary((s) => s.progress.vision)
  const running = progress?.current === shot.id
  return (
    <Section title="Análisis IA" icon="sparkles" collapsed={!v}>
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
                k="Bioma (IA)"
                v={`${biomeName(v.biome.id)} · ${Math.round(v.biome.confidence * 100)}%`}
                copy={false}
              />
            )}
            {!!v.structures.length && <Row k="Estructuras" v={v.structures.join(', ')} />}
          </Rows>
          <p className="muted small">
            {v.model} · {formatRelative(v.analyzedAt)}
          </p>
        </>
      ) : (
        <p className="muted small">
          Claude puede identificar el bioma, los mobs, estructuras, clima y momento del día a partir
          de la imagen.
        </p>
      )}
      <button
        className="btn small"
        disabled={running}
        onClick={() => void analyzeWithAi([shot.id])}
      >
        <Icon name="sparkles" size={15} />{' '}
        {running ? 'Analizando…' : v ? 'Volver a analizar' : 'Analizar con IA'}
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
  accent = false
}: {
  title: string
  icon: string
  children: ReactNode
  collapsed?: boolean
  accent?: boolean
}) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <section className={`dsec ${accent ? 'accent' : ''}`}>
      <button className="dsec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name={icon} size={16} />
        <span>{title}</span>
        <Icon name="chevronDown" size={16} className={`dsec-caret ${open ? 'open' : ''}`} />
      </button>
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

function SourceTag({ source, confidence }: { source: InfoSource; confidence?: number }) {
  const title =
    source === 'heuristic'
      ? 'Estimado por los colores de la imagen (baja confianza)'
      : source === 'vision'
        ? `Detectado por IA${confidence !== undefined ? ` (${Math.round(confidence * 100)}%)` : ''}`
        : source === 'manual'
          ? 'Asignado manualmente'
          : 'Leído del F3'
  return (
    <span className={`source-tag ${source}`} title={title}>
      {SOURCE_LABEL[source]}
    </span>
  )
}
