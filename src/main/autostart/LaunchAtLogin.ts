import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import appIcon from '../../../resources/icon.png?asset'
import { desktopEntry } from './desktopEntry'

/** Passed to F2+F3 when the OS starts it at login: start in the background. */
export const HIDDEN_FLAG = '--hidden'

/**
 * "Iniciar con el sistema". Windows/macOS use Electron's login items;
 * Linux uses an XDG autostart .desktop file.
 */
export class LaunchAtLogin {
  constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly configDir = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  ) {}

  get desktopFile(): string {
    return join(this.configDir, 'autostart', 'f2f3.desktop')
  }

  /** Command that starts this very installation (AppImage, installed binary or dev). */
  command(): string[] {
    if (process.env.APPIMAGE) return [process.env.APPIMAGE, HIDDEN_FLAG]
    // In development the binary is Electron itself and needs the app path.
    return app.isPackaged
      ? [process.execPath, HIDDEN_FLAG]
      : [process.execPath, app.getAppPath(), HIDDEN_FLAG]
  }

  /** Makes the OS state match `enabled`. Idempotent: also refreshes paths after updates. */
  apply(enabled: boolean): void {
    if (this.platform === 'linux') {
      // The entry written when the app was called Craftshot.
      rmSync(join(this.configDir, 'autostart', 'craftshot.desktop'), { force: true })
      if (enabled) {
        mkdirSync(join(this.configDir, 'autostart'), { recursive: true })
        const content = desktopEntry({ argv: this.command(), icon: appIcon })
        const current = existsSync(this.desktopFile) ? readFileSync(this.desktopFile, 'utf8') : ''
        if (current !== content) writeFileSync(this.desktopFile, content, { mode: 0o644 })
      } else rmSync(this.desktopFile, { force: true })
      return
    }
    const [exe, ...args] = this.command()
    app.setLoginItemSettings(
      this.platform === 'win32'
        ? { openAtLogin: enabled, path: exe, args }
        : { openAtLogin: enabled }
    )
  }

  /** True when this process was started by the OS at login. */
  startedAtLogin(argv = process.argv): boolean {
    if (argv.includes(HIDDEN_FLAG)) return true
    return this.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true
  }
}
