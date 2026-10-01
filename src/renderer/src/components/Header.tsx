import { useUi, type Tab } from '../store/ui'
import { LanguageButton } from './LanguageButton'
import { McText } from './McText'
import { tr } from '@shared/i18n'

const TABS: { id: Tab; label: string }[] = [
  { id: 'gallery', label: tr('Galería') },
  { id: 'coords', label: tr('Coordenadas') },
  { id: 'map', label: tr('Mapa') },
  { id: 'settings', label: tr('Ajustes') }
]

/** Product header: title in the Minecraft font + uppercase tabs (Play / Installations / …). */
export function Header() {
  const tab = useUi((s) => s.tab)
  const setTab = useUi((s) => s.setTab)
  return (
    <header className="header">
      <div className="header-title">
        <McText text="F2+F3" scale={3} color="#ffffff" />
        <span className="header-edition">{tr('SCREENSHOT EDITION')}</span>
        <LanguageButton />
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
