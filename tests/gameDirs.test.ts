import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectInstalls, launcherRootOf, screenshotsDirFor } from '../src/main/minecraft/gameDirs'

function touch(path: string, at?: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '')
  if (at) utimesSync(path, at / 1000, at / 1000)
}

function home(): string {
  const h = mkdtempSync(join(tmpdir(), 'f2f3-home-'))
  // Official launcher: launcher root and game folder are the same.
  touch(join(h, '.minecraft/options.txt'), Date.parse('2026-01-01'))
  touch(join(h, '.minecraft/screenshots/a.png'))
  mkdirSync(join(h, '.minecraft/versions'), { recursive: true })
  // SKLauncher: one game folder per instance, versions/ at the root.
  const sk = join(h, '.sklauncher')
  mkdirSync(join(sk, 'versions'), { recursive: true })
  touch(join(sk, 'instances/fabric-26-3/options.txt'))
  touch(join(sk, 'instances/fabric-26-3/mods/f2f3-companion-1.0.0+26.3.jar'))
  mkdirSync(join(sk, 'instances/never-played'), { recursive: true })
  touch(join(sk, 'instances/unlisted/options.txt'), Date.parse('2025-01-01'))
  writeFileSync(
    join(sk, 'instances.json'),
    JSON.stringify({
      instances: [
        {
          name: 'Fabric 26.3',
          directory: join(sk, 'instances/fabric-26-3'),
          minecraftVersion: '26.3',
          gameType: 'fabric',
          lastPlayed: '2030-01-01T00:00:00.000Z'
        },
        { name: 'Nunca', directory: join(sk, 'instances/never-played'), gameType: 'vanilla' }
      ]
    })
  )
  // Prism: the game folder is inside the instance.
  touch(join(h, '.local/share/PrismLauncher/instances/Pack/.minecraft/options.txt'), 1000)
  return h
}

describe('gameDirs', () => {
  it('finds game folders of every layout, most recently played first', () => {
    const h = home()
    const found = detectInstalls({ home: h, platform: 'linux' })
    expect(found.map((f) => f.label)).toEqual([
      'SKLauncher: Fabric 26.3',
      'Launcher oficial',
      'SKLauncher: unlisted',
      'Prism: Pack'
    ])
    expect(found[0]).toMatchObject({
      path: join(h, '.sklauncher/instances/fabric-26-3/screenshots'),
      gameDir: join(h, '.sklauncher/instances/fabric-26-3'),
      version: '26.3',
      loader: 'fabric',
      hasMod: true,
      count: 0
    })
    expect(found[1]).toMatchObject({ count: 1, hasMod: false })
    expect(found[3].gameDir).toBe(join(h, '.local/share/PrismLauncher/instances/Pack/.minecraft'))
  })

  it('finds the launcher root above an instance', () => {
    const h = home()
    expect(launcherRootOf(join(h, '.minecraft'))).toBe(join(h, '.minecraft'))
    expect(launcherRootOf(join(h, '.sklauncher/instances/fabric-26-3'))).toBe(
      join(h, '.sklauncher')
    )
    expect(
      launcherRootOf(join(h, '.local/share/PrismLauncher/instances/Pack/.minecraft'))
    ).toBeNull()
  })

  it('accepts a game folder, a screenshots folder or any folder', () => {
    const h = home()
    const game = join(h, '.sklauncher/instances/fabric-26-3')
    expect(screenshotsDirFor(game)).toBe(join(game, 'screenshots'))
    expect(screenshotsDirFor(join(game, 'screenshots'))).toBe(join(game, 'screenshots'))
    expect(screenshotsDirFor(join(h, '.sklauncher'))).toBe(join(h, '.sklauncher'))
  })
})
