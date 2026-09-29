import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, Tray } from 'electron'
import { IPC, type CloseChoice } from '@shared/ipc'
import type { SettingsService } from './services/SettingsService'
import trayIconPath from '../../resources/icon.png?asset'

interface Deps {
  settings: SettingsService
  /** The main window, created on demand. */
  getWindow(): BrowserWindow | null
  showWindow(): void
  testNotification(): void
}

/**
 * Decides what closing the main window means: quit, or keep Craftshot running in
 * the background (capture popups, auto-backup) — with a tray icon where the
 * platform has one. The question itself is asked by the renderer (launcher-style
 * dialog); OS shutdown/logout always goes through untouched.
 */
export class BackgroundController {
  private tray: Tray | null = null
  private allowQuit = false
  private asking = false
  private hintShown = false

  constructor(private readonly deps: Deps) {
    app.on('before-quit', () => (this.allowQuit = true))
    // Never block a system shutdown / logout with a question.
    powerMonitor.on('shutdown', () => (this.allowQuit = true))

    ipcMain.handle(IPC.system.resolveClose, (e, choice: CloseChoice, remember: unknown) => {
      const win = this.deps.getWindow()
      if (!win || e.sender !== win.webContents) return
      this.asking = false
      if (choice !== 'quit' && choice !== 'background') return // cancelled
      if (remember === true) this.deps.settings.update({ closeAction: choice })
      if (choice === 'quit') this.quit()
      else this.toBackground()
    })

    ipcMain.handle(IPC.system.quit, (e) => {
      if (e.sender === this.deps.getWindow()?.webContents) this.quit()
    })

    this.deps.settings.on('changed', (next, prev) => {
      if (next.trayIcon !== prev.trayIcon || next.notifyNewShots !== prev.notifyNewShots)
        this.syncTray()
    })
  }

  /** Call once per main window. */
  attach(win: BrowserWindow): void {
    win.on('close', (e) => {
      if (this.allowQuit) return
      const action = this.deps.settings.value.closeAction
      if (action === 'quit') {
        this.allowQuit = true
        return
      }
      e.preventDefault()
      if (action === 'background') {
        this.toBackground()
        return
      }
      // A crashed or still-loading page can't answer: don't trap the user.
      if (win.webContents.isCrashed() || win.webContents.isLoading()) {
        this.quit()
        return
      }
      if (!this.asking) {
        this.asking = true
        if (win.isMinimized()) win.restore()
        win.show()
        win.webContents.send(IPC.events.confirmClose)
      }
    })
    // Windows: logging off / shutting down.
    win.on('session-end', () => (this.allowQuit = true))
    win.on('show', () => this.syncTray())
  }

  quit(): void {
    this.allowQuit = true
    app.quit()
  }

  toBackground(): void {
    this.deps.getWindow()?.hide()
    this.syncTray()
    if (this.tray && !this.hintShown && process.platform === 'win32') {
      this.hintShown = true
      this.tray.displayBalloon({
        title: 'Craftshot sigue funcionando',
        content: 'Te avisará de las capturas nuevas. Ábrelo desde aquí cuando quieras.',
        iconType: 'info'
      })
    }
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private syncTray(): void {
    const wanted = this.deps.settings.value.trayIcon
    if (!wanted) {
      this.destroy()
      return
    }
    if (!this.tray) {
      const size = process.platform === 'darwin' ? 18 : process.platform === 'win32' ? 32 : 24
      this.tray = new Tray(
        nativeImage.createFromPath(trayIconPath).resize({ width: size, height: size })
      )
      this.tray.setToolTip('Craftshot')
      this.tray.on('click', () => this.deps.showWindow())
    }
    const { notifyNewShots } = this.deps.settings.value
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir Craftshot', click: () => this.deps.showWindow() },
        {
          label: 'Avisar de capturas nuevas',
          type: 'checkbox',
          checked: notifyNewShots,
          click: (item) => this.deps.settings.update({ notifyNewShots: item.checked })
        },
        {
          label: 'Probar aviso',
          enabled: notifyNewShots,
          click: () => this.deps.testNotification()
        },
        { type: 'separator' },
        { label: 'Salir de Craftshot', click: () => this.quit() }
      ])
    )
  }
}
