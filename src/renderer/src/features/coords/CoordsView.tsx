import { useMemo, useState } from 'react'
import { thumbUrl } from '@shared/ipc'
import { biomeById, biomeName, DIMENSIONS, dimensionName } from '@shared/catalog/biomes'
import type { ScreenshotEntry, Vec3 } from '@shared/types'
import { Icon } from '../../components/icons'
import { blockString, convertDimension, distance, parseVec, tpCommand } from '../../lib/coords'
import { formatDateTime, plural } from '../../lib/format'
import { useUi } from '../../store/ui'
import { copyText, exportTable } from '../library/actions'
import { buildCoordsTable } from './coordsTable'
import { getLang, tr } from '@shared/i18n'

type Col = 'date' | 'name' | 'x' | 'y' | 'z' | 'dist' | 'biome' | 'dimension'

/**
 * Waypoint-style table of every screenshot with F3 coordinates: sortable,
 * distance to a reference point, Nether/Overworld conversion and quick copy.
 */
export function CoordsView({ shots }: { shots: ScreenshotEntry[] }) {
  const openViewer = useUi((s) => s.openViewer)
  const select = useUi((s) => s.select)
  const openMenu = useUi((s) => s.openMenu)
  const [ref, setRef] = useState('')
  const [dimFilter, setDimFilter] = useState<string>('')
  const [nether, setNether] = useState(false)
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: 'date', dir: -1 })
  const [text, setText] = useState('')

  const refPoint = parseVec(ref)
  const withCoords = useMemo(
    () =>
      shots.filter(
        (s) => s.analysis?.location?.block && (!dimFilter || s.analysis.dimension?.id === dimFilter)
      ),
    [shots, dimFilter]
  )
  const dims = useMemo(
    () => [...new Set(shots.map((s) => s.analysis?.dimension?.id).filter(Boolean) as string[])],
    [shots]
  )

  /** Position shown in the table: optionally converted to the other dimension's scale. */
  const shown = (s: ScreenshotEntry): Vec3 => {
    const b = s.analysis!.location!.block!
    if (!nether) return b
    return convertDimension(b, s.analysis?.dimension?.id)?.pos ?? b
  }

  const rows = useMemo(() => {
    const q = text.toLowerCase()
    const list = withCoords.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.meta.note ?? '').toLowerCase().includes(q) ||
        (s.analysis?.biome && biomeName(s.analysis.biome.id).toLowerCase().includes(q))
    )
    const val = (s: ScreenshotEntry): number | string => {
      const b = s.analysis!.location!.block!
      switch (sort.col) {
        case 'date':
          return s.capturedAt
        case 'name':
          return s.name
        case 'x':
        case 'y':
        case 'z':
          return b[sort.col]
        case 'dist':
          return refPoint ? distance(b, refPoint) : Math.hypot(b.x, b.z)
        case 'biome':
          return s.analysis?.biome ? biomeName(s.analysis.biome.id) : '~'
        case 'dimension':
          return s.analysis?.dimension ? dimensionName(s.analysis.dimension.id) : '~'
      }
    }
    return list.sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      return (
        (typeof va === 'string'
          ? va.localeCompare(vb as string, getLang(), { numeric: true })
          : va - (vb as number)) * sort.dir
      )
    })
  }, [withCoords, text, sort, refPoint])

  const head = (col: Col, label: string, cls = '') => (
    <th
      className={`${cls} ${sort.col === col ? 'sorted' : ''}`}
      onClick={() =>
        setSort((s) => ({
          col,
          dir: s.col === col ? (-s.dir as 1 | -1) : col === 'name' || col === 'biome' ? 1 : -1
        }))
      }
    >
      {label}
      {sort.col === col && <span className="sort-arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </th>
  )

  return (
    <div className="coords-view">
      <div className="coords-toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            className="search-input"
            placeholder={tr('Filtrar por nombre, bioma o nota')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <select
          className="input small-select"
          value={dimFilter}
          onChange={(e) => setDimFilter(e.target.value)}
          aria-label={tr('Dimensión')}
        >
          <option value="">{tr('Todas las dimensiones')}</option>
          {dims.map((d) => (
            <option key={d} value={d}>
              {dimensionName(d)}
            </option>
          ))}
        </select>
        <div className="ref-input">
          <Icon name="pin" size={16} />
          <input
            className="search-input"
            placeholder={tr('Punto de referencia: x y z')}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
          {refPoint && <span className="chip">{tr('distancia activa')}</span>}
        </div>
        <label
          className="checkbox"
          title={tr('Muestra las coordenadas convertidas a la otra dimensión (÷8 / ×8)')}
        >
          <input type="checkbox" checked={nether} onChange={(e) => setNether(e.target.checked)} />
          {tr('Convertir Nether ⇄ Overworld')}
        </label>
        <div className="toolbar-spacer" />
        <button
          className="btn small"
          disabled={!rows.length}
          title={tr('Exporta la tabla tal como se ve: filtros, orden, conversión y distancia')}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const table = () => buildCoordsTable(rows, { convert: nether, reference: refPoint })
            openMenu(r.left, r.bottom + 4, [
              {
                label: tr('Excel (.xlsx) · {0} filas', rows.length),
                icon: 'download',
                action: () => void exportTable(table(), 'xlsx')
              },
              {
                label: tr('CSV (.csv)'),
                icon: 'download',
                action: () => void exportTable(table(), 'csv')
              }
            ])
          }}
        >
          <Icon name="download" size={15} /> {tr('Exportar tabla')}
          <Icon name="chevronDown" size={14} />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <Icon name="pin" size={48} />
          <h3>{tr('Sin coordenadas todavía')}</h3>
          <p>
            {tr(
              'Las capturas hechas con la pantalla F3 abierta (o con el mod F2+F3 Companion) aparecerán aquí con su posición, bioma y dimensión.'
            )}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="coords-table">
            <thead>
              <tr>
                <th className="col-thumb" />
                {head('name', tr('Captura'))}
                {head('dimension', tr('Dimensión'))}
                {head('x', 'X', 'num')}
                {head('y', 'Y', 'num')}
                {head('z', 'Z', 'num')}
                {head('dist', refPoint ? tr('Distancia') : tr('Dist. a 0,0'), 'num')}
                {head('biome', tr('Bioma'))}
                {head('date', tr('Fecha'))}
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const f3 = s.analysis!.location!
                const p = shown(s)
                const dim = s.analysis?.dimension?.id
                const d = refPoint
                  ? distance(f3.block!, refPoint)
                  : Math.hypot(f3.block!.x, f3.block!.z)
                const tp = tpCommand(f3)
                return (
                  <tr key={s.id} onDoubleClick={() => (select([s.id], s.id), openViewer(s.id))}>
                    <td className="col-thumb">
                      <img
                        src={thumbUrl(s.id, s.mtimeMs)}
                        alt=""
                        loading="lazy"
                        onClick={() => (select([s.id], s.id), openViewer(s.id))}
                      />
                    </td>
                    <td>
                      <div className="cell-name">{s.name.replace(/\.png$/i, '')}</div>
                      {s.meta.note && <div className="cell-note">{s.meta.note}</div>}
                    </td>
                    <td>
                      {dim && (
                        <span className="cell-dim">
                          <span
                            className="dot"
                            style={{ background: DIMENSIONS[dim]?.color ?? '#888' }}
                          />
                          {dimensionName(dim)}
                        </span>
                      )}
                    </td>
                    <td className="num mono">{p.x}</td>
                    <td className="num mono">{p.y}</td>
                    <td className="num mono">{p.z}</td>
                    <td className="num mono">{Math.round(d).toLocaleString(getLang())}</td>
                    <td>
                      {s.analysis?.biome && (
                        <span className="cell-dim">
                          <span
                            className="dot"
                            style={{ background: biomeById(s.analysis.biome.id)?.color ?? '#888' }}
                          />
                          {biomeName(s.analysis.biome.id)}
                        </span>
                      )}
                    </td>
                    <td className="muted nowrap">{formatDateTime(s.capturedAt)}</td>
                    <td className="col-actions">
                      <button
                        className="icon-btn"
                        title={tr('Copiar coordenadas')}
                        onClick={() => void copyText(blockString(p), tr('Coordenadas'))}
                      >
                        <Icon name="copy" size={15} />
                      </button>
                      {tp && (
                        <button
                          className="icon-btn"
                          title={tp}
                          onClick={() => void copyText(tp, tr('Comando /tp'))}
                        >
                          <Icon name="play" size={15} />
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        title={tr('Usar como referencia')}
                        onClick={() => setRef(blockString(f3.block!))}
                      >
                        <Icon name="pin" size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="table-foot muted">
            {plural(rows.length, tr('ubicación'), tr('ubicaciones'))}
          </div>
        </div>
      )}
    </div>
  )
}
