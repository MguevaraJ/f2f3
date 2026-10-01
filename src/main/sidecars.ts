import { existsSync } from 'node:fs'
import { buildPathsFor, companionPathsFor } from '@core/companion/parseCompanion'

/** The mod's sidecar of an image: the one on disk (current or pre-rename name), else where it would be. */
export const companionFileOf = (imagePath: string): string => {
  const paths = companionPathsFor(imagePath)
  return paths.find((p) => existsSync(p)) ?? paths[0]
}

/** The build saved with an image, found the same way. */
export const buildFileOf = (imagePath: string): string => {
  const paths = buildPathsFor(imagePath)
  return paths.find((p) => existsSync(p)) ?? paths[0]
}
