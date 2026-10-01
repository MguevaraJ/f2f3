import {
  mkdirSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  statSync,
  utimesSync
} from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { PNG } from 'pngjs'

// LibraryService sends deletions to the OS trash through Electron; emulate it on disk.
vi.mock('electron', () => ({ shell: { trashItem: (p: string) => rm(p, { recursive: true }) } }))

const { LibraryService, capturedAtFromName, readImageSize } =
  await import('../src/main/services/LibraryService')
const { MetadataStore } = await import('../src/main/services/MetadataStore')

function png(path: string, w = 4, h = 3): void {
  const img = new PNG({ width: w, height: h })
  writeFileSync(path, PNG.sync.write(img))
}

describe('LibraryService file operations', () => {
  let root: string
  let data: string
  let lib: InstanceType<typeof LibraryService>
  let meta: InstanceType<typeof MetadataStore>

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'craftshot-root-'))
    data = mkdtempSync(join(tmpdir(), 'craftshot-data-'))
    png(join(root, '2026-09-20_05.19.44.png'), 1918, 1078)
    png(join(root, 'other.png'))
    meta = new MetadataStore(data)
    lib = new LibraryService([{ path: root, label: 'Juego' }], meta)
    await lib.refresh()
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(data, { recursive: true, force: true })
  })

  it('scans images with size, dimensions and capture time from the name', async () => {
    const snap = await lib.snapshot()
    expect(snap.screenshots).toHaveLength(2)
    const mc = snap.screenshots.find((s) => s.name.startsWith('2026'))!
    expect([mc.width, mc.height]).toEqual([1918, 1078])
    expect(new Date(mc.capturedAt).getHours()).toBe(5)
  })

  it('creates folders and rejects invalid or duplicate names', async () => {
    expect((await lib.createFolder('', 'Bases')).ok).toBe(true)
    expect((await lib.createFolder('', 'Bases')).ok).toBe(false)
    expect((await lib.createFolder('', '../escape')).ok).toBe(false)
    expect((await lib.snapshot()).folders.children.map((c) => c.name)).toEqual(['Bases'])
  })

  it('copies (keeping timestamps) and cuts without overwriting, carrying metadata', async () => {
    await lib.createFolder('', 'Bases')
    meta.setMeta(join(root, 'other.png'), { favorite: true, note: 'granja' })
    const mtime = statSync(join(root, 'other.png')).mtimeMs

    const copy = await lib.paste(['other.png'], 'Bases', 'copy')
    expect(copy.ids).toEqual(['Bases/other.png'])
    expect(Math.round(statSync(join(root, 'Bases/other.png')).mtimeMs)).toBe(Math.round(mtime))
    expect(meta.meta(join(root, 'Bases/other.png')).note).toBe('granja')

    const again = await lib.paste(['other.png'], 'Bases', 'copy')
    expect(again.ids).toEqual(['Bases/other (2).png'])

    // Name taken: never overwrite, pick the next free name instead.
    const cut = await lib.paste(['other.png'], 'Bases', 'cut')
    expect(cut.ids).toEqual(['Bases/other (3).png'])
    expect(existsSync(join(root, 'other.png'))).toBe(false)
    expect(meta.meta(join(root, 'Bases/other (3).png')).favorite).toBe(true)
  })

  it('moves to a free name and re-keys metadata; renames keep the extension', async () => {
    await lib.createFolder('', 'Nether')
    meta.setMeta(join(root, 'other.png'), { favorite: true })
    const cut = await lib.paste(['other.png'], 'Nether', 'cut')
    expect(cut.ids).toEqual(['Nether/other.png'])
    expect(existsSync(join(root, 'other.png'))).toBe(false)
    expect(meta.meta(join(root, 'Nether/other.png')).favorite).toBe(true)

    const renamed = await lib.rename('Nether/other.png', 'portal')
    expect(renamed.ids).toEqual(['Nether/portal.png'])
    expect(meta.meta(join(root, 'Nether/portal.png')).favorite).toBe(true)
  })

  it('refuses to paste a folder into itself and to escape the root', async () => {
    await lib.createFolder('', 'A')
    expect((await lib.paste(['A'], 'A', 'cut')).ok).toBe(false)
    expect(() => lib.resolveId('../../etc/passwd')).toThrow()
  })

  it('carries the Companion mod sidecar through rename, copy, cut and delete', async () => {
    const side = (name: string): string => join(root, name.replace(/\.png$/, '.craftshot.json'))
    writeFileSync(side('2026-09-20_05.19.44.png'), '{}')
    await lib.refresh()
    // The gallery ignores the .json; the fingerprint includes its mtime.
    const snap = await lib.snapshot()
    expect(snap.screenshots).toHaveLength(2)
    const mc = snap.screenshots.find((s) => s.name.startsWith('2026'))!
    expect(mc.companionMtimeMs).toBeGreaterThan(0)

    await lib.createFolder('', 'Bases')
    expect((await lib.rename('2026-09-20_05.19.44.png', 'aldea')).ok).toBe(true)
    expect(existsSync(side('aldea.png'))).toBe(true)
    expect(existsSync(side('2026-09-20_05.19.44.png'))).toBe(false)

    await lib.paste(['aldea.png'], 'Bases', 'copy')
    expect(existsSync(join(root, 'Bases', 'aldea.craftshot.json'))).toBe(true)
    await lib.paste(['aldea.png'], 'Bases', 'cut')
    // Name taken in Bases: the image becomes "aldea (2).png" and its sidecar follows.
    expect(existsSync(join(root, 'Bases', 'aldea (2).craftshot.json'))).toBe(true)
    expect(existsSync(side('aldea.png'))).toBe(false)

    await lib.remove(['Bases/aldea.png'])
    expect(existsSync(join(root, 'Bases', 'aldea.craftshot.json'))).toBe(false)
  })

  it('deletes files and folders (to trash)', async () => {
    await lib.createFolder('', 'Old')
    await lib.paste(['other.png'], 'Old', 'cut')
    expect((await lib.remove(['Old'])).ok).toBe(true)
    expect((await lib.snapshot()).screenshots).toHaveLength(1)
  })
  it('shows several game folders as one library', async () => {
    const other = mkdtempSync(join(tmpdir(), 'craftshot-root2-'))
    mkdirSync(join(other, 'mundo'))
    png(join(other, 'mundo', 'b.png'))
    lib.setRoots([
      { path: root, label: 'Launcher oficial' },
      { path: other, label: 'SKLauncher: Fabric 26.3' }
    ])
    const snap = await lib.refresh()
    const mount = 'SKLauncher - Fabric 26.3'
    expect(snap.roots.map((r) => r.mount)).toEqual(['Launcher oficial', mount])
    expect(snap.folders.children.map((c) => c.name)).toEqual([
      'Launcher oficial',
      'SKLauncher: Fabric 26.3'
    ])
    const b = snap.screenshots.find((s) => s.name === 'b.png')!
    expect(b).toMatchObject({ id: `${mount}/mundo/b.png`, folder: `${mount}/mundo`, source: mount })
    expect(lib.resolveId(b.id)).toBe(join(other, 'mundo', 'b.png'))
    expect(lib.rootOf(b.id)).toBe(other)
    expect(lib.toId(join(root, 'other.png'))).toBe('Launcher oficial/other.png')
    // Not inside any game folder, and no escaping from one.
    expect(() => lib.resolveId('')).toThrow()
    expect(() => lib.resolveId(`${mount}/../x.png`)).toThrow()
    expect((await lib.remove([mount])).ok).toBe(false)
    expect((await lib.createFolder('', 'nueva')).ok).toBe(false)
    // The first folder keeps its bare paths in the backup.
    expect(lib.backupPath('Launcher oficial/other.png')).toBe('other.png')
    expect(lib.backupPath(b.id)).toBe(b.id)
    expect(lib.idOfBackupPath('other.png')).toBe('Launcher oficial/other.png')
    expect(lib.idOfBackupPath(b.id)).toBe(b.id)
    rmSync(other, { recursive: true, force: true })
  })
})

describe('file helpers', () => {
  it('parses Minecraft screenshot names as local time', () => {
    const t = capturedAtFromName('2026-09-24_23.03.51.png')!
    const d = new Date(t)
    expect([
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds()
    ]).toEqual([2026, 8, 24, 23, 3, 51])
    expect(capturedAtFromName('holiday.png')).toBeNull()
  })

  it('reads PNG dimensions from the header', () => {
    const dir = mkdtempSync(join(tmpdir(), 'craftshot-'))
    const p = join(dir, 'x.png')
    png(p, 320, 180)
    utimesSync(p, new Date(), new Date())
    expect(readImageSize(p)).toEqual({ width: 320, height: 180 })
    rmSync(dir, { recursive: true })
  })
})
