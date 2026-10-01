import { useUi, type Tab } from '../store/ui'
import { McText } from './McText'

const TABS: { id: Tab; label: string }[] = [
  { id: 'gallery', label: 'Galería' },
  { id: 'coords', label: 'Coordenadas' },
  { id: 'map', label: 'Mapa' },
  { id: 'settings', label: 'Ajustes' }
]

/** Product header: title in the Minecraft font + uppercase tabs (Play / Installations / …). */
export function Header() {
  const tab = useUi((s) => s.tab)
  const setTab = useUi((s) => s.setTab)
  return (
    <header className="header">
      <div className="header-title">
        <McText text="F2+F3" scale={3} color="#ffffff" />
        <span className="header-edition">SCREENSHOT EDITION</span>
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
