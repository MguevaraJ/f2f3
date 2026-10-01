import { memo, type DragEvent, type MouseEvent } from 'react'
import { thumbUrl } from '@shared/ipc'
import { biomeById, biomeName, DIMENSIONS, dimensionName } from '@shared/catalog/biomes'
import type { ScreenshotEntry } from '@shared/types'
import { F3Badge, Icon, ModBadge } from '../../components/icons'
import { DRAG_MIME } from '../../components/Sidebar'
import { formatTime } from '../../lib/format'
import { tr } from '@shared/i18n'

interface Props {
  shot: ScreenshotEntry
  selected: boolean
  cut: boolean
  selectionMode: boolean
  onActivate(id: string, e: MouseEvent): void
  onToggle(id: string, e: MouseEvent): void
  onContext(id: string, e: MouseEvent): void
  dragIds(id: string): string[]
}

export const ScreenshotCard = memo(function ScreenshotCard({
  shot,
  selected,
  cut,
  selectionMode,
  onActivate,
  onToggle,
  onContext,
  dragIds
}: Props) {
  const a = shot.analysis
  const pos = a?.location?.block
  const dim = a?.dimension?.id
  const onDragStart = (e: DragEvent): void => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds(shot.id)))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  return (
    <div
      className={`card ${selected ? 'selected' : ''} ${cut ? 'is-cut' : ''} ${selectionMode ? 'selecting' : ''}`}
      data-id={shot.id}
      draggable
      onDragStart={onDragStart}
      onClick={(e) => onActivate(shot.id, e)}
      onContextMenu={(e) => onContext(shot.id, e)}
      title={shot.name}
    >
      <div className="card-media" style={{ background: a?.averageColor ?? '#2a2a2a' }}>
        <img
          src={thumbUrl(shot.id, shot.mtimeMs)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <button
          className="card-check"
          aria-label={selected ? tr('Quitar de la selección') : tr('Seleccionar')}
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(shot.id, e)
          }}
        >
          <Icon name="check" size={14} />
        </button>
        <div className="card-badges">
          {a?.mod ? <ModBadge /> : a?.hasF3 && <F3Badge />}
          {shot.meta.favorite && (
            <span className="card-fav">
              <Icon name="star" size={14} fill="currentColor" />
            </span>
          )}
          {!!a?.mobs.length && (
            <span className="card-mobs">
              {a.mobs.reduce((n, m) => n + m.count, 0)} {tr('mob')}
            </span>
          )}
        </div>
        {pos && (
          <div className="card-coords">
            {pos.x} {pos.y} {pos.z}
          </div>
        )}
      </div>
      <div className="card-info">
        <div className="card-name">{shot.name.replace(/\.(png|jpe?g)$/i, '')}</div>
        <div className="card-meta">
          <span>{formatTime(shot.capturedAt)}</span>
          {dim && (
            <span className="card-dim" style={{ color: DIMENSIONS[dim]?.color }}>
              {dimensionName(dim)}
            </span>
          )}
          {a?.biome && (
            <span
              className="card-biome"
              title={`${biomeName(a.biome.id)}${a.biome.source === 'heuristic' ? tr(' (estimado)') : ''}`}
            >
              <span
                className="dot"
                style={{ background: biomeById(a.biome.id)?.color ?? '#888' }}
              />
              {biomeName(a.biome.id)}
              {a.biome.source === 'heuristic' && '?'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
