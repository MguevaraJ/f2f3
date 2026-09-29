/**
 * Build guard: preload scripts run sandboxed, where require() only accepts
 * "electron" and a few Node builtins. If the bundler splits shared code into a
 * chunk, the preload silently fails at runtime and the window renders blank.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'out/preload'
const allowed = new Set(['electron', 'events', 'timers', 'url'])
let failed = false
for (const file of readdirSync(dir, { recursive: true })) {
  const path = join(dir, String(file))
  if (!path.endsWith('.cjs') && !path.endsWith('.js')) continue
  if (path.includes('chunks')) {
    console.error(`✗ ${path}: shared chunk emitted for preloads`)
    failed = true
    continue
  }
  for (const [, mod] of readFileSync(path, 'utf8').matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (!allowed.has(mod.replace(/^node:/, ''))) {
      console.error(`✗ ${path}: require("${mod}") is not available in a sandboxed preload`)
      failed = true
    }
  }
}
if (failed) {
  console.error('Preload check failed: keep preload entries free of shared runtime modules.')
  process.exit(1)
}
console.log('✓ preload scripts are self-contained')
