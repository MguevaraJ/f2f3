import { useState } from 'react'
import { MOD_VERSIONS, type ModVersion } from '@shared/modVersions'
import { api } from '../lib/api'
import { toast } from '../store/toasts'
import { Icon } from './icons'
import { tr } from '@shared/i18n'

/** Saves the Companion mod's .jar for the chosen Minecraft version. */
export function SaveModButton({ small }: { small?: boolean }) {
  const [version, setVersion] = useState<ModVersion>(MOD_VERSIONS[0])
  const save = async (): Promise<void> => {
    const path = await api.companion.saveMod(version)
    if (path) toast.success(tr('Mod guardado en {0}', path))
  }
  return (
    <>
      <select
        className="input"
        value={version}
        onChange={(e) => setVersion(e.target.value as ModVersion)}
        title={tr('Versión de Minecraft (Fabric)')}
      >
        {MOD_VERSIONS.map((v) => (
          <option key={v} value={v}>
            {tr('Minecraft')} {v}
          </option>
        ))}
      </select>
      <button className={`btn primary ${small ? 'small' : ''}`} onClick={() => void save()}>
        <Icon name="download" size={small ? 15 : 16} /> {tr('Guardar el mod (.jar)')}
      </button>
    </>
  )
}
