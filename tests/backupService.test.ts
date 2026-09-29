import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

vi.mock('electron', () => ({
  shell: { trashItem: (p: string) => rm(p, { recursive: true }) },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))

const { BackupService } = await import('../src/main/services/BackupService')
const { LibraryService } = await import('../src/main/services/LibraryService')
const { MetadataStore } = await import('../src/main/services/MetadataStore')
type DriveApi = import('../src/main/google/drive').DriveApi
type DriveItem = import('../src/main/google/drive').DriveItem

const md5 = (d: Uint8Array): string => createHash('md5').update(d).digest('hex')

/** In-memory Drive implementing the same contract as the REST client. */
class FakeDrive implements DriveApi {
  items = new Map<string, DriveItem & { data?: Uint8Array; source: string }>()
  seq = 0
  calls: string[] = []
  failNextUpload = false
  async account() {
    return { email: 'steve@example.com', name: 'Steve' }
  }
  async ensureAppFolder() {
    return 'app'
  }
  async listSource(source: string) {
    return [...this.items.values()].filter((i) => i.source === source)
  }
  async createFolder(source: string, path: string, name: string, parentId: string) {
    const id = `f${++this.seq}`
    this.items.set(id, { id, name, kind: 'folder', path, md5: '', size: 0, parentId, source })
    this.calls.push(`mkdir ${path || '/'}`)
    return id
  }
  async upload(
    source: string,
    path: string,
    parentId: string,
    file: { name: string; data: Uint8Array },
    kind: 'file' | 'meta' = 'file'
  ) {
    if (this.failNextUpload) {
      this.failNextUpload = false
      throw new Error('boom')
    }
    const id = `u${++this.seq}`
    this.items.set(id, {
      id,
      name: file.name,
      kind,
      path,
      md5: md5(file.data),
      size: file.data.byteLength,
      parentId,
      data: file.data,
      source
    })
    this.calls.push(`upload ${path}`)
    return { id, md5: md5(file.data) }
  }
  async updateContent(id: string, data: Uint8Array) {
    const it = this.items.get(id)!
    Object.assign(it, { data, md5: md5(data), size: data.byteLength })
    this.calls.push(`update ${it.path}`)
    return { md5: it.md5 }
  }
  async move(
    id: string,
    _s: string,
    path: string,
    name: string,
    _from: string | undefined,
    to: string
  ) {
    Object.assign(this.items.get(id)!, { path, name, parentId: to })
    this.calls.push(`move ${path}`)
  }
  async download(id: string) {
    return this.items.get(id)!.data!
  }
  folderUrl(id: string) {
    return `https://drive.google.com/drive/folders/${id}`
  }
  files() {
    return [...this.items.values()]
      .filter((i) => i.kind === 'file')
      .map((i) => i.path)
      .sort()
  }
}

const auth = {
  connected: true,
  login: async () => undefined,
  logout: async () => undefined,
  cancelLogin: () => undefined,
  accessToken: async () => 't',
  invalidate: () => undefined
}

describe('BackupService', () => {
  let root: string
  let data: string
  let drive: FakeDrive
  let lib: InstanceType<typeof LibraryService>
  let backup: InstanceType<typeof BackupService>

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cs-root-'))
    data = mkdtempSync(join(tmpdir(), 'cs-data-'))
    mkdirSync(join(root, 'Nether'))
    writeFileSync(join(root, 'a.png'), 'AAAA')
    writeFileSync(join(root, 'Nether', 'b.png'), 'BBBB')
    const meta = new MetadataStore(data)
    meta.setMeta(join(root, 'a.png'), { note: 'base principal', favorite: true })
    lib = new LibraryService(root, meta)
    await lib.refresh()
    drive = new FakeDrive()
    const settings = { value: { backupAuto: false } } as never
    backup = new BackupService(data, auth as never, drive, lib, meta, settings, () => true)
    await backup.connect()
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(data, { recursive: true, force: true })
  })

  it('connects, then uploads everything with folders and a metadata file', async () => {
    expect(backup.current.account?.email).toBe('steve@example.com')
    const s = (await backup.run())!
    expect([s.uploaded, s.skipped, s.failed]).toEqual([2, 0, 0])
    expect(drive.files()).toEqual(['Nether/b.png', 'a.png'])
    const metaFile = [...drive.items.values()].find((i) => i.kind === 'meta')!
    const doc = JSON.parse(Buffer.from(metaFile.data!).toString())
    expect(doc.screenshots.find((x: { path: string }) => x.path === 'a.png').meta.note).toBe(
      'base principal'
    )
    expect(backup.current.folderUrl).toMatch(/drive\.google\.com/)
    expect(backup.current.state).toBe('idle')
  })

  it('is incremental: a second run uploads nothing', async () => {
    await backup.run()
    drive.calls = []
    const s = (await backup.run())!
    expect([s.uploaded, s.skipped]).toEqual([0, 2])
    expect(drive.calls).toEqual([])
  })

  it('moves instead of re-uploading after a rename, and uploads edits as new revisions', async () => {
    await backup.run()
    drive.calls = []
    renameSync(join(root, 'a.png'), join(root, 'Nether', 'portal.png'))
    writeFileSync(join(root, 'Nether', 'b.png'), 'BBBB-editada')
    await lib.refresh()
    const s = (await backup.run())!
    expect([s.moved, s.updated, s.uploaded]).toEqual([1, 1, 0])
    expect(drive.files()).toEqual(['Nether/b.png', 'Nether/portal.png'])
  })

  it('never deletes from Drive and restores files missing locally', async () => {
    await backup.run()
    rmSync(join(root, 'Nether', 'b.png'))
    await lib.refresh()
    const s = (await backup.run())!
    expect(s.remoteOnly).toBe(1)
    expect(drive.files()).toContain('Nether/b.png')

    const r = await backup.restoreMissing()
    expect(r).toEqual({ restored: 1, failed: 0 })
    expect(readFileSync(join(root, 'Nether', 'b.png'), 'utf8')).toBe('BBBB')
  })

  it('reports per-file failures without aborting, and retries them next run', async () => {
    drive.failNextUpload = true
    const s = (await backup.run())!
    expect([s.uploaded, s.failed]).toEqual([1, 1])
    expect(s.errors[0]).toMatch(/boom/)
    const again = (await backup.run())!
    expect([again.uploaded, again.failed]).toEqual([1, 0])
  })

  it('refuses to restore paths that would escape the screenshots folder', async () => {
    await backup.run()
    const source = [...drive.items.values()][0].source
    drive.items.set('evil', {
      id: 'evil',
      name: 'evil.png',
      kind: 'file',
      path: '../evil.png',
      md5: '',
      size: 1,
      source,
      data: new Uint8Array([1])
    })
    rmSync(join(root, 'a.png'))
    await lib.refresh()
    const r = await backup.restoreMissing()
    expect(r.restored).toBe(1) // a.png comes back…
    expect(existsSync(join(root, 'a.png'))).toBe(true)
    expect(existsSync(join(root, '..', 'evil.png'))).toBe(false) // …the escaping path does not
  })
})
