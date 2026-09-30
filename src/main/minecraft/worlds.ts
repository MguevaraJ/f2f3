import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readNbt, type NbtCompound } from '@core/nbt/readNbt'

export interface SaveInfo {
  /** Folder under saves/. */
  folder: string
  /** Name shown in the game (level.dat → Data.LevelName). */
  name: string
}

/** ".minecraft" is the parent of the screenshots folder. */
export const savesDirFor = (screenshotsDir: string): string =>
  join(dirname(screenshotsDir), 'saves')

/** Singleplayer worlds, by folder and in-game name. */
export async function listSaves(savesDir: string): Promise<SaveInfo[]> {
  let folders: string[]
  try {
    folders = (await readdir(savesDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  const out: SaveInfo[] = []
  for (const folder of folders) {
    try {
      const nbt = readNbt(await readFile(join(savesDir, folder, 'level.dat')))
      const data = nbt.Data as NbtCompound | undefined
      out.push({ folder, name: typeof data?.LevelName === 'string' ? data.LevelName : folder })
    } catch {
      // Not a world (or unreadable): skip it.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Copies a structure where `/place template <id>` finds it in that world:
 * saves/<world>/generated/<ns>/structure/<path>.nbt (singular "structure" since 26.x).
 */
export async function installTemplate(
  savesDir: string,
  folder: string,
  templateId: string,
  source: string
): Promise<string> {
  const [ns, path] = templateId.split(':', 2)
  if (!/^[a-z0-9_.-]+$/.test(ns) || !/^[a-z0-9_./-]+$/.test(path) || path.includes('..'))
    throw new Error('Nombre de plantilla no válido.')
  if (folder.includes('/') || folder.includes('\\') || folder === '..' || folder === '.')
    throw new Error('Mundo no válido.')
  const dest = join(savesDir, folder, 'generated', ns, 'structure', `${path}.nbt`)
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(source, dest)
  return dest
}
