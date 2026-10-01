import { useMemo } from 'react'
import { biomeName, dimensionName } from '@shared/catalog/biomes'
import { mobName } from '@shared/catalog/mobs'
import { structureName } from '@shared/catalog/structures'
import { thumbUrl } from '@shared/ipc'
import type { ScreenshotEntry } from '@shared/types'
import { NO_WORLD } from '@shared/worlds'
import { Icon } from '../../components/icons'
import { formatBytes, formatDateTime, formatTime } from '../../lib/format'
import { summarizeSelection, type Count } from '../../lib/selectionSummary'
import { useUi } from '../../store/ui'
import { assignWorld, deleteItems, reanalyze, toggleFavorite } from '../library/actions'
import { Row, Rows, Section } from './parts'
import { getLang, tr } from '@shared/i18n'

const THUMBS = 8
const CHIPS = 12

const n = (v: number): string => v.toLocaleString(getLang())

function Chips({ items, name }: { items: Count[]; name: (id: string) => string }) {
  const shown = items.slice(0, CHIPS)
  return (
    <div className="chip-row">
      {shown.map((c) => (
        <span key={c.id} className="chip tag" title={c.id}>
          {name(c.id)} <b>{c.count}</b>
        </span>
      ))}
      {items.length > shown.length && (
        <span className="muted small">
          y {items.length - shown.length} {tr('más')}
        </span>
      )}
    </div>
  )
}

/** Shown in the details dock instead of one screenshot's details when several are selected. */
export function SelectionSummary({ shots }: { shots: ScreenshotEntry[] }) {
  const s = useMemo(() => summarizeSelection(shots), [shots])
  const select = useUi((st) => st.select)
  const ids = shots.map((x) => x.id)
  const sameDay = new Date(s.from).toDateString() === new Date(s.to).toDateString()

  return (
    <div className="details">
      <div className="details-head">
        <div className="details-title">
          <div className="details-name static">
            {n(s.count)} {tr('capturas seleccionadas')}
          </div>
          <div className="details-sub">
            {formatBytes(s.bytes)} {tr('en total')}
            {s.favorites > 0 &&
              tr(' · {0} favorita{1}', n(s.favorites), s.favorites === 1 ? '' : 's')}
          </div>
        </div>
      </div>

      <div className="selection-thumbs">
        {shots.slice(0, THUMBS).map((x) => (
          <button key={x.id} onClick={() => select([x.id])} title={tr('Ver solo {0}', x.name)}>
            <img src={thumbUrl(x.id, x.mtimeMs)} alt="" />
          </button>
        ))}
        {shots.length > THUMBS && <span className="more">+{n(shots.length - THUMBS)}</span>}
      </div>

      <div className="details-actions">
        <button
          className="btn small"
          onClick={() => toggleFavorite(ids)}
          title={tr('Favorita (F)')}
        >
          <Icon name="star" size={15} />
        </button>
        <button className="btn small" onClick={() => assignWorld(ids)} title={tr('Asignar mundo…')}>
          <Icon name="compass" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void reanalyze(ids)}
          title={tr('Reanalizar F3')}
        >
          <Icon name="refresh" size={15} />
        </button>
        <button
          className="btn small danger"
          onClick={() => deleteItems(ids)}
          title={tr('Eliminar')}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>

      <Section title={tr('Resumen')} icon="info">
        <Rows wrap>
          <Row
            k={tr('Fechas')}
            v={
              s.from === s.to
                ? formatDateTime(s.from)
                : sameDay
                  ? `${formatDateTime(s.from)} – ${formatTime(s.to)}`
                  : `${formatDateTime(s.from)} – ${formatDateTime(s.to)}`
            }
          />
          <Row
            k={tr('Con coordenadas')}
            v={`${n(s.located)} de ${n(s.count)}`}
            hint={tr('Capturas con el F3 abierto o con datos del mod')}
          />
          <Row k={tr('Origen de los datos')} v={`Mod ${n(s.withMod)} · F3 ${n(s.withF3)}`} />
          {s.pending > 0 && <Row k={tr('Analizándose')} v={n(s.pending)} />}
        </Rows>
      </Section>

      {(s.worlds.length > 1 || s.worlds[0]?.id !== NO_WORLD || s.dimensions.length > 0) && (
        <Section title={tr('Mundo')} icon="compass">
          {s.worlds.some((w) => w.id !== NO_WORLD) && (
            <>
              <div className="mobs-head">{tr('Mundos')}</div>
              <Chips items={s.worlds} name={(id) => (id === NO_WORLD ? tr('Sin mundo') : id)} />
            </>
          )}
          {s.dimensions.length > 0 && (
            <>
              <div className="mobs-head">{tr('Dimensiones')}</div>
              <Chips items={s.dimensions} name={dimensionName} />
            </>
          )}
          {s.biomes.length > 0 && (
            <>
              <div className="mobs-head">{tr('Biomas')}</div>
              <Chips items={s.biomes} name={biomeName} />
            </>
          )}
        </Section>
      )}

      {s.areas.length > 0 && (
        <Section title={tr('Zona que abarcan')} icon="pin">
          <Rows wrap>
            {s.areas.map((a) => (
              <Row
                key={a.dimension}
                k={`${dimensionName(a.dimension)} (${n(a.count)})`}
                v={tr(
                  '{0} × {1} bloques · X {2} a {3} · Z {4} a {5}',
                  n(a.x[1] - a.x[0]),
                  n(a.z[1] - a.z[0]),
                  a.x[0],
                  a.x[1],
                  a.z[0],
                  a.z[1]
                )}
              />
            ))}
          </Rows>
        </Section>
      )}

      {(s.mobs.length > 0 || s.structures.length > 0) && (
        <Section title={tr('Mobs y estructuras')} icon="layers">
          {s.mobs.length > 0 && (
            <>
              <div className="mobs-head">{tr('Mobs (capturas en las que salen)')}</div>
              <Chips items={s.mobs} name={mobName} />
            </>
          )}
          {s.structures.length > 0 && (
            <>
              <div className="mobs-head">{tr('Estructuras')}</div>
              <Chips items={s.structures} name={structureName} />
            </>
          )}
        </Section>
      )}

      {s.tags.length > 0 && (
        <Section title={tr('Etiquetas')} icon="hash">
          <Chips items={s.tags} name={(id) => id} />
        </Section>
      )}
      <p className="muted small selection-hint">
        {tr('Haz clic en una miniatura para ver los detalles de esa captura.')}
      </p>
    </div>
  )
}
