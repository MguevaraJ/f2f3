import { api } from '../lib/api'
import { Icon } from './icons'
import { tr } from '@shared/i18n'

/** Frameless window chrome: drag region + window controls, like the launcher. */
export function TitleBar() {
  return (
    <div className="titlebar">
      <div className="titlebar-title">F2+F3</div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          aria-label={tr('Minimizar')}
          onClick={() => void api.system.minimize()}
        >
          <Icon name="minimize" size={14} />
        </button>
        <button
          className="titlebar-btn"
          aria-label={tr('Maximizar')}
          onClick={() => void api.system.toggleMaximize()}
        >
          <Icon name="maximize" size={12} />
        </button>
        <button
          className="titlebar-btn close"
          aria-label={tr('Cerrar')}
          onClick={() => void api.system.close()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  )
}
