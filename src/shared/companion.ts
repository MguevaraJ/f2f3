import type { CompanionData, ServerTick, SpawnCounts } from './types'

/** The mod's tick and mob cap data in the shapes the F3 parser produces. */
export function companionTechnical(c: CompanionData): {
  server?: ServerTick
  spawnCounts?: SpawnCounts
} {
  const tick = c.game?.tick
  return {
    server: tick && {
      mspt: tick.mspt,
      targetMs: 1000 / tick.rate,
      tickState: tick.state === 'normal' ? undefined : tick.state,
      brand: c.world.type === 'singleplayer' ? undefined : c.game?.serverBrand
    },
    spawnCounts: c.spawn && { chunks: c.spawn.chunks, counts: c.spawn.counts }
  }
}
