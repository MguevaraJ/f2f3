import { create } from 'zustand'
import type {
  AnalysisProgress,
  LibrarySnapshot,
  ScreenshotAnalysis,
  ScreenshotEntry,
  UserMeta
} from '@shared/types'
import { api } from '../lib/api'

interface LibraryState {
  snapshot: LibrarySnapshot | null
  byId: Map<string, ScreenshotEntry>
  progress: { ocr: AnalysisProgress | null; vision: AnalysisProgress | null }
  setSnapshot(snapshot: LibrarySnapshot): void
  patchEntries(patches: Map<string, Partial<ScreenshotEntry>>): void
  setProgress(p: AnalysisProgress): void
  setMeta(id: string, meta: Partial<UserMeta>): Promise<void>
}

const index = (list: ScreenshotEntry[]): Map<string, ScreenshotEntry> =>
  new Map(list.map((s) => [s.id, s]))

export const useLibrary = create<LibraryState>((set, get) => ({
  snapshot: null,
  byId: new Map(),
  progress: { ocr: null, vision: null },

  setSnapshot: (snapshot) => set({ snapshot, byId: index(snapshot.screenshots) }),

  patchEntries: (patches) => {
    const snap = get().snapshot
    if (!snap || !patches.size) return
    const screenshots = snap.screenshots.map((s) => {
      const p = patches.get(s.id)
      return p ? { ...s, ...p } : s
    })
    set({ snapshot: { ...snap, screenshots }, byId: index(screenshots) })
  },

  setProgress: (p) =>
    set((st) => ({
      progress: { ...st.progress, [p.kind]: p.pending + p.running > 0 ? p : null }
    })),

  setMeta: async (id, meta) => {
    const entry = get().byId.get(id)
    if (!entry) return
    get().patchEntries(new Map([[id, { meta: { ...entry.meta, ...meta } }]]))
    await api.library.setMeta(id, meta)
  }
}))

/**
 * Wires main-process events into the store. Analysis updates arrive in bursts
 * (one per screenshot), so they are coalesced and applied at most every 120 ms.
 */
export function connectLibrary(): () => void {
  const pending = new Map<string, Partial<ScreenshotEntry>>()
  let timer: number | null = null
  const flush = (): void => {
    timer = null
    useLibrary.getState().patchEntries(new Map(pending))
    pending.clear()
  }
  const offs = [
    api.library.onChanged((snap) => {
      pending.clear()
      useLibrary.getState().setSnapshot(snap)
    }),
    api.analysis.onUpdated((id: string, analysis: ScreenshotAnalysis) => {
      pending.set(id, { analysis })
      timer ??= window.setTimeout(flush, 120)
    }),
    api.analysis.onProgress((p) => useLibrary.getState().setProgress(p))
  ]
  void api.library.get().then((s) => useLibrary.getState().setSnapshot(s))
  return () => offs.forEach((off) => off())
}
