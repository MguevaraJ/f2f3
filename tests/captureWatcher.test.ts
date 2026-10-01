import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import type { LibrarySnapshot, ScreenshotAnalysis, ScreenshotEntry } from '../src/shared/types'

vi.mock('electron', () => ({ shell: {} }))
const { CaptureWatcher } = await import('../src/main/services/CaptureWatcher')

const NOW = new Date(2026, 8, 29, 15, 32, 30).getTime()
const pad = (n: number) => String(n).padStart(2, '0')
const mcName = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.png`
}
const entry = (id: string): ScreenshotEntry =>
  ({
    id,
    name: id.split('/').pop()!,
    folder: '',
    size: 4,
    mtimeMs: NOW,
    capturedAt: NOW,
    width: 1,
    height: 1,
    analysis: null,
    meta: {}
  }) as ScreenshotEntry

describe('CaptureWatcher', () => {
  let root: string
  let analysis: EventEmitter & { enqueueLocal: ReturnType<typeof vi.fn> }
  let watcher: InstanceType<typeof CaptureWatcher>
  let captures: string[]
  let analyzed: ScreenshotEntry[]
  const snap = (ids: string[], r = root): LibrarySnapshot =>
    ({
      root: r,
      rootExists: true,
      roots: [{ path: r, label: 'Juego', mount: '', exists: true }],
      folders: {} as never,
      screenshots: ids.map(entry)
    }) as LibrarySnapshot

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cs-watch-'))
    analysis = Object.assign(new EventEmitter(), { enqueueLocal: vi.fn() })
    const library = { resolveId: (id: string) => join(root, id), entry: (id: string) => entry(id) }
    watcher = new CaptureWatcher(library as never, analysis as never, () => NOW)
    captures = []
    analyzed = []
    watcher.on('capture', (e) => captures.push(e.id))
    watcher.on('analyzed', (e) => analyzed.push(e))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const fresh = mcName(NOW - 3_000)
  const write = (name: string) => writeFileSync(join(root, name), 'PNG!')

  it('takes the first snapshot as a baseline (no popup for existing captures on startup)', () => {
    write(fresh)
    watcher.onSnapshot(snap([fresh]))
    expect(captures).toEqual([])
  })

  it('announces a capture Minecraft just saved and analyses it first', async () => {
    watcher.onSnapshot(snap([]))
    write(fresh)
    watcher.onSnapshot(snap([fresh]))
    expect(captures).toEqual([fresh])
    await vi.waitFor(() => expect(analysis.enqueueLocal).toHaveBeenCalledWith([fresh], true))

    analysis.emit('updated', fresh, { hasF3: true } as ScreenshotAnalysis)
    expect(analyzed.map((e) => e.analysis?.hasF3)).toEqual([true])
  })

  it('ignores pasted, imported or restored files (old names) and non-Minecraft names', () => {
    watcher.onSnapshot(snap([]))
    const old = mcName(NOW - 3 * 24 * 3600_000)
    watcher.onSnapshot(snap([old, 'Bases/' + old, 'foto.png', 'granja (2).png']))
    expect(captures).toEqual([])
  })

  it('re-baselines when the screenshots folder changes', () => {
    watcher.onSnapshot(snap([]))
    watcher.onSnapshot(snap([fresh], '/otra/carpeta'))
    expect(captures).toEqual([])
  })

  it('retries once when the first read raced the game still writing the file', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    watcher.onSnapshot(snap([]))
    write(fresh)
    watcher.onSnapshot(snap([fresh]))
    await vi.waitFor(() => expect(analysis.enqueueLocal).toHaveBeenCalledTimes(1))
    analysis.emit('updated', fresh, { error: 'truncated PNG' } as ScreenshotAnalysis)
    expect(analyzed).toEqual([])
    await vi.advanceTimersByTimeAsync(500)
    expect(analysis.enqueueLocal).toHaveBeenCalledTimes(2)
    analysis.emit('updated', fresh, { hasF3: false } as ScreenshotAnalysis)
    expect(analyzed).toHaveLength(1)
    vi.useRealTimers()
  })
})
