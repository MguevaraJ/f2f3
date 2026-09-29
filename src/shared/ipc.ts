import type {
  AnalysisProgress,
  AppSettings,
  ClipboardMode,
  FileOpResult,
  LibrarySnapshot,
  MinecraftSource,
  ScreenshotAnalysis,
  SettingsView,
  UserMeta
} from './types'

/**
 * Single source of truth for the renderer ⇄ main contract.
 * Invoke channels map 1:1 to methods of `CraftshotApi`; events are pushed from main.
 */
export const IPC = {
  library: {
    get: 'library:get',
    refresh: 'library:refresh',
    createFolder: 'library:create-folder',
    rename: 'library:rename',
    remove: 'library:remove',
    paste: 'library:paste',
    importFiles: 'library:import',
    reveal: 'library:reveal',
    openExternal: 'library:open-external',
    setMeta: 'library:set-meta',
    copyImage: 'library:copy-image',
    exportData: 'library:export'
  },
  analysis: {
    reanalyze: 'analysis:reanalyze',
    vision: 'analysis:vision',
    setBiome: 'analysis:set-biome'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    setApiKey: 'settings:set-api-key',
    testApiKey: 'settings:test-api-key',
    chooseDirectory: 'settings:choose-directory',
    chooseFontSource: 'settings:choose-font',
    detectSources: 'settings:detect-sources'
  },
  system: {
    copyText: 'system:copy-text',
    info: 'system:info',
    fontGlyphs: 'system:font-glyphs',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close'
  },
  events: {
    libraryChanged: 'event:library-changed',
    analysisUpdated: 'event:analysis-updated',
    analysisProgress: 'event:analysis-progress',
    notice: 'event:notice'
  }
} as const

export interface Notice {
  level: 'info' | 'success' | 'error'
  message: string
}

export type Unsubscribe = () => void

export interface SystemInfo {
  version: string
  platform: string
  electron: string
  fontSource: string | null
}

export type ExportFormat = 'csv' | 'json'

/** Minecraft font glyphs for the renderer's pixel-text component: char → [advance, ...column masks]. */
export interface FontGlyphs {
  space: number
  /** Bit (i) of a mask = row (i - rowOffset) of the 8px line box. */
  rowOffset: number
  glyphs: Record<string, number[]>
}

export interface CraftshotApi {
  library: {
    get(): Promise<LibrarySnapshot>
    refresh(): Promise<LibrarySnapshot>
    createFolder(parent: string, name: string): Promise<FileOpResult>
    rename(id: string, newName: string): Promise<FileOpResult>
    remove(ids: string[]): Promise<FileOpResult>
    paste(ids: string[], targetFolder: string, mode: ClipboardMode): Promise<FileOpResult>
    importFiles(paths: string[], targetFolder: string): Promise<FileOpResult>
    reveal(id: string): Promise<void>
    openExternal(id: string): Promise<void>
    setMeta(id: string, meta: Partial<UserMeta>): Promise<void>
    copyImage(id: string): Promise<void>
    exportData(ids: string[], format: ExportFormat): Promise<string | null>
    /** Absolute path of a file dropped from the OS (File objects lose it under context isolation). */
    pathForFile(file: File): string
    onChanged(cb: (snapshot: LibrarySnapshot) => void): Unsubscribe
  }
  analysis: {
    reanalyze(ids: string[]): Promise<void>
    vision(ids: string[]): Promise<void>
    setBiome(id: string, biomeId: string | null): Promise<void>
    onUpdated(cb: (id: string, analysis: ScreenshotAnalysis) => void): Unsubscribe
    onProgress(cb: (progress: AnalysisProgress) => void): Unsubscribe
  }
  settings: {
    get(): Promise<SettingsView>
    update(patch: Partial<AppSettings>): Promise<SettingsView>
    setApiKey(key: string | null): Promise<SettingsView>
    testApiKey(): Promise<{ ok: boolean; message: string }>
    chooseDirectory(): Promise<string | null>
    chooseFontSource(): Promise<string | null>
    detectSources(): Promise<MinecraftSource[]>
  }
  system: {
    copyText(text: string): Promise<void>
    info(): Promise<SystemInfo>
    fontGlyphs(): Promise<FontGlyphs | null>
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    onNotice(cb: (notice: Notice) => void): Unsubscribe
  }
}

/** URL helpers for the privileged `craftshot://` scheme (served by the main process). */
export const SCHEME = 'craftshot'
export const imageUrl = (id: string, version: number): string =>
  `${SCHEME}://image/${encodeURIComponent(id)}?v=${Math.round(version)}`
export const thumbUrl = (id: string, version: number): string =>
  `${SCHEME}://thumb/${encodeURIComponent(id)}?v=${Math.round(version)}`
