import { useState, type DragEvent, type ReactNode } from 'react'
import type { FolderNode } from '@shared/types'
import {
  deleteItems,
  importFiles,
  moveTo,
  newFolder,
  paste,
  renameItem
} from '../features/library/actions'
import { api } from '../lib/api'
import type { LibraryView } from '../lib/query'
import { useLibrary } from '../store/library'
import { useBackup } from '../store/backup'
import { toast } from '../store/toasts'
import { GoogleButton } from './GoogleButton'
import { useUi } from '../store/ui'
import { formatRelative } from '../lib/format'
import { CreeperFace, GrassBlock, Icon } from './icons'

export const DRAG_MIME = 'application/x-craftshot-ids'

const sameView = (a: LibraryView, b: LibraryView): boolean =>
  a.kind === b.kind && (a.kind !== 'folder' || (b.kind === 'folder' && a.path === b.path))

/** Launcher's left rail: "games" become smart collections, then the folder tree. */
export function Sidebar() {
  const snapshot = useLibrary((s) => s.snapshot)
  const view = useUi((s) => s.query.view)
  const tab = useUi((s) => s.tab)
  const setView = useUi((s) => s.setView)
  const setTab = useUi((s) => s.setTab)
  const shots = snapshot?.screenshots ?? []

  const counts = {
    all: shots.length,
    favorites: shots.filter((s) => s.meta.favorite).length,
    f3: shots.filter((s) => s.analysis?.location).length,
    mobs: shots.filter((s) => s.analysis?.mobs.length).length
  }

  const item = (v: LibraryView, label: string, sub: string, icon: ReactNode) => (
    <button
      key={label}
      className={`side-game ${tab === 'gallery' && sameView(view, v) ? 'active' : ''}`}
      onClick={() => setView(v)}
    >
      <span className="side-game-icon">{icon}</span>
      <span className="side-game-text">
        <span className="side-game-name">{label}</span>
        <span className="side-game-sub">{sub}</span>
      </span>
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="side-account">
        <div className="side-avatar">
          <GrassBlock size={28} />
        </div>
        <div className="side-account-text">
          <div className="side-account-name">Craftshot</div>
          <div className="side-account-sub" title={snapshot?.roots.map((r) => r.path).join('\n')}>
            {!snapshot
              ? 'Cargando…'
              : snapshot.roots.length > 1
                ? `${snapshot.roots.length} carpetas de juego`
                : snapshot.root.replace(/^\/home\/[^/]+/, '~')}
          </div>
        </div>
      </div>

      <nav className="side-scroll">
        <div className="side-section">
          {item(
            { kind: 'all' },
            'Todas las capturas',
            `${counts.all} capturas`,
            <GrassBlock size={30} />
          )}
          {item(
            { kind: 'f3' },
            'Con coordenadas',
            `${counts.f3} con coordenadas`,
            <span className="side-f3">F3</span>
          )}
          {item(
            { kind: 'favorites' },
            'Favoritas',
            `${counts.favorites} marcadas`,
            <span className="side-star">
              <Icon name="star" size={20} fill="currentColor" />
            </span>
          )}
          {item(
            { kind: 'mobs' },
            'Con mobs',
            `${counts.mobs} detectadas`,
            <CreeperFace size={26} />
          )}
        </div>

        <div className="side-heading">
          <span>Carpetas</span>
          <button className="icon-btn" title="Nueva carpeta" onClick={() => newFolder('')}>
            <Icon name="folderPlus" size={16} />
          </button>
        </div>
        {snapshot && <FolderTree node={snapshot.folders} depth={0} />}
      </nav>

      <div className="side-footer">
        <BackupBadge onClick={() => setTab('settings')} />
        <button
          className={`side-link ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <Icon name="gear" size={18} /> Ajustes
        </button>
      </div>
    </aside>
  )
}

function FolderTree({ node, depth }: { node: FolderNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const [dropping, setDropping] = useState(false)
  const view = useUi((s) => s.query.view)
  const tab = useUi((s) => s.tab)
  const setView = useUi((s) => s.setView)
  const openMenu = useUi((s) => s.openMenu)
  const clipboard = useUi((s) => s.clipboard)
  const active = tab === 'gallery' && view.kind === 'folder' && view.path === node.path
  const total = countDeep(node)

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDropping(false)
    const ids = e.dataTransfer.getData(DRAG_MIME)
    if (ids) void moveTo(JSON.parse(ids) as string[], node.path, e.ctrlKey ? 'copy' : 'cut')
    else if (e.dataTransfer.files.length)
      void importFiles(
        [...e.dataTransfer.files].map((f) => api.library.pathForFile(f)),
        node.path
      )
  }

  return (
    <div className="tree">
      <div
        className={`tree-row ${active ? 'active' : ''} ${dropping ? 'dropping' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => setView({ kind: 'folder', path: node.path, recursive: node.path === '' })}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu(e.clientX, e.clientY, [
            { label: 'Nueva subcarpeta', icon: 'folderPlus', action: () => newFolder(node.path) },
            {
              label: 'Pegar aquí',
              icon: 'paste',
              disabled: !clipboard,
              action: () => void paste(node.path)
            },
            { separator: true, label: '' },
            {
              label: 'Mostrar en el explorador',
              icon: 'external',
              action: () => void api.library.reveal(node.path || '.')
            },
            ...(node.path
              ? [
                  { label: 'Renombrar', icon: 'pencil', action: () => renameItem(node.path, true) },
                  {
                    label: 'Eliminar carpeta',
                    icon: 'trash',
                    danger: true,
                    action: () => deleteItems([node.path], true)
                  }
                ]
              : [])
          ])
        }}
      >
        <button
          className={`tree-caret ${node.children.length ? '' : 'hidden'} ${open ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!open)
          }}
          aria-label={open ? 'Contraer' : 'Expandir'}
        >
          <Icon name="chevronRight" size={14} />
        </button>
        <Icon name={active ? 'folderOpen' : 'folder'} size={16} />
        <span className="tree-name">{node.name}</span>
        <span className="tree-count">{total}</span>
      </div>
      {open && node.children.map((c) => <FolderTree key={c.path} node={c} depth={depth + 1} />)}
    </div>
  )
}

function countDeep(n: FolderNode): number {
  return n.count + n.children.reduce((a, c) => a + countDeep(c), 0)
}

/** Google Drive backup state, like the launcher's account line. */
function BackupBadge({ onClick }: { onClick(): void }) {
  const status = useBackup((s) => s.status)
  if (!status) return null
  if (!status.account) {
    if (!status.configured) return null
    if (status.state === 'connecting')
      return (
        <div className="side-backup running">
          <span className="spinner" />
          <span className="side-backup-text">
            <span>Iniciando sesión…</span>
            <small>Continúa en tu navegador</small>
          </span>
        </div>
      )
    return (
      <GoogleButton
        className="google-btn compact side-google"
        title="Guarda una copia de tus capturas en Google Drive"
        onClick={() =>
          void api.backup.connect().then((s) => {
            if (s.account)
              toast.success(`Sesión iniciada como ${s.account.email}. Empezando el respaldo…`)
            else if (s.error) toast.error(s.error)
          })
        }
      >
        Respaldar con Google
      </GoogleButton>
    )
  }
  const running = status.state === 'running'
  const label = running
    ? status.phase === 'uploading'
      ? `Respaldando ${status.done}/${status.total}`
      : status.phase === 'restoring'
        ? `Restaurando ${status.done}/${status.total}`
        : 'Preparando respaldo…'
    : status.state === 'error'
      ? 'Error en el respaldo'
      : status.lastRun
        ? `Respaldado ${formatRelative(status.lastRun.finishedAt)}`
        : 'Drive conectado'
  return (
    <button
      className={`side-backup ${status.state}`}
      onClick={onClick}
      title={`Google Drive · ${status.account.email}${status.error ? `\n${status.error}` : ''}`}
    >
      <Icon
        name={status.state === 'error' ? 'cloudOff' : running ? 'cloudUp' : 'cloud'}
        size={17}
      />
      <span className="side-backup-text">
        <span>{label}</span>
        <small>{status.account.email}</small>
      </span>
      {running && status.total > 0 && (
        <span
          className="side-backup-bar"
          style={{ width: `${(status.done / status.total) * 100}%` }}
        />
      )}
    </button>
  )
}
