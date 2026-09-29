import type { ScreenshotAnalysis } from './types'

/**
 * The F3 is on screen but hides the biome: new debug screens (1.21.9+/26.x,
 * "To edit: press [F3+F6]") let the player turn that line on.
 */
export function biomeHiddenInF3(a: ScreenshotAnalysis | null | undefined): boolean {
  if (!a?.hasF3 || !a.f3 || a.f3.biome) return false
  return (
    [...a.f3.lines.left, ...a.f3.lines.right].some((l) => /F3\s*\+\s*F6/.test(l)) ||
    isNewDebugScreen(a.f3.version)
  )
}

function isNewDebugScreen(version: string | undefined): boolean {
  if (!version) return false
  const [maj, min, patch] = version.split(/[.-]/).map(Number)
  if (maj >= 26) return true
  return maj === 1 && (min > 21 || (min === 21 && (patch ?? 0) >= 9))
}
