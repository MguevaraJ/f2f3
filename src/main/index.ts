import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, session } from 'electron'
import { IPC } from '@shared/ipc'
import { BackgroundController } from './BackgroundController'
import { copyImageToClipboard } from './clipboardImage'
import { registerIpc } from './ipc/registerIpc'
import { CapturePopup } from './notifier/CapturePopup'
import { registerSchemeHandler, registerSchemePrivileges } from './protocol'
import { createServices, type Services } from './services'
import { createMainWindow } from './window'

registerSchemePrivileges()

if (!app.requestSingleInstanceLock()) app.quit()

let services: Services | null = null
let mainWindow: BrowserWindow | null = null
let popup: CapturePopup | null = null
let background: BackgroundController | null = null

/** Events for the main UI (the capture popup has its own channel). */
function broadcast(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

function showMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    mainWindow.on('closed', onMainClosed)
    background?.attach(mainWindow)
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  return mainWindow
}

function onMainClosed(): void {
  mainWindow = null
  // The hidden popup window would otherwise keep the app alive.
  if (process.platform !== 'darwin') app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) showMainWindow()
})

app.whenReady().then(() => {
  app.setAppUserModelId('dev.mguevara.craftshot')
  // Deny every permission request (camera, notifications, …): the app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  services = createServices(
    app.getPath('userData'),
    new URL('./analysis.worker.js', import.meta.url)
  )
  const { library, analysis } = services

  registerSchemeHandler(library, services.thumbs)
  registerIpc(services)

  library.on('changed', (snap) => broadcast(IPC.events.libraryChanged, snap))
  analysis.on('updated', (id, a) => broadcast(IPC.events.analysisUpdated, id, a))
  analysis.on('progress', (p) => broadcast(IPC.events.analysisProgress, p))
  analysis.on('error', (message) => broadcast(IPC.events.notice, { level: 'error', message }))
  services.backup.on('status', (s) => broadcast(IPC.events.backupStatus, s))

  // New-capture popup.
  const { settings, captures } = services
  popup = new CapturePopup({
    openInApp: (id) => {
      const win = showMainWindow()
      const send = (): void => win.webContents.send(IPC.events.openScreenshot, id)
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
      else send()
    },
    copyImage: (id) => copyImageToClipboard(library.resolveId(id)),
    autoCopy: () => settings.value.notifyAutoCopy
  })
  const testNotification = async (): Promise<void> => {
    const latest = (await library.snapshot()).screenshots[0]
    if (!latest) throw new Error('No hay capturas para mostrar')
    await popup?.showCapture({ ...latest, analysis: null })
    setTimeout(() => void popup?.showAnalyzed(latest), 700)
  }
  ipcMain.handle(IPC.settings.testNotification, (e) => {
    if (e.sender === mainWindow?.webContents) return testNotification()
  })

  // Closing the window: quit, or keep running in the background (tray where available).
  background = new BackgroundController({
    settings,
    getWindow: () => mainWindow,
    showWindow: () => void showMainWindow(),
    testNotification: () => void testNotification().catch(() => undefined)
  })
  captures.on('capture', (entry) => {
    if (settings.value.notifyNewShots) void popup?.showCapture(entry)
  })
  captures.on('analyzed', (entry) => {
    if (settings.value.notifyNewShots) void popup?.showAnalyzed(entry)
    else if (settings.value.notifyAutoCopy && entry.analysis?.f3?.block) {
      const b = entry.analysis.f3.block
      clipboard.writeText(`${b.x} ${b.y} ${b.z}`)
    }
  })

  library.startWatching()
  void library.refresh()

  mainWindow = createMainWindow()
  mainWindow.on('closed', onMainClosed)
  background.attach(mainWindow)
  if (process.env.CRAFTSHOT_CAPTURE) void captureForDebug(mainWindow, process.env.CRAFTSHOT_CAPTURE)

  app.on('activate', () => {
    if (!mainWindow) showMainWindow()
  })
})

/**
 * Debug aid: CRAFTSHOT_CAPTURE=/path/out.png writes a screenshot of the window after
 * it settles, then quits. CRAFTSHOT_SCRIPT may hold JS to run in the page first.
 */
async function captureForDebug(win: BrowserWindow, out: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises')
  await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))
  const [w, h] = (process.env.CRAFTSHOT_SIZE ?? '').split('x').map(Number)
  if (w && h) win.setContentSize(w, h)
  await new Promise((r) => setTimeout(r, Number(process.env.CRAFTSHOT_DELAY ?? 4000)))
  if (process.env.CRAFTSHOT_SCRIPT) {
    await win.webContents.executeJavaScript(process.env.CRAFTSHOT_SCRIPT)
    await new Promise((r) => setTimeout(r, Number(process.env.CRAFTSHOT_SCRIPT_DELAY ?? 1500)))
  }
  const image = await win.webContents.capturePage()
  await writeFile(out, image.toPNG())
  app.quit()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitting = false
app.on('before-quit', (e) => {
  if (quitting || !services) return
  e.preventDefault()
  quitting = true
  popup?.destroy()
  background?.destroy()
  void services.dispose().finally(() => app.quit())
})

app.on('will-quit', () => globalShortcut.unregisterAll())
