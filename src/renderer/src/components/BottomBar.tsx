import type { FolderNode } from '@shared/types'
import { analyzeWithAi, reanalyze } from '../features/library/actions'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { GrassBlock, Icon } from './icons'
import { McText } from './McText'

/**
 * The launcher's play bar: installation picker on the left, the big green
 * button in the middle, account/status on the right.
 */
export function BottomBar({ visibleIds }: { visibleIds: string[] }) {
  const snapshot = useLibrary((s) => s.snapshot)
  const progress = useLibrary((s) => s.progress)
  const selection = useUi((s) => s.selection)
  const view = useUi((s) => s.query.view)
  const setView = useUi((s) => s.setView)
  const openViewer = useUi((s) => s.openViewer)
  const setTab = useUi((s) => s.setTab)

  const folders = snapshot ? flatten(snapshot.folders) : []
  const current = view.kind === 'folder' ? view.path : '*'
  const targetIds = selection.length ? selection : visibleIds
  const busy = progress.ocr ?? progress.vision

  return (
    <footer className="playbar">
      <div className="playbar-left">
        <GrassBlock size={34} />
        <div className="playbar-install">
          <select
            className="playbar-select"
            value={current}
            onChange={(e) =>
              e.target.value === '*'
                ? setView({ kind: 'all' })
                : setView({
                    kind: 'folder',
                    path: e.target.value,
                    recursive: e.target.value === ''
                  })
            }
            aria-label="Carpeta"
          >
            <option value="*">Todas las capturas</option>
            {folders.map((f) => (
              <option key={f.path} value={f.path}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="playbar-install-sub">
            {plural(visibleIds.length, 'captura visible', 'capturas visibles')}
          </span>
        </div>
      </div>

      <button
        className="play-button"
        disabled={!visibleIds.length}
        onClick={() => {
          setTab('gallery')
          openViewer(selection[0] ?? visibleIds[0] ?? null)
        }}
      >
        <McText text="VER" scale={4} color="#ffffff" shadow />
      </button>

      <div className="playbar-right">
        {busy ? (
          <div className="playbar-progress" title={busy.current}>
            <span>
              {busy.kind === 'vision' ? 'Analizando con IA' : 'Leyendo F3'} · {busy.done}/
              {busy.total}
            </span>
            <div className="progress">
              <div
                className="progress-fill"
                style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="playbar-actions">
            <button
              className="btn small"
              disabled={!targetIds.length}
              onClick={() => void reanalyze(targetIds)}
              title="Volver a leer el F3 de las capturas seleccionadas (o visibles)"
            >
              <Icon name="refresh" size={15} /> Reanalizar
            </button>
            <button
              className="btn small"
              disabled={!targetIds.length}
              onClick={() => void analyzeWithAi(targetIds)}
              title="Detectar bioma y mobs con Claude"
            >
              <Icon name="sparkles" size={15} /> IA ({targetIds.length})
            </button>
            <button
              className="icon-btn"
              title="Abrir carpeta"
              onClick={() => void api.library.reveal('')}
            >
              <Icon name="external" size={16} />
            </button>
          </div>
        )}
      </div>
    </footer>
  )
}

function flatten(node: FolderNode, depth = 0): { path: string; label: string }[] {
  const label = `${'\u00a0\u00a0\u00a0'.repeat(depth)}${node.path === '' ? 'screenshots' : node.name}`
  return [{ path: node.path, label }, ...node.children.flatMap((c) => flatten(c, depth + 1))]
}
