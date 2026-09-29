import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { MinecraftSource } from '@shared/types'
import { findGameJars } from '@core/font/minecraftFont'

/** Knows where launchers keep game folders on each platform. */
export class MinecraftLocator {
  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  defaultMinecraftDir(): string {
    const home = homedir()
    switch (this.platform) {
      case 'win32':
        return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), '.minecraft')
      case 'darwin':
        return join(home, 'Library', 'Application Support', 'minecraft')
      default:
        return join(home, '.minecraft')
    }
  }

  defaultScreenshotsDir(): string {
    return join(this.defaultMinecraftDir(), 'screenshots')
  }

  /** Every screenshots folder we can find: vanilla launcher plus common third-party launchers. */
  detectSources(): MinecraftSource[] {
    const home = homedir()
    const mc = this.defaultMinecraftDir()
    const found: MinecraftSource[] = []
    const add = (label: string, path: string): void => {
      if (!existsSync(path) || found.some((f) => f.path === path)) return
      found.push({ label, path, count: countImages(path) })
    }
    add('Launcher oficial', join(mc, 'screenshots'))

    const instanceRoots: [string, string][] = [
      ['Instancias', join(mc, 'instances')],
      ['Prism', join(home, '.local', 'share', 'PrismLauncher', 'instances')],
      ['Prism', join(process.env.APPDATA ?? '', 'PrismLauncher', 'instances')],
      ['Prism', join(home, 'Library', 'Application Support', 'PrismLauncher', 'instances')],
      ['MultiMC', join(home, '.local', 'share', 'multimc', 'instances')],
      ['CurseForge', join(home, 'curseforge', 'minecraft', 'Instances')],
      ['Modrinth', join(home, '.local', 'share', 'ModrinthApp', 'profiles')],
      ['Modrinth', join(process.env.APPDATA ?? '', 'ModrinthApp', 'profiles')]
    ]
    for (const [label, root] of instanceRoots) {
      for (const inst of safeReaddir(root)) {
        add(`${label}: ${inst}`, join(root, inst, 'screenshots'))
        add(`${label}: ${inst}`, join(root, inst, '.minecraft', 'screenshots'))
        add(`${label}: ${inst}`, join(root, inst, 'minecraft', 'screenshots'))
      }
    }
    return found
  }

  /** Best font source: a vanilla client jar next to the screenshots folder, or the default install. */
  findFontSource(screenshotsDir: string): string | null {
    const candidates = [join(screenshotsDir, '..'), this.defaultMinecraftDir()]
    for (const dir of candidates) {
      const jar = findGameJars(dir)[0]
      if (jar) return jar
    }
    return null
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory())
  } catch {
    return []
  }
}

function countImages(dir: string): number {
  try {
    return readdirSync(dir).filter((n) => /\.(png|jpe?g)$/i.test(basename(n))).length
  } catch {
    return 0
  }
}
