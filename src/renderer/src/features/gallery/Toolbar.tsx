import type { Facets } from '../../lib/query'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/icons'
import { activeFilterCount, type SortKey } from '../../lib/query'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/ui'
import { api } from '../../lib/api'
import {
  analyzeWithAi,
  deleteItems,
  exportData,
  exportZip,
  newFolder,
  paste,
  toClipboard,
  toggleFavorite
} from '../library/actions'
import { FilterPopover } from './FilterPopover'
import { tr } from '@shared/i18n'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: tr('Fecha') },
  { key: 'name', label: tr('Nombre') },
  { key: 'size', label: tr('Tamaño') },
  { key: 'x', label: tr('Coordenada X') },
  { key: 'y', label: tr('Altura (Y)') },
  { key: 'z', label: tr('Coordenada Z') },
  { key: 'origin', label: tr('Distancia a 0,0') },
  { key: 'biome', label: tr('Bioma') },
  { key: 'dimension', label: tr('Dimensión') }
]

interface Props {
  visibleIds: string[]
  facets: Facets
}

export function Toolbar({ visibleIds, facets }: Props) {
  const query = useUi((s) => s.query)
  const setSearch = useUi((s) => s.setSearch)
  const setSort = useUi((s) => s.setSort)
  const selection = useUi((s) => s.selection)
  const select = useUi((s) => s.select)
  const clearSelection = useUi((s) => s.clearSelection)
  const clipboard = useUi((s) => s.clipboard)
  const detailsOpen = useUi((s) => s.detailsOpen)
  const setDetailsOpen = useUi((s) => s.setDetailsOpen)
  const openMenu = useUi((s) => s.openMenu)
  const thumbSize = useSettings((s) => s.settings?.thumbnailSize ?? 220)
  const updateSettings = useSettings((s) => s.update)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftSize, setDraftSize] = useState<number | null>(null)
  const size = draftSize ?? thumbSize
  const searchRef = useRef<HTMLInputElement>(null)
  const nFilters = activeFilterCount(query.filters)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (selection.length > 0) {
    return (
      <div className="toolbar selection-bar">
        <button
          className="icon-btn"
          onClick={clearSelection}
          title={tr('Cancelar selección (Esc)')}
        >
          <Icon name="close" size={18} />
        </button>
        <strong>
          {selection.length} {tr('seleccionada')}
          {selection.length === 1 ? '' : 's'}
        </strong>
        <button className="btn ghost small" onClick={() => select(visibleIds)}>
          {tr('Seleccionar todo (')}
          {visibleIds.length})
        </button>
        <div className="toolbar-spacer" />
        <button
          className="btn small"
          onClick={() => toClipboard(selection, 'copy')}
          title={tr('Copiar (Ctrl+C)')}
        >
          <Icon name="copy" size={15} /> <span className="btn-label">{tr('Copiar')}</span>
        </button>
        <button
          className="btn small"
          onClick={() => toClipboard(selection, 'cut')}
          title={tr('Cortar (Ctrl+X)')}
        >
          <Icon name="cut" size={15} /> <span className="btn-label">{tr('Cortar')}</span>
        </button>
        <button
          className="btn small"
          onClick={() => toggleFavorite(selection)}
          title={tr('Favorita (F)')}
        >
          <Icon name="star" size={15} /> <span className="btn-label">{tr('Favorita')}</span>
        </button>
        <button className="btn small" onClick={() => void analyzeWithAi(selection)}>
          <Icon name="sparkles" size={15} /> <span className="btn-label">{tr('Analizar IA')}</span>
        </button>
        <button
          className="btn small"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openMenu(r.left, r.bottom + 4, [
              {
                label: tr('Capturas en ZIP ({0})', selection.length),
                icon: 'download',
                action: () => void exportZip(selection)
              },
              { separator: true, label: '' },
              {
                label: tr('Datos en CSV (Excel)'),
                icon: 'download',
                action: () => void exportData(selection, 'csv')
              },
              {
                label: tr('Datos en JSON'),
                icon: 'download',
                action: () => void exportData(selection, 'json')
              }
            ])
          }}
        >
          <Icon name="download" size={15} /> <span className="btn-label">{tr('Exportar')}</span>
        </button>
        <button
          className="btn small danger"
          onClick={() => deleteItems(selection)}
          title={tr('Eliminar (Supr)')}
        >
          <Icon name="trash" size={15} /> <span className="btn-label">{tr('Eliminar')}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="toolbar">
      <div className="search">
        <Icon name="search" size={16} />
        <input
          ref={searchRef}
          className="search-input"
          placeholder={tr('Buscar por nombre, bioma, mob, nota, x>100…')}
          value={query.search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
          spellCheck={false}
        />
        {query.search && (
          <button
            className="icon-btn"
            onClick={() => setSearch('')}
            aria-label={tr('Limpiar búsqueda')}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div className="toolbar-group">
        <button
          className={`btn small filter-trigger ${nFilters ? 'active' : ''}`}
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          <Icon name="filter" size={15} /> {tr('Filtros')}
          {nFilters > 0 && <span className="count-badge">{nFilters}</span>}
        </button>
        {filtersOpen && <FilterPopover facets={facets} onClose={() => setFiltersOpen(false)} />}
      </div>

      <div className="sort">
        <select
          className="input small-select"
          value={query.sort.key}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label={tr('Ordenar por')}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          className="icon-btn"
          onClick={() => setSort(query.sort.key, query.sort.dir === 'asc' ? 'desc' : 'asc')}
          title={query.sort.dir === 'asc' ? tr('Ascendente') : tr('Descendente')}
        >
          <Icon
            name="sort"
            size={16}
            style={{ transform: query.sort.dir === 'asc' ? 'scaleY(-1)' : undefined }}
          />
        </button>
      </div>

      <div className="toolbar-spacer" />

      <input
        className="size-slider"
        type="range"
        min={140}
        max={420}
        step={10}
        value={size}
        onChange={(e) => {
          setDraftSize(Number(e.target.value))
          document.documentElement.style.setProperty('--thumb', `${e.target.value}px`)
        }}
        onPointerUp={() =>
          void updateSettings({ thumbnailSize: size }).then(() => setDraftSize(null))
        }
        onKeyUp={() => void updateSettings({ thumbnailSize: size }).then(() => setDraftSize(null))}
        style={{ ['--thumb' as string]: `${size}px` }}
        title={tr('Tamaño de miniaturas')}
        aria-label={tr('Tamaño de miniaturas')}
      />
      <button className="icon-btn" title={tr('Nueva carpeta')} onClick={() => newFolder()}>
        <Icon name="folderPlus" size={18} />
      </button>
      <button
        className="icon-btn"
        title={clipboard ? tr('Pegar {0} (Ctrl+V)', clipboard.ids.length) : tr('Nada que pegar')}
        disabled={!clipboard}
        onClick={() => void paste()}
      >
        <Icon name="paste" size={18} />
      </button>
      <button
        className="icon-btn"
        title={tr('Actualizar')}
        onClick={() => void api.library.refresh()}
      >
        <Icon name="refresh" size={18} />
      </button>
      <button
        className={`icon-btn ${detailsOpen ? 'on' : ''}`}
        title={tr('Panel de detalles')}
        onClick={() => setDetailsOpen(!detailsOpen)}
      >
        <Icon name="info" size={18} />
      </button>
    </div>
  )
}
