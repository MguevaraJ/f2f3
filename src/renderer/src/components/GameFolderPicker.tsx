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
 * Several can be ticked; `values` are their screenshots folders, in the order added.
 */
export function GameFolderPicker({
  values,
  onChange,
  onLoaded
}: {
  values: string[]
  onChange: (paths: string[]) => void
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
  const extra = values
    .filter((p) => !sources.some((s) => s.path === p))
    .map((p): MinecraftSource => ({ label: 'Otra carpeta', path: p, count: -1 }))
  const all = [...sources, ...extra]

  // At least one stays ticked; new ones go last so the first keeps its place.
  const toggle = (path: string): void => {
    if (!values.includes(path)) onChange([...values, path])
    else if (values.length > 1) onChange(values.filter((v) => v !== path))
  }
  const choose = async (): Promise<void> => {
    const dir = await api.settings.chooseDirectory()
    if (dir && !values.includes(dir)) onChange([...values, dir])
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
            className={`game-folder ${values.includes(s.path) ? 'active' : ''}`}
            role="checkbox"
            aria-checked={values.includes(s.path)}
            onClick={() => toggle(s.path)}
          >
            <span className="game-folder-check">
              {values.includes(s.path) && <Icon name="check" size={14} />}
            </span>
            <span className="game-folder-main">
              <span className="game-folder-title">
                {s.label}
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
          <Icon name="folder" size={14} /> Añadir otra carpeta…
        </button>
      </div>
    </div>
  )
}
