import type {
  AnalysisProgress,
  CapturePopupPayload,
  LocalModelStatus,
  BackupStatus,
  BackupSummary,
  AppSettings,
  ClipboardMode,
  FileOpResult,
  LibrarySnapshot,
  MinecraftSource,
  ScreenshotAnalysis,
  SettingsView,
  UserMeta,
  VisionProviderId
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
    exportData: 'library:export',
    exportZip: 'library:export-zip',
    exportWaypoints: 'library:export-waypoints',
    exportTable: 'library:export-table'
  },
  backup: {
    status: 'backup:status',
    connect: 'backup:connect',
    cancelConnect: 'backup:cancel-connect',
    disconnect: 'backup:disconnect',
    run: 'backup:run',
    cancel: 'backup:cancel',
    restore: 'backup:restore',
    openFolder: 'backup:open-folder'
  },
  companion: {
    saveMod: 'companion:save-mod',
    exportBuild: 'companion:export-build',
    listSaves: 'companion:list-saves',
    installBuild: 'companion:install-build'
  },
  localModel: {
    status: 'local-model:status',
    enable: 'local-model:enable',
    remove: 'local-model:remove'
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
    testVision: 'settings:test-vision',
    chooseDirectory: 'settings:choose-directory',
    chooseFontSource: 'settings:choose-font',
    detectSources: 'settings:detect-sources',
    testNotification: 'settings:test-notification'
  },
  system: {
    copyText: 'system:copy-text',
    info: 'system:info',
    fontGlyphs: 'system:font-glyphs',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close',
    resolveClose: 'window:resolve-close',
    quit: 'app:quit'
  },
  events: {
    libraryChanged: 'event:library-changed',
    analysisUpdated: 'event:analysis-updated',
    analysisProgress: 'event:analysis-progress',
    notice: 'event:notice',
    backupStatus: 'event:backup-status',
    openScreenshot: 'event:open-screenshot',
    localModelStatus: 'event:local-model-status',
    confirmClose: 'event:confirm-close'
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

export type CloseChoice = 'quit' | 'background' | 'cancel'

export type TableFormat = 'xlsx' | 'csv'
export type TableCell = string | number | null

/** A table exactly as shown in the UI, ready to be written as CSV or Excel. */
export interface DataTable {
  sheetName: string
  /** Suggested file name without extension. */
  fileName: string
  columns: { header: string; width?: number }[]
  rows: TableCell[][]
}

export interface ZipExportResult {
  path: string
  files: number
  bytes: number
}

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
    /** Asks where to save, then zips the screenshots. Resolves null if the user cancels. */
    exportZip(ids: string[]): Promise<ZipExportResult | null>
    /** Saves the screenshots' positions as Xaero's Minimap waypoints (.zip); null if cancelled. */
    exportWaypoints(ids: string[], world: string): Promise<{ path: string; count: number } | null>
    /** Asks where to save and writes the table. Resolves the path, or null if cancelled. */
    exportTable(table: DataTable, format: TableFormat): Promise<string | null>
    /** Absolute path of a file dropped from the OS (File objects lose it under context isolation). */
    pathForFile(file: File): string
    onChanged(cb: (snapshot: LibrarySnapshot) => void): Unsubscribe
    /** The new-capture popup asked to show a screenshot in the main window. */
    onOpenRequest(cb: (id: string) => void): Unsubscribe
  }
  analysis: {
    reanalyze(ids: string[]): Promise<void>
    vision(ids: string[]): Promise<void>
    setBiome(id: string, biomeId: string | null): Promise<void>
    onUpdated(cb: (id: string, analysis: ScreenshotAnalysis) => void): Unsubscribe
    onProgress(cb: (progress: AnalysisProgress) => void): Unsubscribe
  }
  backup: {
    status(): Promise<BackupStatus>
    /** Opens Google's consent screen in the browser; resolves when the account is linked (or fails). */
    connect(): Promise<BackupStatus>
    cancelConnect(): Promise<void>
    disconnect(): Promise<BackupStatus>
    /** Starts a backup; resolves when it finishes (null if it could not start). */
    run(): Promise<BackupSummary | null>
    cancel(): Promise<void>
    restore(): Promise<{ restored: number; failed: number }>
    openFolder(): Promise<void>
    onStatus(cb: (status: BackupStatus) => void): Unsubscribe
  }
  companion: {
    /** Saves the bundled Craftshot Companion mod (.jar) where the user chooses; null if cancelled. */
    saveMod(): Promise<string | null>
    /** Saves the build (.nbt) captured with a screenshot; null if cancelled. */
    exportBuild(id: string): Promise<string | null>
    /** Singleplayer worlds of the .minecraft the screenshots belong to. */
    listSaves(): Promise<{ folder: string; name: string }[]>
    /** Copies the build into a world so `/place template <templateId>` finds it; returns the file. */
    installBuild(id: string, folder: string, template?: string): Promise<string>
  }
  localModel: {
    status(): Promise<LocalModelStatus>
    /** Downloads (once, with the user's consent) and enables the on-device model. */
    enable(): Promise<LocalModelStatus>
    /** Disables it and deletes the files. */
    remove(): Promise<LocalModelStatus>
    onStatus(cb: (s: LocalModelStatus) => void): Unsubscribe
  }
  settings: {
    get(): Promise<SettingsView>
    update(patch: Partial<AppSettings>): Promise<SettingsView>
    /** Stores (encrypted) or clears the key of an advanced-AI provider. */
    setApiKey(provider: VisionProviderId, key: string | null): Promise<SettingsView>
    /** Checks the connection and returns the models the provider offers. */
    testVision(
      provider: VisionProviderId
    ): Promise<{ ok: boolean; message: string; models: string[] }>
    chooseDirectory(): Promise<string | null>
    chooseFontSource(): Promise<string | null>
    detectSources(): Promise<MinecraftSource[]>
    /** Shows the new-capture popup with the latest screenshot. */
    testNotification(): Promise<void>
  }
  system: {
    copyText(text: string): Promise<void>
    info(): Promise<SystemInfo>
    fontGlyphs(): Promise<FontGlyphs | null>
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    /** Answer to the "close or keep in background?" question. */
    resolveClose(choice: CloseChoice, remember: boolean): Promise<void>
    onConfirmClose(cb: () => void): Unsubscribe
    /** Quits the app for real (also when it would otherwise stay in the background). */
    quit(): Promise<void>
    onNotice(cb: (notice: Notice) => void): Unsubscribe
  }
}

/** URL helpers for the privileged `craftshot://` scheme (served by the main process). */
export const SCHEME = 'craftshot'
export const imageUrl = (id: string, version: number): string =>
  `${SCHEME}://image/${encodeURIComponent(id)}?v=${Math.round(version)}`
export const thumbUrl = (id: string, version: number): string =>
  `${SCHEME}://thumb/${encodeURIComponent(id)}?v=${Math.round(version)}`

/** API of the new-capture popup window (its own minimal preload). */
export interface CapturePopupApi {
  onShow(cb: (payload: CapturePopupPayload) => void): Unsubscribe
  /** What is on screen right now (for when the page mounts after the first push). */
  current(): Promise<CapturePopupPayload | null>
  /** Coordinates were copied through the global shortcut. */
  onCopied(cb: (what: string) => void): Unsubscribe
  copy(text: string): Promise<void>
  copyImage(id: string): Promise<void>
  open(id: string): Promise<void>
  dismiss(): Promise<void>
}
