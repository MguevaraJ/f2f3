import { useEffect, useMemo } from 'react'
import { BottomBar } from './components/BottomBar'
import { CloseDialog } from './components/CloseDialog'
import { Onboarding } from './components/Onboarding'
import { Header } from './components/Header'
import { ContextMenu, Dialog, Toasts } from './components/Overlays'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { CoordsView } from './features/coords/CoordsView'
import { Gallery } from './features/gallery/Gallery'
import { SettingsView } from './features/settings/SettingsView'
import { Viewer } from './features/viewer/Viewer'
import { api } from './lib/api'
import { applyQuery, facets as computeFacets } from './lib/query'
import { connectLibrary, useLibrary } from './store/library'
import { connectBackup } from './store/backup'
import { connectLocalModel } from './store/localModel'
import { useSettings } from './store/settings'
import { toast } from './store/toasts'
import { useUi } from './store/ui'

export function App() {
  const snapshot = useLibrary((s) => s.snapshot)
  const query = useUi((s) => s.query)
  const tab = useUi((s) => s.tab)
  const viewerId = useUi((s) => s.viewerId)
  const thumbSize = useSettings((s) => s.settings?.thumbnailSize)
  const loadSettings = useSettings((s) => s.load)

  useEffect(() => {
    void loadSettings()
    const disconnect = connectLibrary()
    const disconnectBackup = connectBackup()
    const disconnectLocal = connectLocalModel()
    const offNotice = api.system.onNotice((n) => toast[n.level](n.message))
    // "Ver" in the new-capture popup.
    const offOpen = api.library.onOpenRequest((id) => {
      const ui = useUi.getState()
      ui.setTab('gallery')
      ui.select([id], id)
      ui.openViewer(id)
    })
    return () => {
      disconnect()
      disconnectBackup()
      disconnectLocal()
      offNotice()
      offOpen()
    }
  }, [loadSettings])

  useEffect(() => {
    if (thumbSize) document.documentElement.style.setProperty('--thumb', `${thumbSize}px`)
  }, [thumbSize])

  const all = useMemo(() => snapshot?.screenshots ?? [], [snapshot])
  const visible = useMemo(() => applyQuery(all, query), [all, query])
  const facets = useMemo(() => computeFacets(all), [all])
  // The viewer navigates the current result set; fall back to everything if the item is filtered out.
  const viewerList = useMemo(
    () => (viewerId && !visible.some((s) => s.id === viewerId) ? all : visible),
    [viewerId, visible, all]
  )

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Header />
          <div className="content">
            {tab === 'gallery' && <Gallery shots={visible} facets={facets} />}
            {tab === 'coords' && <CoordsView shots={all} />}
            {tab === 'settings' && <SettingsView />}
          </div>
          <BottomBar visibleIds={visible.map((s) => s.id)} />
        </main>
      </div>
      {viewerId && <Viewer shots={viewerList} />}
      <ContextMenu />
      <Dialog />
      <Onboarding />
      <CloseDialog />
      <Toasts />
    </div>
  )
}
