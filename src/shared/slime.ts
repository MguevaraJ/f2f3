/**
 * Slime chunks, exactly as Minecraft decides them (Java Edition):
 * WorldgenRandom.seedSlimeChunk(x, z, seed, 987234911L).nextInt(10) == 0.
 * The chunk seed mixes 32-bit int products into a 64-bit long, then feeds
 * java.util.Random (48-bit LCG) — hence BigInt for the long arithmetic.
 */
const SALT = 987234911n
const MULT = 0x5deece66dn
const MASK48 = (1n << 48n) - 1n

export function parseSeed(seed: string): bigint | null {
  const s = seed.trim()
  if (!/^-?\d{1,20}$/.test(s)) return null
  const n = BigInt(s)
  return n >= -(1n << 63n) && n < 1n << 63n ? n : null
}

export function isSlimeChunk(seed: bigint, x: number, z: number): boolean {
  const chunkSeed = BigInt.asIntN(
    64,
    seed +
      BigInt(Math.imul(Math.imul(x, x), 4987142)) +
      BigInt(Math.imul(x, 5947611)) +
      BigInt(Math.imul(z, z)) * 4392871n +
      BigInt(Math.imul(z, 389711))
  )
  let state = (BigInt.asIntN(64, chunkSeed ^ SALT) ^ MULT) & MASK48
  const next31 = (): number => {
    state = (state * MULT + 0xbn) & MASK48
    return Number(state >> 17n)
  }
  // Random.nextInt(10): rejection sampling with Java int overflow semantics.
  let u = next31()
  let r = u % 10
  while (((u - r + 9) | 0) < 0) {
    u = next31()
    r = u % 10
  }
  return r === 0
}

/** Memoised per seed: the map asks for the same chunks every frame. */
export function slimeChecker(seed: bigint): (x: number, z: number) => boolean {
  const cache = new Map<string, boolean>()
  return (x, z) => {
    const k = `${x},${z}`
    let v = cache.get(k)
    if (v === undefined) {
      if (cache.size > 200_000) cache.clear()
      v = isSlimeChunk(seed, x, z)
      cache.set(k, v)
    }
    return v
  }
}

/** Distance in blocks from a block position to the nearest slime chunk (searching outwards). */
export function nearestSlimeChunk(
  seed: bigint,
  bx: number,
  bz: number,
  maxRadius = 16
): { x: number; z: number; distance: number } | null {
  const cx = bx >> 4
  const cz = bz >> 4
  type Hit = { x: number; z: number; distance: number }
  let best = null as Hit | null
  for (let r = 0; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !isSlimeChunk(seed, cx + dx, cz + dz))
          continue
        // Distance to the closest point of that chunk.
        const x0 = (cx + dx) << 4
        const z0 = (cz + dz) << 4
        const ddx = bx < x0 ? x0 - bx : bx > x0 + 15 ? bx - (x0 + 15) : 0
        const ddz = bz < z0 ? z0 - bz : bz > z0 + 15 ? bz - (z0 + 15) : 0
        const distance = Math.hypot(ddx, ddz)
        if (!best || distance < best.distance) best = { x: cx + dx, z: cz + dz, distance }
      }
    // A ring further out can't be closer than (r - 1) chunks.
    if (best && best.distance <= r * 16) return best
  }
  return best
}
