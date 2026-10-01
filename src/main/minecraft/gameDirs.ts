import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { MinecraftSource } from '@shared/types'

/**
 * Where people actually play. Launchers lay their folders out in two ways:
 *  - the official one: ".minecraft" is both the launcher's root (versions/, assets/) and
 *    the game folder (screenshots/, saves/, mods/, options.txt);
 *  - instance launchers (SKLauncher, Prism, Modrinth, CurseForge…): one game folder per
 *    instance, with versions/ and assets/ kept a few levels above.
 * Everything in the app hangs from the game folder (the parent of the screenshots folder),
 * so finding the right one is all the user has to get right.
 */

export interface LocatorEnv {
  home: string
  platform: NodeJS.Platform
  /** %APPDATA% on Windows. */
  appData?: string
}

/** How far above a game folder its launcher keeps versions/. */
const MAX_ROOT_DEPTH = 4
const MOD_JAR = /^f2f3-companion.*\.jar$/i
const IMAGE = /\.(png|jpe?g)$/i

export function defaultMinecraftDir(env: LocatorEnv): string {
  switch (env.platform) {
    case 'win32':
      return join(env.appData ?? join(env.home, 'AppData', 'Roaming'), '.minecraft')
    case 'darwin':
      return join(env.home, 'Library', 'Application Support', 'minecraft')
    default:
      return join(env.home, '.minecraft')
  }
}

/** A folder the game has run in: it leaves options.txt, saves/ or screenshots/ behind. */
export function looksLikeGameDir(dir: string): boolean {
  return ['options.txt', 'saves', 'screenshots'].some((n) => existsSync(join(dir, n)))
}

/** The launcher folder that holds versions/ for a game folder (itself, for the official launcher). */
export function launcherRootOf(gameDir: string): string | null {
  let dir = gameDir
  for (let i = 0; i <= MAX_ROOT_DEPTH; i++) {
    if (existsSync(join(dir, 'versions'))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return null
}

/**
 * The screenshots folder for whatever folder the user picked: a screenshots folder
 * itself, a game folder (even one that has no screenshots yet), or any folder of images.
 */
export function screenshotsDirFor(picked: string): string {
  if (basename(picked).toLowerCase() === 'screenshots') return picked
  if (looksLikeGameDir(picked) || existsSync(join(picked, 'mods')))
    return join(picked, 'screenshots')
  return picked
}

interface Candidate {
  launcher: string
  name: string
  gameDir: string
  version?: string
  loader?: string
  lastPlayed?: number
}

/** Every place the game has been played in, most recently used first. */
export function detectInstalls(env: LocatorEnv): MinecraftSource[] {
  const { home } = env
  const appData = env.appData ?? ''
  const support = join(home, 'Library', 'Application Support')
  const share = join(home, '.local', 'share')
  const candidates: Candidate[] = []

  const official = defaultMinecraftDir(env)
  candidates.push({ launcher: 'Launcher oficial', name: 'Minecraft', gameDir: official })

  for (const root of [
    join(home, '.sklauncher'),
    appData && join(appData, '.sklauncher'),
    join(support, 'sklauncher')
  ])
    if (root) candidates.push(...skLauncherInstances(root))

  // [launcher, folder of instances]; the game folder is the instance or a folder inside it.
  const instanceRoots: [string, string][] = [
    ['Instancia', join(official, 'instances')],
    ['Prism', join(share, 'PrismLauncher', 'instances')],
    ['Prism', appData && join(appData, 'PrismLauncher', 'instances')],
    ['Prism', join(support, 'PrismLauncher', 'instances')],
    ['Prism', join(home, '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances')],
    ['MultiMC', join(share, 'multimc', 'instances')],
    ['CurseForge', join(home, 'curseforge', 'minecraft', 'Instances')],
    ['CurseForge', join(home, 'Documents', 'curseforge', 'minecraft', 'Instances')],
    ['Modrinth', join(share, 'ModrinthApp', 'profiles')],
    ['Modrinth', join(share, 'com.modrinth.theseus', 'profiles')],
    ['Modrinth', appData && join(appData, 'ModrinthApp', 'profiles')],
    ['Modrinth', appData && join(appData, 'com.modrinth.theseus', 'profiles')],
    ['Modrinth', join(support, 'ModrinthApp', 'profiles')],
    ['ATLauncher', join(share, 'atlauncher', 'instances')],
    ['ATLauncher', appData && join(appData, 'ATLauncher', 'instances')],
    ['GDLauncher', appData && join(appData, 'gdlauncher_carbon', 'data', 'instances')],
    ['GDLauncher', join(share, 'gdlauncher_carbon', 'data', 'instances')]
  ].filter((r): r is [string, string] => !!r[1])
  for (const [launcher, root] of instanceRoots) {
    for (const name of subfolders(root)) {
      const inst = join(root, name)
      const gameDir =
        [join(inst, '.minecraft'), join(inst, 'minecraft'), join(inst, 'instance')].find(
          existsSync
        ) ?? inst
      candidates.push({ launcher, name, gameDir })
    }
  }

  const seen = new Set<string>()
  const found: MinecraftSource[] = []
  for (const c of candidates) {
    if (seen.has(c.gameDir) || !looksLikeGameDir(c.gameDir)) continue
    seen.add(c.gameDir)
    const path = join(c.gameDir, 'screenshots')
    found.push({
      label: c.launcher === 'Launcher oficial' ? c.launcher : `${c.launcher}: ${c.name}`,
      path,
      count: countImages(path),
      launcher: c.launcher,
      name: c.name,
      gameDir: c.gameDir,
      version: c.version,
      loader: c.loader,
      lastUsed: Math.max(
        c.lastPlayed ?? 0,
        mtime(join(c.gameDir, 'options.txt')),
        mtime(path),
        mtime(join(c.gameDir, 'saves'))
      ),
      hasMod: subfiles(join(c.gameDir, 'mods')).some((n) => MOD_JAR.test(n))
    })
  }
  return found.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
}

/** SKLauncher keeps its instances (name, version, folder) in instances.json. */
function skLauncherInstances(root: string): Candidate[] {
  const out: Candidate[] = []
  const listed = new Set<string>()
  try {
    const data = JSON.parse(readFileSync(join(root, 'instances.json'), 'utf8')) as {
      instances?: Record<string, unknown>[]
    }
    for (const i of data.instances ?? []) {
      if (typeof i.directory !== 'string') continue
      listed.add(i.directory)
      const version = typeof i.minecraftVersion === 'string' ? i.minecraftVersion : undefined
      const played = typeof i.lastPlayed === 'string' ? Date.parse(i.lastPlayed) : NaN
      out.push({
        launcher: 'SKLauncher',
        name: typeof i.name === 'string' ? i.name.trim() : basename(i.directory),
        gameDir: i.directory,
        // "latest-release" is a channel, not a version.
        version: version && /^\d/.test(version) ? version : undefined,
        loader: typeof i.gameType === 'string' && i.gameType !== 'vanilla' ? i.gameType : undefined,
        lastPlayed: Number.isFinite(played) ? played : undefined
      })
    }
  } catch {
    /* no list: fall back to the folders */
  }
  for (const name of subfolders(join(root, 'instances'))) {
    const gameDir = join(root, 'instances', name)
    if (!listed.has(gameDir)) out.push({ launcher: 'SKLauncher', name, gameDir })
  }
  return out
}

function subfolders(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
}

function subfiles(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function countImages(dir: string): number {
  return subfiles(dir).filter((n) => IMAGE.test(n)).length
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}
