import type { Facets } from '../../lib/query'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent
} from 'react'
import type { ScreenshotEntry } from '@shared/types'
import { biomeHiddenInF3 } from '@shared/f3Tips'
import { useSettings } from '../../store/settings'
import { thumbUrl } from '@shared/ipc'
import { Icon } from '../../components/icons'
import { isEditable } from '../../lib/dom'
import { api } from '../../lib/api'
import { dayKey, formatDayHeading, formatRelative, plural } from '../../lib/format'
import { useLibrary } from '../../store/library'
import { useUi, type MenuItem } from '../../store/ui'
import { DetailsPanel } from '../details/DetailsPanel'
import {
  analyzeWithAi,
  copyImage,
  deleteItems,
  exportZip,
  importFiles,
  openExternal,
  paste,
  reanalyze,
  assignWorld,
  renameItem,
  reveal,
  toClipboard,
  toggleFavorite
} from '../library/actions'
import { ScreenshotCard } from './ScreenshotCard'
import { Toolbar } from './Toolbar'

interface Props {
  shots: ScreenshotEntry[]
  facets: Facets
}

export function Gallery({ shots, facets }: Props) {
  const snapshot = useLibrary((s) => s.snapshot)
  const byId = useLibrary((s) => s.byId)
  const view = useUi((s) => s.query.view)
  const sortKey = useUi((s) => s.query.sort.key)
  const selection = useUi((s) => s.selection)
  const clipboard = useUi((s) => s.clipboard)
  const detailsOpen = useUi((s) => s.detailsOpen)
  const openMenu = useUi((s) => s.openMenu)
  const [dropping, setDropping] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const ids = useMemo(() => shots.map((s) => s.id), [shots])
  const selectedSet = useMemo(() => new Set(selection), [selection])
  const cutSet = useMemo(() => new Set(clipboard?.mode === 'cut' ? clipboard.ids : []), [clipboard])
  const focused = selection.length ? byId.get(selection[selection.length - 1]) : undefined

  // Group by day when sorted by date, like a photo timeline.
  const groups = useMemo(() => {
    if (sortKey !== 'date') return [{ key: 'all', title: '', items: shots }]
    const out: { key: string; title: string; items: ScreenshotEntry[] }[] = []
    for (const s of shots) {
      const k = dayKey(s.capturedAt)
      const last = out[out.length - 1]
      if (last?.key === k) last.items.push(s)
      else out.push({ key: k, title: formatDayHeading(s.capturedAt), items: [s] })
    }
    return out
  }, [shots, sortKey])

  const onActivate = useCallback(
    (id: string, e: MouseEvent) => {
      const ui = useUi.getState()
      if (e.shiftKey && ui.anchor) {
        const a = ids.indexOf(ui.anchor)
        const b = ids.indexOf(id)
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1)
        ui.select(e.ctrlKey || e.metaKey ? [...new Set([...ui.selection, ...range])] : range)
      } else if (e.ctrlKey || e.metaKey || ui.selection.length > 0) {
        ui.toggleSelect(id)
      } else {
        ui.select([id], id)
        ui.openViewer(id)
      }
    },
    [ids]
  )
  const onToggle = useCallback((id: string) => useUi.getState().toggleSelect(id), [])
  const dragIds = useCallback((id: string) => {
    const sel = useUi.getState().selection
    return sel.includes(id) ? sel : [id]
  }, [])

  const onContext = useCallback((id: string, e: MouseEvent) => {
    e.preventDefault()
    const ui = useUi.getState()
    const targets = ui.selection.includes(id) ? ui.selection : [id]
    if (!ui.selection.includes(id)) ui.select([id], id)
    const one = targets.length === 1
    const entry = useLibrary.getState().byId.get(id)
    const items: MenuItem[] = [
      {
        label: 'Ver en grande',
        icon: 'eye',
        shortcut: 'Enter',
        disabled: !one,
        action: () => ui.openViewer(id)
      },
      { label: 'Copiar imagen', icon: 'image', disabled: !one, action: () => void copyImage(id) },
      { separator: true, label: '' },
      {
        label: 'Copiar',
        icon: 'copy',
        shortcut: 'Ctrl+C',
        action: () => toClipboard(targets, 'copy')
      },
      {
        label: 'Cortar',
        icon: 'cut',
        shortcut: 'Ctrl+X',
        action: () => toClipboard(targets, 'cut')
      },
      {
        label: 'Pegar',
        icon: 'paste',
        shortcut: 'Ctrl+V',
        disabled: !ui.clipboard,
        action: () => void paste()
      },
      {
        label: 'Renombrar',
        icon: 'pencil',
        shortcut: 'F2',
        disabled: !one,
        action: () => renameItem(id)
      },
      {
        label: entry?.meta.favorite && one ? 'Quitar de favoritas' : 'Marcar como favorita',
        icon: 'star',
        shortcut: 'F',
        action: () => toggleFavorite(targets)
      },
      {
        label: one ? 'Asignar mundo…' : `Asignar mundo a ${targets.length}…`,
        icon: 'compass',
        action: () => assignWorld(targets)
      },
      { separator: true, label: '' },
      { label: 'Reanalizar F3', icon: 'refresh', action: () => void reanalyze(targets) },
      { label: 'Analizar con IA', icon: 'sparkles', action: () => void analyzeWithAi(targets) },
      {
        label: one ? 'Guardar en ZIP' : `Guardar ${targets.length} en ZIP`,
        icon: 'download',
        action: () => void exportZip(targets)
      },
      { separator: true, label: '' },
      {
        label: 'Mostrar en carpeta',
        icon: 'folderOpen',
        disabled: !one,
        action: () => void reveal(id)
      },
      {
        label: 'Abrir con otra app',
        icon: 'external',
        disabled: !one,
        action: () => void openExternal(id)
      },
      { separator: true, label: '' },
      {
        label: 'Eliminar',
        icon: 'trash',
        shortcut: 'Supr',
        danger: true,
        action: () => deleteItems(targets)
      }
    ]
    ui.openMenu(e.clientX, e.clientY, items)
  }, [])

  // Keyboard navigation inside the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUi.getState()
      if (ui.viewerId || ui.dialog || ui.tab !== 'gallery') return
      if (isEditable(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      const current = ui.selection[ui.selection.length - 1]
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        ui.select(ids)
      } else if (ctrl && e.key.toLowerCase() === 'c' && ui.selection.length)
        toClipboard(ui.selection, 'copy')
      else if (ctrl && e.key.toLowerCase() === 'x' && ui.selection.length)
        toClipboard(ui.selection, 'cut')
      else if (ctrl && e.key.toLowerCase() === 'v') void paste()
      else if (e.key === 'Delete' && ui.selection.length) deleteItems(ui.selection)
      else if (e.key === 'F2' && ui.selection.length === 1) renameItem(ui.selection[0])
      else if (e.key.toLowerCase() === 'f' && !ctrl && ui.selection.length)
        toggleFavorite(ui.selection)
      else if (e.key === 'Enter' && current) ui.openViewer(current)
      else if (e.key === 'Escape') ui.clearSelection()
      else if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) &&
        ids.length
      ) {
        e.preventDefault()
        const grid = gridRef.current
        const card = grid?.querySelector<HTMLElement>('.card')
        const perRow =
          card && grid
            ? Math.max(1, Math.floor((grid.clientWidth - 16) / (card.offsetWidth + 12)))
            : 1
        const i = current ? ids.indexOf(current) : -1
        const delta =
          { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[e.key] ?? 0
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? ids.length - 1
              : Math.min(ids.length - 1, Math.max(0, i + delta))
        const id = ids[next]
        ui.select(e.shiftKey && current ? [...new Set([...ui.selection, id])] : [id], id)
        grid?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ids])

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDropping(false)
    if (e.dataTransfer.types.includes('application/x-craftshot-ids')) return
    const paths = [...e.dataTransfer.files].map((f) => api.library.pathForFile(f)).filter(Boolean)
    if (paths.length) void importFiles(paths)
  }

  const latest = snapshot?.screenshots[0]
  const title =
    view.kind === 'all'
      ? 'Todas las capturas'
      : view.kind === 'favorites'
        ? 'Favoritas'
        : view.kind === 'f3'
          ? 'Capturas con datos F3'
          : view.kind === 'mobs'
            ? 'Capturas con mobs'
            : view.path || 'screenshots'

  return (
    <div className={`gallery-layout ${detailsOpen ? 'with-details' : ''}`}>
      <section className="gallery-main">
        <div
          className="hero"
          style={
            latest
              ? { backgroundImage: `url("${thumbUrl(latest.id, latest.mtimeMs)}")` }
              : undefined
          }
        >
          <div className="hero-content">
            <h1 className="hero-title">{title}</h1>
            <div className="hero-stats">
              <span>{plural(shots.length, 'captura', 'capturas')}</span>
              <span>
                {plural(shots.filter((s) => s.analysis?.hasF3).length, 'con F3', 'con F3')}
              </span>
              {latest && <span>Última {formatRelative(latest.capturedAt)}</span>}
            </div>
          </div>
        </div>

        <F3BiomeBanner shots={shots} />
        <Toolbar visibleIds={ids} facets={facets} />

        <div
          ref={gridRef}
          className={`gallery-scroll ${dropping ? 'dropping' : ''}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setDropping(true)
            }
          }}
          onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
          onDrop={onDrop}
          onClick={(e) => e.target === e.currentTarget && useUi.getState().clearSelection()}
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest('.card')) return
            e.preventDefault()
            openMenu(e.clientX, e.clientY, [
              { label: 'Pegar', icon: 'paste', disabled: !clipboard, action: () => void paste() },
              {
                label: 'Seleccionar todo',
                icon: 'check',
                shortcut: 'Ctrl+A',
                action: () => useUi.getState().select(ids)
              },
              { label: 'Actualizar', icon: 'refresh', action: () => void api.library.refresh() }
            ])
          }}
        >
          {!snapshot ? (
            <div className="empty-state">Cargando capturas…</div>
          ) : !snapshot.rootExists ? (
            <div className="empty-state">
              <Icon name="folder" size={48} />
              <h3>No se encontró la carpeta de capturas</h3>
              <p>{snapshot.root}</p>
              <button className="btn primary" onClick={() => useUi.getState().setTab('settings')}>
                Elegir carpeta
              </button>
            </div>
          ) : shots.length === 0 ? (
            <div className="empty-state">
              <Icon name="image" size={48} />
              <h3>No hay capturas aquí</h3>
              <p>
                Pulsa F2 en Minecraft para hacer una captura, o arrastra imágenes a esta ventana
                para importarlas.
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="day-group">
                {g.title && (
                  <div className="day-heading">
                    <span>{g.title}</span>
                    <span className="muted">{g.items.length}</span>
                  </div>
                )}
                <div className="grid">
                  {g.items.map((s) => (
                    <ScreenshotCard
                      key={s.id}
                      shot={s}
                      selected={selectedSet.has(s.id)}
                      cut={cutSet.has(s.id)}
                      selectionMode={selection.length > 0}
                      onActivate={onActivate}
                      onToggle={onToggle}
                      onContext={onContext}
                      dragIds={dragIds}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {detailsOpen && (
        <aside className="details-dock">
          {focused ? (
            <DetailsPanel shot={focused} />
          ) : (
            <div className="empty-state small">
              <Icon name="info" size={36} />
              <h3>Detalles</h3>
              <p>
                Selecciona una captura (clic en su casilla o Ctrl+clic) para ver sus coordenadas,
                bioma, mobs y todo el F3.
              </p>
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

const TIP_F3_BIOME = 'f3-biome'

/** One-off tip: the player's F3 hides the biome (1.21.9+), here is how to show it. */
function F3BiomeBanner({ shots }: { shots: ScreenshotEntry[] }) {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const affected = useMemo(() => shots.filter((s) => biomeHiddenInF3(s.analysis)).length, [shots])
  if (!settings || !affected || settings.dismissedTips.includes(TIP_F3_BIOME)) return null
  return (
    <div className="tip-banner">
      <span className="f3-badge">F3</span>
      <div className="tip-banner-text">
        <strong>
          {affected === 1
            ? '1 captura con F3 no muestra'
            : `${affected} capturas con F3 no muestran`}{' '}
          el bioma
        </strong>
        <span>
          Tu versión de Minecraft lo oculta por defecto. En el juego pulsa{' '}
          <span className="kbd">F3</span> + <span className="kbd">F6</span>, busca la línea del{' '}
          <b>bioma</b> (Biome) y actívala: desde tu próxima captura Craftshot lo leerá exacto.
        </span>
      </div>
      <button
        className="icon-btn"
        title="Entendido"
        onClick={() => void update({ dismissedTips: [...settings.dismissedTips, TIP_F3_BIOME] })}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
