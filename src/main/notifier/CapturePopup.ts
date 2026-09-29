import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  screen,
  type IpcMainInvokeEvent
} from 'electron'
import { POPUP_IPC } from '@shared/popupIpc'
import type { CapturePopupPayload, ScreenshotEntry } from '@shared/types'

const here = fileURLToPath(new URL('.', import.meta.url))
const WIDTH = 420
const HEIGHT = 156
const MARGIN = 18
/** Only grabbed while the popup is visible, so it never steals the key from other apps for long. */
export const COPY_SHORTCUT = 'CommandOrControl+Shift+C'
export const COPY_SHORTCUT_LABEL = process.platform === 'darwin' ? '⌘⇧C' : 'Ctrl+Shift+C'

export const blockCoords = (e: ScreenshotEntry): string | null => {
  const b = e.analysis?.f3?.block
  return b ? `${b.x} ${b.y} ${b.z}` : null
}

interface Deps {
  openInApp(id: string): void
  copyImage(id: string): Promise<void>
  autoCopy(): boolean
}

/**
 * Small always-on-top window in the bottom-right corner of the screen that
 * announces a new screenshot without taking focus away from the game.
 */
export class CapturePopup {
  private win: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private payload: CapturePopupPayload | null = null
  private shortcutActive = false

  constructor(private readonly deps: Deps) {
    const fromPopup = (e: IpcMainInvokeEvent): boolean =>
      !!this.win && e.sender === this.win.webContents
    ipcMain.handle(POPUP_IPC.copy, (e, text) => {
      if (fromPopup(e) && typeof text === 'string') clipboard.writeText(text)
    })
    ipcMain.handle(POPUP_IPC.copyImage, (e, id) => {
      if (fromPopup(e) && typeof id === 'string') return this.deps.copyImage(id)
    })
    ipcMain.handle(POPUP_IPC.open, (e, id) => {
      if (!fromPopup(e) || typeof id !== 'string') return
      this.hide()
      this.deps.openInApp(id)
    })
    ipcMain.handle(POPUP_IPC.current, (e) => (fromPopup(e) ? this.payload : null))
    ipcMain.handle(POPUP_IPC.dismiss, (e) => {
      if (fromPopup(e)) this.hide()
    })
  }

  /** New capture detected (analysis usually still running). */
  async showCapture(entry: ScreenshotEntry): Promise<void> {
    const visible = !!this.win?.isVisible() && !!this.payload
    this.payload = {
      entry,
      reading: !entry.analysis,
      more: visible ? this.payload!.more + 1 : 0,
      shortcut: null,
      autoCopied: false
    }
    await this.present()
  }

  /** Analysis of the capture on screen finished. */
  async showAnalyzed(entry: ScreenshotEntry): Promise<void> {
    const coords = blockCoords(entry)
    let autoCopied = false
    if (coords && this.deps.autoCopy()) {
      clipboard.writeText(coords)
      autoCopied = true
    }
    // Only update if it is still the capture being shown (a newer one may have replaced it).
    if (this.payload && this.payload.entry.id !== entry.id) return
    this.payload = {
      entry,
      reading: false,
      more: this.payload?.more ?? 0,
      shortcut: coords ? COPY_SHORTCUT_LABEL : null,
      autoCopied
    }
    this.setShortcut(!!coords)
    await this.present()
  }

  hide(): void {
    this.setShortcut(false)
    this.payload = null
    if (this.win && !this.win.isDestroyed()) this.win.hide()
  }

  destroy(): void {
    this.setShortcut(false)
    this.win?.destroy()
    this.win = null
  }

  private async present(): Promise<void> {
    const win = this.ensureWindow()
    await this.ready
    if (!this.payload || win.isDestroyed()) return
    win.webContents.send(POPUP_IPC.show, this.payload)
    this.place(win)
    if (!win.isVisible()) win.showInactive() // never steal focus from the game
    win.setAlwaysOnTop(true, 'screen-saver')
  }

  /** Bottom-right corner of the display the player is looking at (where the cursor is). */
  private place(win: BrowserWindow): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { x, y, width, height } = display.workArea
    win.setBounds({
      x: x + width - WIDTH - MARGIN,
      y: y + height - HEIGHT - MARGIN,
      width: WIDTH,
      height: HEIGHT
    })
  }

  private setShortcut(on: boolean): void {
    if (on === this.shortcutActive) return
    if (on) {
      this.shortcutActive = globalShortcut.register(COPY_SHORTCUT, () => {
        const coords = this.payload && blockCoords(this.payload.entry)
        if (!coords) return
        clipboard.writeText(coords)
        this.win?.webContents.send(POPUP_IPC.copied, coords)
      })
    } else {
      globalShortcut.unregister(COPY_SHORTCUT)
      this.shortcutActive = false
    }
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: true,
      // Linux: marks it as a notification so tiling WMs (i3, sway…) float it.
      type:
        process.platform === 'linux'
          ? 'notification'
          : process.platform === 'darwin'
            ? 'panel'
            : 'toolbar',
      backgroundColor: '#262626',
      title: 'Craftshot · Nueva captura',
      webPreferences: {
        preload: join(here, '../preload/popup.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    this.ready = new Promise((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    if (process.env.ELECTRON_RENDERER_URL)
      void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popup.html`)
    else void win.loadFile(join(here, '../renderer/popup.html'))
    win.on('closed', () => {
      this.win = null
      this.setShortcut(false)
    })
    this.win = win
    return win
  }
}
