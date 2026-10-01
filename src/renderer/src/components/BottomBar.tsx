import type { FolderNode } from '@shared/types'
import { analyzeWithAi, reanalyze } from '../features/library/actions'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import { useBackup } from '../store/backup'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { GrassBlock, Icon } from './icons'
import { McText } from './McText'
import { tr } from '@shared/i18n'

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
  const backup = useBackup((s) => s.status)
  const backupBusy =
    backup?.state === 'running' && backup.total > 0
      ? {
          kind: 'backup' as const,
          done: backup.done,
          total: backup.total,
          current: backup.current
        }
      : null
  const busy = progress.ocr ?? progress.vision ?? backupBusy

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
            aria-label={tr('Carpeta')}
          >
            <option value="*">{tr('Todas las capturas')}</option>
            {folders.map((f) => (
              <option key={f.path} value={f.path}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="playbar-install-sub">
            {plural(visibleIds.length, tr('captura visible'), tr('capturas visibles'))}
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
        <McText text={tr('VER')} scale={4} color="#ffffff" shadow />
      </button>

      <div className="playbar-right">
        {busy ? (
          <div className="playbar-progress" title={busy.current}>
            <span>
              {busy.kind === 'vision'
                ? tr('Analizando con IA')
                : busy.kind === 'backup'
                  ? backup?.phase === 'restoring'
                    ? tr('Restaurando desde Drive')
                    : backup?.phase === 'scanning'
                      ? tr('Preparando respaldo')
                      : tr('Respaldando en Drive')
                  : tr('Leyendo F3')}{' '}
              · {busy.done}/{busy.total}
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
              title={tr('Volver a leer el F3 de las capturas seleccionadas (o visibles)')}
            >
              <Icon name="refresh" size={15} /> {tr('Reanalizar')}
            </button>
            <button
              className="btn small"
              disabled={!targetIds.length}
              onClick={() => void analyzeWithAi(targetIds)}
              title={tr('Detectar bioma y mobs con Claude')}
            >
              <Icon name="sparkles" size={15} /> {tr('IA (')}
              {targetIds.length})
            </button>
            <button
              className="icon-btn"
              title={tr('Abrir carpeta')}
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
