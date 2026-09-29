import { join, sep } from 'node:path'
import type { ScreenshotAnalysis, UserMeta } from '@shared/types'
import { JsonStore } from './JsonStore'

interface MetadataDoc {
  version: number
  /** Keyed by absolute file path, so switching the screenshots folder keeps the cache. */
  analyses: Record<string, ScreenshotAnalysis>
  meta: Record<string, UserMeta>
}

/** Persistent cache of analyses and user metadata (favourites, notes, tags). */
export class MetadataStore {
  private readonly store: JsonStore<MetadataDoc>

  constructor(userDataDir: string) {
    this.store = new JsonStore<MetadataDoc>(
      join(userDataDir, 'library.json'),
      { version: 1, analyses: {}, meta: {} },
      1500
    )
  }

  analysis(path: string): ScreenshotAnalysis | null {
    return this.store.value.analyses[path] ?? null
  }

  setAnalysis(path: string, analysis: ScreenshotAnalysis): void {
    this.store.update((d) => {
      d.analyses[path] = analysis
    })
  }

  meta(path: string): UserMeta {
    return this.store.value.meta[path] ?? {}
  }

  setMeta(path: string, patch: Partial<UserMeta>): UserMeta {
    let next: UserMeta = {}
    this.store.update((d) => {
      next = { ...d.meta[path], ...patch }
      if (!next.note) delete next.note
      if (!next.favorite) delete next.favorite
      if (!next.tags?.length) delete next.tags
      if (Object.keys(next).length) d.meta[path] = next
      else delete d.meta[path]
    })
    return next
  }

  /** Re-keys entries after a move/rename; handles folders by prefix. */
  move(from: string, to: string): void {
    this.store.update((d) => {
      for (const table of [d.analyses, d.meta] as Record<string, unknown>[]) {
        for (const key of Object.keys(table)) {
          const target = rekey(key, from, to)
          if (target) {
            table[target] = table[key]
            delete table[key]
          }
        }
      }
    })
  }

  /** Duplicates entries for a copied file/folder (the analysis stays valid: same pixels). */
  copy(from: string, to: string): void {
    this.store.update((d) => {
      for (const table of [d.analyses, d.meta] as Record<string, unknown>[]) {
        for (const key of Object.keys(table)) {
          const target = rekey(key, from, to)
          if (target) table[target] = structuredClone(table[key])
        }
      }
    })
  }

  remove(path: string): void {
    this.store.update((d) => {
      for (const table of [d.analyses, d.meta] as Record<string, unknown>[])
        for (const key of Object.keys(table))
          if (key === path || key.startsWith(path + sep)) delete table[key]
    })
  }

  flush(): void {
    this.store.flush()
  }
}

function rekey(key: string, from: string, to: string): string | null {
  if (key === from) return to
  if (key.startsWith(from + sep)) return to + key.slice(from.length)
  return null
}
