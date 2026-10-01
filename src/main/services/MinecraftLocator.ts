import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MinecraftSource } from '@shared/types'
import { findGameJars } from '@core/font/minecraftFont'
import {
  defaultMinecraftDir,
  detectInstalls,
  launcherRootOf,
  type LocatorEnv
} from '../minecraft/gameDirs'

/** Knows where launchers keep game folders on each platform. */
export class MinecraftLocator {
  private readonly env: LocatorEnv

  constructor(platform: NodeJS.Platform = process.platform) {
    this.env = { home: homedir(), platform, appData: process.env.APPDATA }
  }

  defaultMinecraftDir(): string {
    return defaultMinecraftDir(this.env)
  }

  /** For a first run: where the game was played last, or the official launcher's folder. */
  defaultScreenshotsDir(): string {
    return this.detectSources()[0]?.path ?? join(this.defaultMinecraftDir(), 'screenshots')
  }

  /** Every game folder we can find, most recently played first. */
  detectSources(): MinecraftSource[] {
    return detectInstalls(this.env)
  }

  /** The game folder a screenshots folder belongs to. */
  gameDirOf(screenshotsDir: string): string {
    return dirname(screenshotsDir)
  }

  /** Where the launcher of that game folder keeps versions/, or the best guess. */
  launcherRootOf(screenshotsDir: string): string {
    return launcherRootOf(this.gameDirOf(screenshotsDir)) ?? this.defaultMinecraftDir()
  }

  /** Best font source: a vanilla client jar of the launcher in use, or of any other one. */
  findFontSource(screenshotsDir: string): string | null {
    const roots = [
      this.launcherRootOf(screenshotsDir),
      this.defaultMinecraftDir(),
      ...this.detectSources().map((s) => launcherRootOf(s.gameDir ?? '') ?? '')
    ]
    for (const dir of new Set(roots.filter(Boolean))) {
      const jar = findGameJars(dir)[0]
      if (jar) return jar
    }
    return null
  }
}
