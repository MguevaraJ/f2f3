import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { mergeGamePlans } from '@shared/gamePlans'

export const plansFileOf = (gameDir: string): string => join(gameDir, 'craftshot', 'plans.json')

/** Whether the folder is one the game runs from (the mod reads the plans from there). */
export const isGameDir = (dir: string): boolean =>
  existsSync(join(dir, 'saves')) || existsSync(join(dir, 'options.txt'))

/**
 * Patches one world's plans in "<game dir>/craftshot/plans.json", keeping the other
 * worlds. `patch` comes from the renderer: it is cleaned by `mergeGamePlans`.
 */
export async function writeGamePlans(
  gameDir: string,
  world: string,
  patch: unknown
): Promise<void> {
  const file = plansFileOf(gameDir)
  let existing: unknown = null
  try {
    existing = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    /* missing or broken: start over */
  }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file + '.tmp', JSON.stringify(mergeGamePlans(existing, world, patch)), 'utf8')
  await rename(file + '.tmp', file)
}
