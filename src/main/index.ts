import { app, BrowserWindow, session } from 'electron'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc/registerIpc'
import { registerSchemeHandler, registerSchemePrivileges } from './protocol'
import { createServices, type Services } from './services'
import { createMainWindow } from './window'

registerSchemePrivileges()

if (!app.requestSingleInstanceLock()) app.quit()

let services: Services | null = null
let mainWindow: BrowserWindow | null = null

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows())
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
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

  library.startWatching()
  void library.refresh()

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => (mainWindow = null))
  if (process.env.CRAFTSHOT_CAPTURE) void captureForDebug(mainWindow, process.env.CRAFTSHOT_CAPTURE)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
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
  void services.dispose().finally(() => app.quit())
})
