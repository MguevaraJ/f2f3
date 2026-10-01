import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readNbt, type NbtCompound } from '@core/nbt/readNbt'
import { tr } from '@shared/i18n'

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

/** First data version (1.21) whose data folders are singular: "structure", not "structures". */
const DATA_VERSION_1_21 = 3953

/** The version the world was last saved with (level.dat → Data.DataVersion); newest when unknown. */
async function worldDataVersion(worldDir: string): Promise<number> {
  try {
    const data = readNbt(await readFile(join(worldDir, 'level.dat'))).Data as
      NbtCompound | undefined
    return typeof data?.DataVersion === 'number' ? data.DataVersion : Infinity
  } catch {
    return Infinity
  }
}

/**
 * Copies a structure where `/place template <id>` finds it in that world:
 * saves/<world>/generated/<ns>/structure/<path>.nbt ("structures" in worlds older than 1.21).
 */
export async function installTemplate(
  savesDir: string,
  folder: string,
  templateId: string,
  source: string
): Promise<string> {
  const [ns, path] = templateId.split(':', 2)
  if (!/^[a-z0-9_.-]+$/.test(ns) || !/^[a-z0-9_./-]+$/.test(path) || path.includes('..'))
    throw new Error(tr('Nombre de plantilla no válido.'))
  if (folder.includes('/') || folder.includes('\\') || folder === '..' || folder === '.')
    throw new Error(tr('Mundo no válido.'))
  const dir =
    (await worldDataVersion(join(savesDir, folder))) < DATA_VERSION_1_21
      ? 'structures'
      : 'structure'
  const dest = join(savesDir, folder, 'generated', ns, dir, `${path}.nbt`)
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(source, dest)
  return dest
}
