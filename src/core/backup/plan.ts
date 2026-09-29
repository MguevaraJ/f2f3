/**
 * Pure backup planning: compares the local screenshots folder with what the
 * app already stored in Google Drive and decides the minimal set of actions.
 *
 * Rules:
 *  - identical path + content          → skip
 *  - same path, different content      → update (new revision of the Drive file)
 *  - content already in Drive at a path that no longer exists locally
 *                                       → move/rename that file (no re-upload)
 *  - anything else                      → upload
 *  - files only in Drive are kept: a backup never deletes.
 */

export interface LocalFile {
  /** Path relative to the screenshots root, forward slashes. */
  path: string
  size: number
  md5: string
}

export interface RemoteFile {
  id: string
  path: string
  md5: string
  size: number
}

export type BackupAction =
  | { kind: 'upload'; local: LocalFile }
  | { kind: 'update'; local: LocalFile; remote: RemoteFile }
  | { kind: 'move'; local: LocalFile; remote: RemoteFile }
  | { kind: 'skip'; local: LocalFile; remote: RemoteFile }

export interface BackupPlan {
  actions: BackupAction[]
  /** Folders (relative, '' = root) that must exist in Drive, parents first. */
  folders: string[]
  /** Drive files with no local counterpart after moves are matched. */
  remoteOnly: RemoteFile[]
}

export const folderOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

export function planBackup(local: LocalFile[], remote: RemoteFile[]): BackupPlan {
  const byPath = new Map(remote.map((r) => [r.path, r]))
  const localPaths = new Set(local.map((l) => l.path))
  // Candidates for moves: remote files whose path vanished locally, grouped by content.
  const orphansByMd5 = new Map<string, RemoteFile[]>()
  for (const r of remote) {
    if (localPaths.has(r.path)) continue
    const list = orphansByMd5.get(r.md5) ?? []
    list.push(r)
    orphansByMd5.set(r.md5, list)
  }

  const used = new Set<string>()
  const actions: BackupAction[] = []
  for (const l of [...local].sort((a, b) => a.path.localeCompare(b.path))) {
    const same = byPath.get(l.path)
    if (same) {
      used.add(same.id)
      actions.push(
        same.md5 === l.md5
          ? { kind: 'skip', local: l, remote: same }
          : { kind: 'update', local: l, remote: same }
      )
      continue
    }
    const orphan = orphansByMd5.get(l.md5)?.find((r) => !used.has(r.id))
    if (orphan) {
      used.add(orphan.id)
      actions.push({ kind: 'move', local: l, remote: orphan })
    } else actions.push({ kind: 'upload', local: l })
  }

  const folders = new Set<string>([''])
  for (const l of local) {
    let f = folderOf(l.path)
    while (f && !folders.has(f)) {
      folders.add(f)
      f = folderOf(f)
    }
  }

  return {
    actions,
    folders: [...folders].sort(
      (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)
    ),
    remoteOnly: remote.filter((r) => !used.has(r.id))
  }
}

/**
 * Name of the Drive folder for a screenshots root: "minecraft" for the default
 * install, the instance name for launcher instances (…/Fabric 1.21/.minecraft/screenshots).
 */
export function sourceName(root: string): string {
  const parts = root.replace(/\\/g, '/').split('/').filter(Boolean)
  const i = parts.length - 1
  const isMc = (s: string | undefined): boolean => !!s && /^\.?minecraft$/i.test(s)
  if (parts[i] !== 'screenshots') return parts[i] ?? 'capturas'
  if (isMc(parts[i - 1])) {
    const owner = parts[i - 2]
    const isHome =
      !owner ||
      parts[i - 3] === 'home' ||
      parts[i - 3] === 'Users' ||
      owner === 'Roaming' ||
      owner === 'Application Support'
    return isHome ? 'minecraft' : owner
  }
  return parts[i - 1] ?? 'capturas'
}
