import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, shell } from 'electron'
import appIcon from '../../resources/icon.png?asset'

const here = fileURLToPath(new URL('.', import.meta.url))

/** Frameless window styled like the Minecraft Launcher, locked down for security. */
export function createMainWindow({ visible = true }: { visible?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#1e1e1e',
    title: 'Craftshot',
    icon: appIcon,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })

  // Started at login: stay in the background until the user opens it.
  if (visible) win.once('ready-to-show', () => win.show())

  // Never navigate away from the app or open popups inside it.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(here, '../renderer/index.html'))
  return win
}
