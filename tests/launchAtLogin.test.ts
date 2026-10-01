import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

const setLoginItemSettings = vi.fn()
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/home/steve/Mis Proyectos/f2f3',
    setLoginItemSettings,
    getLoginItemSettings: () => ({ wasOpenedAtLogin: true })
  }
}))
vi.mock('../resources/icon.png?asset', () => ({ default: '/opt/F2+F3/resources/icon.png' }))

const { desktopEntry, execLine } = await import('../src/main/autostart/desktopEntry')
const { LaunchAtLogin, HIDDEN_FLAG } = await import('../src/main/autostart/LaunchAtLogin')

describe('XDG desktop entry', () => {
  it('quotes paths with spaces and escapes special characters', () => {
    expect(execLine(['/usr/bin/f2f3', '--hidden'])).toBe('/usr/bin/f2f3 --hidden')
    expect(execLine(['/home/a b/F2+F3.AppImage'])).toBe('"/home/a b/F2+F3.AppImage"')
    expect(execLine(['/x/$HOME"q"'])).toBe('"/x/\\$HOME\\"q\\""')
    expect(execLine(['/x/100%'])).toBe('/x/100%%')
  })

  it('produces a valid autostart entry', () => {
    const text = desktopEntry({ argv: ['/usr/bin/f2f3', '--hidden'], icon: '/i.png' })
    expect(text.split('\n')[0]).toBe('[Desktop Entry]')
    expect(text).toContain('Exec=/usr/bin/f2f3 --hidden')
    expect(text).toContain('Type=Application')
    expect(text).toContain('Icon=/i.png')
  })
})

describe('LaunchAtLogin', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cs-autostart-'))
    setLoginItemSettings.mockClear()
    delete process.env.APPIMAGE
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('Linux: writes and removes ~/.config/autostart/f2f3.desktop', () => {
    const l = new LaunchAtLogin('linux', dir)
    expect(existsSync(l.desktopFile)).toBe(false) // off by default: nothing written
    l.apply(true)
    const text = readFileSync(join(dir, 'autostart', 'f2f3.desktop'), 'utf8')
    // Dev build: Electron binary + app path (quoted: it has a space) + hidden flag.
    expect(text).toContain(`"/home/steve/Mis Proyectos/f2f3" ${HIDDEN_FLAG}`)
    l.apply(true) // idempotent
    l.apply(false)
    expect(existsSync(l.desktopFile)).toBe(false)
    l.apply(false) // removing twice is fine
  })

  it('Linux AppImage: autostarts the AppImage itself, not the temporary mount', () => {
    process.env.APPIMAGE = '/home/steve/Apps/F2+F3.AppImage'
    new LaunchAtLogin('linux', dir).apply(true)
    expect(readFileSync(join(dir, 'autostart', 'f2f3.desktop'), 'utf8')).toContain(
      'Exec=/home/steve/Apps/F2+F3.AppImage --hidden'
    )
  })

  it('Windows: registers a login item that starts hidden', () => {
    new LaunchAtLogin('win32', dir).apply(true)
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: process.execPath,
      args: ['/home/steve/Mis Proyectos/f2f3', HIDDEN_FLAG]
    })
    new LaunchAtLogin('win32', dir).apply(false)
    expect(setLoginItemSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ openAtLogin: false })
    )
  })

  it('knows when it was started by the OS', () => {
    expect(new LaunchAtLogin('linux', dir).startedAtLogin(['electron', '.', HIDDEN_FLAG])).toBe(
      true
    )
    expect(new LaunchAtLogin('linux', dir).startedAtLogin(['electron', '.'])).toBe(false)
    expect(new LaunchAtLogin('darwin', dir).startedAtLogin(['F2+F3'])).toBe(true) // macOS login item
  })
})
