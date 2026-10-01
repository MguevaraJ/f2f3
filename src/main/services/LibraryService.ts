import { EventEmitter } from 'node:events'
import { closeSync, existsSync, openSync, readSync, watch, type FSWatcher } from 'node:fs'
import { cp, mkdir, readdir, rename, stat, utimes } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { shell } from 'electron'
import type {
  ClipboardMode,
  FileOpResult,
  FolderNode,
  LibrarySnapshot,
  ScreenshotEntry
} from '@shared/types'
import { companionPathFor, sidecarPathsFor } from '@core/companion/parseCompanion'
import type { MetadataStore } from './MetadataStore'

const IMAGE_RE = /\.(png|jpe?g)$/i
const MAX_DEPTH = 8
const MC_NAME_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})\.(\d{2})/

/** The Companion sidecar's mtime is included: the mod may write it after the image. */
export const fingerprintOf = (size: number, mtimeMs: number, companionMtimeMs?: number): string =>
  `${size}-${Math.round(mtimeMs)}${companionMtimeMs === undefined ? '' : `-m${Math.round(companionMtimeMs)}`}`

export interface LibraryRoot {
  path: string
  label: string
}

interface Mount extends LibraryRoot {
  /** First segment of the ids inside this root; '' when it is the only root. */
  mount: string
}

const PICK_ROOT = 'Elige primero una de tus carpetas de juego'

/**
 * The screenshots folders as one library: scanning, watching and every file
 * operation (folders, rename, copy/cut/paste, delete to trash, import).
 * Ids are paths with forward slashes: relative to the root when there is one, and
 * prefixed with the root's mount name ("SKLauncher - Fabric 26.3/…") when there are
 * several. Every id coming from the renderer is resolved through `resolveId`, which
 * rejects traversal.
 */
export class LibraryService extends EventEmitter<{ changed: [LibrarySnapshot] }> {
  private mounts: Mount[]
  private watchers: FSWatcher[] = []
  private rescanTimer: NodeJS.Timeout | null = null
  private cache: LibrarySnapshot | null = null
  private scanning: Promise<LibrarySnapshot> | null = null

  constructor(
    roots: LibraryRoot[],
    private readonly metadata: MetadataStore
  ) {
    super()
    this.mounts = mountsFor(roots)
  }

  /** The first root. */
  get root(): string {
    return this.mounts[0].path
  }

  get roots(): readonly LibraryRoot[] {
    return this.mounts
  }

  setRoots(roots: LibraryRoot[]): void {
    this.mounts = mountsFor(roots)
    this.cache = null
    this.startWatching()
    void this.refresh()
  }

  async snapshot(): Promise<LibrarySnapshot> {
    return this.cache ?? this.refresh()
  }

  /** Rescans the folders. Concurrent callers share the same scan. */
  refresh(): Promise<LibrarySnapshot> {
    this.scanning ??= this.scan().finally(() => (this.scanning = null))
    return this.scanning.then((snap) => {
      this.cache = snap
      this.emit('changed', snap)
      return snap
    })
  }

  entry(id: string): ScreenshotEntry | undefined {
    return this.cache?.screenshots.find((s) => s.id === id)
  }

  /** The root an id is in and its path inside it. */
  private locate(id: string): { mount: Mount; rel: string[] } {
    const parts = id.split('/').filter(Boolean)
    if (this.mounts.length === 1) return { mount: this.mounts[0], rel: parts }
    const mount = this.mounts.find((m) => m.mount === parts[0])
    if (!mount) throw new Error(PICK_ROOT)
    return { mount, rel: parts.slice(1) }
  }

  /** Absolute path for an id, guaranteed to live inside one of the roots. */
  resolveId(id: string): string {
    const { mount, rel } = this.locate(id)
    const abs = resolve(mount.path, ...rel)
    if (abs !== mount.path && !abs.startsWith(mount.path + sep))
      throw new Error('Ruta fuera de la carpeta de capturas')
    return abs
  }

  /** The screenshots folder an id belongs to (the first one for the library's top). */
  rootOf(id: string): string {
    try {
      return this.locate(id).mount.path
    } catch {
      return this.root
    }
  }

  toId(abs: string): string {
    const mount =
      this.mounts.find((m) => abs === m.path || abs.startsWith(m.path + sep)) ?? this.mounts[0]
    const rel = relative(mount.path, abs).split(sep).join('/')
    return mount.mount ? (rel ? `${mount.mount}/${rel}` : mount.mount) : rel
  }

  /**
   * Path of an id in the backup: the first root keeps its bare paths, so adding a second
   * game folder does not upload everything again.
   */
  backupPath(id: string): string {
    const first = this.mounts[0].mount
    return first && id.startsWith(first + '/') ? id.slice(first.length + 1) : id
  }

  /** The id a backup path restores to. */
  idOfBackupPath(path: string): string {
    const first = this.mounts[0].mount
    if (!first) return path
    const top = path.split('/')[0]
    return this.mounts.some((m, i) => i > 0 && m.mount === top) ? path : `${first}/${path}`
  }

  startWatching(): void {
    for (const w of this.watchers) w.close()
    this.watchers = []
    for (const { path } of this.mounts) {
      if (!existsSync(path)) continue
      try {
        const watcher = watch(path, { recursive: true }, () => this.scheduleRescan())
        watcher.on('error', () => watcher.close())
        this.watchers.push(watcher)
      } catch {
        /* recursive watch unsupported: manual refresh still works */
      }
    }
  }

  dispose(): void {
    for (const w of this.watchers) w.close()
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
  }

  /** The library's top, or with several roots one of the game folders themselves. */
  private isTop(id: string): boolean {
    return !id || (this.mounts.length > 1 && !id.includes('/'))
  }

  // ───────────────────────────── file operations ─────────────────────────────

  async createFolder(parent: string, name: string): Promise<FileOpResult> {
    return this.op(async () => {
      const dir = join(this.resolveId(parent), validName(name))
      if (existsSync(dir)) throw new Error(`Ya existe "${basename(dir)}"`)
      await mkdir(dir)
      return [this.toId(dir)]
    })
  }

  async rename(id: string, newName: string): Promise<FileOpResult> {
    return this.op(async () => {
      if (this.isTop(id)) throw new Error('No se puede renombrar una carpeta de juego')
      const from = this.resolveId(id)
      const isDir = (await stat(from)).isDirectory()
      let name = validName(newName)
      if (!isDir && !IMAGE_RE.test(name)) name += extname(from)
      const to = join(dirname(from), name)
      if (to === from) return [id]
      if (existsSync(to) && to.toLowerCase() !== from.toLowerCase())
        throw new Error(`Ya existe "${name}"`)
      await rename(from, to)
      if (!isDir) await withSidecar(from, to, rename)
      this.metadata.move(from, to)
      return [this.toId(to)]
    })
  }

  async remove(ids: string[]): Promise<FileOpResult> {
    return this.op(async () => {
      const done: string[] = []
      for (const id of ids) {
        if (this.isTop(id)) throw new Error('No se puede eliminar una carpeta de juego')
        const abs = this.resolveId(id)
        await shell.trashItem(abs)
        await withSidecar(abs, null, (p) => shell.trashItem(p))
        this.metadata.remove(abs)
        done.push(id)
      }
      return done
    })
  }

  async paste(ids: string[], targetFolder: string, mode: ClipboardMode): Promise<FileOpResult> {
    return this.op(async () => {
      const target = this.resolveId(targetFolder)
      const out: string[] = []
      for (const id of ids) {
        const from = this.resolveId(id)
        if (target === from || target.startsWith(from + sep))
          throw new Error('No se puede pegar una carpeta dentro de sí misma')
        if (mode === 'cut' && dirname(from) === target) {
          out.push(id)
          continue
        }
        const to = uniquePath(join(target, basename(from)))
        if (mode === 'cut') {
          await moveAcrossDevices(from, to)
          await withSidecar(from, to, moveAcrossDevices)
          this.metadata.move(from, to)
        } else {
          await copyPreservingTimes(from, to)
          await withSidecar(from, to, copyPreservingTimes)
          this.metadata.copy(from, to)
        }
        out.push(this.toId(to))
      }
      return out
    })
  }

  async importFiles(paths: string[], targetFolder: string): Promise<FileOpResult> {
    return this.op(async () => {
      const target = this.resolveId(targetFolder)
      const out: string[] = []
      for (const p of paths) {
        const st = await stat(p)
        if (!st.isDirectory() && !IMAGE_RE.test(p)) continue
        const to = uniquePath(join(target, basename(p)))
        await copyPreservingTimes(p, to)
        if (!st.isDirectory()) await withSidecar(p, to, copyPreservingTimes)
        out.push(this.toId(to))
      }
      if (!out.length) throw new Error('No se encontraron imágenes para importar')
      return out
    })
  }

  // ─────────────────────────────── internals ────────────────────────────────

  private async op(fn: () => Promise<string[]>): Promise<FileOpResult> {
    try {
      const ids = await fn()
      await this.refresh()
      return { ok: true, ids, errors: [] }
    } catch (err) {
      await this.refresh()
      return { ok: false, ids: [], errors: [err instanceof Error ? err.message : String(err)] }
    }
  }

  private scheduleRescan(): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
    this.rescanTimer = setTimeout(() => void this.refresh(), 350)
  }

  private async scan(): Promise<LibrarySnapshot> {
    const many = this.mounts.length > 1
    const rootNode: FolderNode = {
      path: '',
      name: many ? 'Carpetas de juego' : 'screenshots',
      count: 0,
      children: []
    }
    const screenshots: ScreenshotEntry[] = []
    const roots = this.mounts.map((m) => ({ ...m, exists: existsSync(m.path) }))

    const walk = async (
      dir: string,
      node: FolderNode,
      depth: number,
      source: string
    ): Promise<void> => {
      let dirents
      try {
        dirents = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const d of dirents) {
        if (d.name.startsWith('.')) continue
        const abs = join(dir, d.name)
        if (d.isDirectory() && depth < MAX_DEPTH) {
          const child: FolderNode = { path: this.toId(abs), name: d.name, count: 0, children: [] }
          node.children.push(child)
          await walk(abs, child, depth + 1, source)
        } else if (d.isFile() && IMAGE_RE.test(d.name)) {
          const entry = await this.buildEntry(abs, node.path, source)
          if (entry) {
            screenshots.push(entry)
            node.count++
          }
        }
      }
      node.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    }
    for (const root of roots) {
      if (!many) {
        if (root.exists) await walk(root.path, rootNode, 0, '')
        continue
      }
      // Each game folder is a folder of the library, even before its first screenshot.
      const node: FolderNode = { path: root.mount, name: root.label, count: 0, children: [] }
      rootNode.children.push(node)
      if (root.exists) await walk(root.path, node, 0, root.mount)
    }
    screenshots.sort((a, b) => b.capturedAt - a.capturedAt)
    return {
      root: this.root,
      rootExists: roots.some((r) => r.exists),
      roots,
      folders: rootNode,
      screenshots
    }
  }

  private async buildEntry(
    abs: string,
    folder: string,
    source: string
  ): Promise<ScreenshotEntry | null> {
    try {
      const st = await stat(abs)
      const name = basename(abs)
      const stored = this.metadata.analysis(abs)
      const companionMtimeMs = await stat(companionPathFor(abs)).then(
        (s) => s.mtimeMs,
        () => undefined
      )
      const fingerprint = fingerprintOf(st.size, st.mtimeMs, companionMtimeMs)
      const { width, height } = readImageSize(abs)
      return {
        id: this.toId(abs),
        name,
        folder,
        size: st.size,
        mtimeMs: st.mtimeMs,
        companionMtimeMs,
        capturedAt: capturedAtFromName(name) ?? st.mtimeMs,
        width,
        height,
        analysis: stored?.fingerprint === fingerprint ? stored : null,
        meta: this.metadata.meta(abs),
        ...(source ? { source } : {})
      }
    } catch {
      return null
    }
  }
}

/** One root keeps bare ids; several get a unique folder-safe name each, from their label. */
function mountsFor(roots: LibraryRoot[]): Mount[] {
  const list = roots.map((r) => ({ ...r, path: resolve(r.path) }))
  if (list.length <= 1) return list.map((r) => ({ ...r, mount: '' }))
  const used = new Set<string>()
  return list.map((r) => {
    const base =
      r.label
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' -')
        .replace(/\s+/g, ' ')
        .trim() || 'Minecraft'
    let mount = base
    for (let i = 2; used.has(mount.toLowerCase()); i++) mount = `${base} (${i})`
    used.add(mount.toLowerCase())
    return { ...r, mount }
  })
}

function validName(name: string): string {
  const clean = name.trim()
  // Reject separators, characters Windows forbids and control characters.
  // eslint-disable-next-line no-control-regex
  if (!clean || clean === '.' || clean === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(clean))
    throw new Error('Nombre no válido')
  return clean
}

function uniquePath(path: string): string {
  if (!existsSync(path)) return path
  const ext = extname(path)
  const base = path.slice(0, path.length - ext.length).replace(/ \(\d+\)$/, '')
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`
    if (!existsSync(candidate)) return candidate
  }
}

/**
 * Applies the same operation to the Companion mod sidecar of an image, when it has one,
 * so the exact game data follows the screenshot.
 */
async function withSidecar(
  from: string,
  to: string | null,
  fn: (from: string, to: string) => Promise<void>
): Promise<void> {
  if (!IMAGE_RE.test(from)) return
  const dsts = to ? sidecarPathsFor(to) : []
  for (const [i, src] of sidecarPathsFor(from).entries()) {
    if (!existsSync(src)) continue
    const dst = dsts[i] ?? ''
    if (to && existsSync(dst) && dst.toLowerCase() !== src.toLowerCase()) continue
    await fn(src, dst)
  }
}

async function copyPreservingTimes(from: string, to: string): Promise<void> {
  await cp(from, to, {
    recursive: true,
    preserveTimestamps: true,
    errorOnExist: true,
    force: false
  })
  const st = await stat(from)
  await utimes(to, st.atime, st.mtime)
}

async function moveAcrossDevices(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyPreservingTimes(from, to)
    await shell.trashItem(from)
  }
}

/** Minecraft names screenshots "YYYY-MM-DD_HH.MM.SS.png" in local time. */
export function capturedAtFromName(name: string): number | null {
  const m = MC_NAME_RE.exec(name)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  const t = new Date(y, mo - 1, d, h, mi, s).getTime()
  return Number.isFinite(t) ? t : null
}

/** Reads width/height from the PNG IHDR or JPEG SOF header without decoding the image. */
export function readImageSize(path: string): { width: number; height: number } {
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(64 * 1024)
    const n = readSync(fd, head, 0, head.length, 0)
    if (head.readUInt32BE(0) === 0x89504e47)
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
    // JPEG: walk markers until a SOFn segment.
    let i = 2
    while (i + 9 < n) {
      if (head[i] !== 0xff) break
      const marker = head[i + 1]
      const len = head.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { height: head.readUInt16BE(i + 5), width: head.readUInt16BE(i + 7) }
      i += 2 + len
    }
    return { width: 0, height: 0 }
  } finally {
    closeSync(fd)
  }
}
