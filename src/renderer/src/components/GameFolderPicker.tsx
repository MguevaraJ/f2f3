import { useEffect, useState } from 'react'
import type { MinecraftSource } from '@shared/types'
import { api } from '../lib/api'
import { formatRelative } from '../lib/format'
import { Icon } from './icons'

const LOADER: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt'
}

/**
 * Where the user plays: every game folder found on the machine (official launcher,
 * SKLauncher, Prism, Modrinth…), most recently played first, plus any folder they pick.
 * `value` is the screenshots folder in use or about to be.
 */
export function GameFolderPicker({
  value,
  current,
  onChange,
  onLoaded
}: {
  value: string
  /** The folder the app is using now, tagged in the list. */
  current: string
  onChange: (path: string) => void
  /** Called once with what was found, to preselect. */
  onLoaded?: (sources: MinecraftSource[]) => void
}) {
  const [sources, setSources] = useState<MinecraftSource[] | null>(null)

  useEffect(() => {
    void api.settings.detectSources().then((found) => {
      setSources(found)
      onLoaded?.(found)
    })
    // Detected once: the list does not depend on the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!sources) return <p className="muted small">Buscando tus carpetas de Minecraft…</p>

  // Folders that were not detected (picked by hand) still show up in the list.
  const extra = [...new Set([value, current])]
    .filter((p) => p && !sources.some((s) => s.path === p))
    .map((p): MinecraftSource => ({ label: 'Otra carpeta', path: p, count: -1 }))
  const all = [...sources, ...extra]

  const choose = async (): Promise<void> => {
    const dir = await api.settings.chooseDirectory()
    if (dir) onChange(dir)
  }

  return (
    <div className="game-folders">
      {sources.length === 0 && (
        <p className="muted small">
          No encontré ninguna carpeta de Minecraft. Elige la carpeta del juego (donde están{' '}
          <code>saves</code> y <code>screenshots</code>) o la de capturas.
        </p>
      )}
      {all.map((s) => {
        const meta = [
          [s.version, s.loader && (LOADER[s.loader] ?? s.loader)].filter(Boolean).join(' · '),
          s.count >= 0 && `${s.count} ${s.count === 1 ? 'captura' : 'capturas'}`,
          s.lastUsed ? `jugado ${formatRelative(s.lastUsed)}` : ''
        ].filter(Boolean)
        return (
          <button
            key={s.path}
            className={`game-folder ${s.path === value ? 'active' : ''}`}
            onClick={() => onChange(s.path)}
          >
            <Icon name={s.path === value ? 'check' : 'folder'} size={18} />
            <span className="game-folder-main">
              <span className="game-folder-title">
                {s.label}
                {s.path === current && <span className="game-folder-tag">En uso</span>}
                {s.hasMod && <span className="game-folder-tag mod">Mod instalado</span>}
              </span>
              <span className="game-folder-meta">{meta.join(' · ')}</span>
              <span className="game-folder-path">{s.gameDir ?? s.path}</span>
            </span>
          </button>
        )
      })}
      <div>
        <button className="btn small" onClick={() => void choose()}>
          <Icon name="folder" size={14} /> Elegir otra carpeta…
        </button>
      </div>
    </div>
  )
}
