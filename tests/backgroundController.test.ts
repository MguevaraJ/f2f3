import { EventEmitter } from 'node:events'
import { vi } from 'vitest'

// Minimal Electron stand-ins, enough to drive the close logic.
const handlers = new Map<string, (...a: unknown[]) => unknown>()
const appMock = Object.assign(new EventEmitter(), { quit: vi.fn() })
const trays: { destroyed: boolean; menu: unknown }[] = []
vi.mock('electron', () => ({
  app: appMock,
  powerMonitor: new EventEmitter(),
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) },
  nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
  Menu: { buildFromTemplate: (t: unknown) => t },
  Tray: class {
    state = { destroyed: false, menu: null as unknown }
    constructor() {
      trays.push(this.state)
    }
    setToolTip() {}
    on() {}
    setContextMenu(m: unknown) {
      this.state.menu = m
    }
    displayBalloon() {}
    destroy() {
      this.state.destroyed = true
    }
  }
}))
vi.mock('../resources/icon.png?asset', () => ({ default: '/icon.png' }))

const { BackgroundController } = await import('../src/main/BackgroundController')
const { IPC } = await import('../src/shared/ipc')

function setup(closeAction: 'ask' | 'background' | 'quit', trayIcon = false) {
  const settings = Object.assign(new EventEmitter(), {
    value: { closeAction, trayIcon, notifyNewShots: true },
    update: vi.fn((p: object) => Object.assign(settings.value, p))
  })
  const webContents = { send: vi.fn(), isCrashed: () => false, isLoading: () => false }
  const win = Object.assign(new EventEmitter(), {
    webContents,
    hide: vi.fn(),
    show: vi.fn(),
    restore: vi.fn(),
    isMinimized: () => false
  })
  const ctl = new BackgroundController({
    settings: settings as never,
    getWindow: () => win as never,
    showWindow: vi.fn(),
    testNotification: vi.fn()
  })
  ctl.attach(win as never)
  const close = () => {
    const e = { preventDefault: vi.fn() }
    win.emit('close', e)
    return e.preventDefault.mock.calls.length > 0
  }
  const resolve = (choice: string, remember: boolean) =>
    handlers.get(IPC.system.resolveClose)!({ sender: webContents }, choice, remember)
  return { settings, win, webContents, close, resolve }
}

describe('closing the window', () => {
  beforeEach(() => {
    appMock.quit.mockClear()
    trays.length = 0
  })

  it('asks the renderer when set to "ask", and keeps the app alive meanwhile', () => {
    const t = setup('ask')
    expect(t.close()).toBe(true) // prevented
    expect(t.webContents.send).toHaveBeenCalledWith(IPC.events.confirmClose)
  })

  it('"Dejar en segundo plano" hides the window; remember stores the choice', () => {
    const t = setup('ask')
    t.close()
    t.resolve('background', true)
    expect(t.win.hide).toHaveBeenCalled()
    expect(appMock.quit).not.toHaveBeenCalled()
    expect(t.settings.value.closeAction).toBe('background')
    expect(t.close()).toBe(true) // next time: straight to background, no question
    expect(t.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('"Cerrar Craftshot" quits; cancelling does nothing', () => {
    const t = setup('ask')
    t.close()
    t.resolve('cancel', false)
    expect(appMock.quit).not.toHaveBeenCalled()
    expect(t.win.hide).not.toHaveBeenCalled()
    t.close()
    t.resolve('quit', false)
    expect(appMock.quit).toHaveBeenCalled()
    expect(t.settings.update).not.toHaveBeenCalled()
  })

  it('lets the window close when set to "quit", and never blocks an OS shutdown', () => {
    expect(setup('quit').close()).toBe(false)
    const t = setup('ask')
    t.win.emit('session-end')
    expect(t.close()).toBe(false)
  })

  it('creates a tray icon only when enabled (off by default on Linux)', () => {
    const noTray = setup('background', false)
    noTray.close()
    expect(trays).toHaveLength(0)
    const withTray = setup('background', true)
    withTray.close()
    expect(trays).toHaveLength(1)
    withTray.settings.value.trayIcon = false
    withTray.settings.emit('changed', withTray.settings.value, { trayIcon: true })
    expect(trays[0].destroyed).toBe(true)
  })
})
