import type { Facets } from '../../lib/query'
import { useEffect, useRef } from 'react'
import { biomeById, biomeName, DIMENSIONS, dimensionName } from '@shared/catalog/biomes'
import { mobName } from '@shared/catalog/mobs'
import { structureName } from '@shared/catalog/structures'
import type { InfoSource } from '@shared/types'
import { Icon } from '../../components/icons'
import { type Filters } from '../../lib/query'
import { useUi } from '../../store/ui'

const SOURCES: { id: InfoSource; label: string }[] = [
  { id: 'f3', label: 'F3 (exacto)' },
  { id: 'local', label: 'Modelo local' },
  { id: 'vision', label: 'IA avanzada' },
  { id: 'heuristic', label: 'Colores' },
  { id: 'manual', label: 'Manual' }
]

interface Props {
  facets: Facets
  onClose(): void
}

export function FilterPopover({ facets, onClose }: Props) {
  const filters = useUi((s) => s.query.filters)
  const setFilters = useUi((s) => s.setFilters)
  const resetFilters = useUi((s) => s.resetFilters)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        !(e.target as Element).closest('.filter-trigger')
      )
        onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const toggle = <K extends 'dimensions' | 'biomes' | 'mobs' | 'structures' | 'biomeSources'>(
    key: K,
    value: Filters[K][number]
  ): void => {
    const list = filters[key] as string[]
    setFilters({
      [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    } as Partial<Filters>)
  }

  return (
    <div className="popover filter-popover" ref={ref} role="dialog" aria-label="Filtros">
      <div className="popover-head">
        <strong>Filtros</strong>
        <button className="btn ghost small" onClick={resetFilters}>
          Limpiar todo
        </button>
      </div>

      <div className="filter-group">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filters.onlyF3}
            onChange={(e) => setFilters({ onlyF3: e.target.checked })}
          />
          Solo con F3
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filters.onlyFavorites}
            onChange={(e) => setFilters({ onlyFavorites: e.target.checked })}
          />
          Solo favoritas
        </label>
      </div>

      <div className="filter-group">
        <div className="filter-label">Dimensión</div>
        <div className="chip-row">
          {(facets.dimensions.length ? facets.dimensions : Object.keys(DIMENSIONS)).map((d) => (
            <button
              key={d}
              className={`chip ${filters.dimensions.includes(d) ? 'on' : ''}`}
              onClick={() => toggle('dimensions', d)}
            >
              <span className="dot" style={{ background: DIMENSIONS[d]?.color ?? '#888' }} />
              {dimensionName(d)}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-label">Bioma</div>
        {facets.biomes.length ? (
          <div className="chip-row scroll">
            {facets.biomes.map((b) => (
              <button
                key={b}
                className={`chip ${filters.biomes.includes(b) ? 'on' : ''}`}
                onClick={() => toggle('biomes', b)}
              >
                <span className="dot" style={{ background: biomeById(b)?.color ?? '#888' }} />
                {biomeName(b)}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Aún no hay biomas detectados.</p>
        )}
        <div className="chip-row">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              className={`chip ${filters.biomeSources.includes(s.id) ? 'on' : ''}`}
              onClick={() => toggle('biomeSources', s.id)}
              title="Origen del dato de bioma"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-label">Mobs</div>
        {facets.mobs.length ? (
          <div className="chip-row scroll">
            {facets.mobs.map((m) => (
              <button
                key={m}
                className={`chip ${filters.mobs.includes(m) ? 'on' : ''}`}
                onClick={() => toggle('mobs', m)}
              >
                {mobName(m)}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Sin mobs detectados todavía.</p>
        )}
      </div>

      <div className="filter-group">
        <div className="filter-label">Estructuras</div>
        {facets.structures.length ? (
          <div className="chip-row scroll">
            {facets.structures.map((st) => (
              <button
                key={st}
                className={`chip ${filters.structures.includes(st) ? 'on' : ''}`}
                onClick={() => toggle('structures', st)}
              >
                {structureName(st)}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Las estructuras las detecta la IA avanzada (opcional).</p>
        )}
      </div>

      <div className="filter-group">
        <div className="filter-label">Fecha</div>
        <div className="date-row">
          <input
            className="input"
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ from: e.target.value })}
            aria-label="Desde"
          />
          <Icon name="chevronRight" size={16} />
          <input
            className="input"
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ to: e.target.value })}
            aria-label="Hasta"
          />
        </div>
      </div>
      <p className="muted small hint">
        Tip: busca por coordenadas con <code>x&gt;1000</code>, <code>y&lt;0</code> o{' '}
        <code>z=-84</code>.
      </p>
    </div>
  )
}
