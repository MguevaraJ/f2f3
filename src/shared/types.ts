/**
 * Domain types shared by the main process, the analysis worker and the renderer.
 * Everything here must stay serialisable (structured-clone friendly).
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type DimensionId =
  'minecraft:overworld' | 'minecraft:the_nether' | 'minecraft:the_end' | string

export type DebugSide = 'left' | 'right'

export interface DebugField {
  key: string
  value: string
  side: DebugSide
}

/** Structured view of everything the F3 debug overlay showed. */
export interface F3Data {
  version?: string
  modLoader?: string
  fps?: number
  /** Exact player position (feet). */
  position?: Vec3
  /** Integer block position. */
  block?: Vec3
  /** Chunk coordinates (x, y-section, z). */
  chunk?: Vec3
  /** Position of the block inside its chunk. */
  chunkRelative?: Vec3
  /** Region file name, e.g. r.9.3.mca */
  region?: string
  facing?: {
    direction: string
    towards?: string
    yaw?: number
    pitch?: number
  }
  dimension?: DimensionId
  biome?: string
  light?: { client?: number; sky?: number; block?: number }
  localDifficulty?: { value: number; clamped?: number; day?: number }
  targetedBlock?: { pos: Vec3; id?: string }
  targetedFluid?: { pos: Vec3; id?: string }
  targetedEntity?: string
  java?: string
  memory?: string
  cpu?: string
  gpu?: string
  display?: string
  /** Every "key: value" pair, in reading order. */
  fields: DebugField[]
  /** Raw recognised lines (empty strings keep the original spacing). */
  lines: { left: string[]; right: string[] }
}

export interface OcrStats {
  guiScale: number
  /** 0..1 — share of glyphs that matched the Minecraft font exactly. */
  confidence: number
  glyphs: number
  fontSource: string
  durationMs: number
}

export type InfoSource = 'f3' | 'vision' | 'heuristic' | 'manual'

export interface BiomeInfo {
  id: string
  source: InfoSource
  /** 0..1 */
  confidence: number
}

export interface MobInfo {
  id: string
  count: number
  source: InfoSource
  /** Hostile / passive / neutral / boss — purely informational. */
  category?: 'hostile' | 'neutral' | 'passive' | 'boss' | 'player' | 'other'
}

export interface VisionResult {
  model: string
  analyzedAt: number
  description: string
  biome?: { id: string; confidence: number }
  dimension?: DimensionId
  timeOfDay?: string
  weather?: string
  mobs: { id: string; count: number }[]
  structures: string[]
}

export interface ScreenshotAnalysis {
  /** Bumped whenever the analysis pipeline changes, forcing a re-scan. */
  schema: number
  fingerprint: string
  analyzedAt: number
  hasF3: boolean
  f3: F3Data | null
  ocr: OcrStats | null
  dimension: { id: DimensionId; source: InfoSource } | null
  biome: BiomeInfo | null
  mobs: MobInfo[]
  vision: VisionResult | null
  /** Average colour, handy for placeholders while the thumbnail loads. */
  averageColor: string
  error?: string
}

export interface UserMeta {
  favorite?: boolean
  note?: string
  tags?: string[]
}

export interface ScreenshotEntry {
  /** Path relative to the screenshots root, always with forward slashes. */
  id: string
  name: string
  /** Relative folder ('' for the root). */
  folder: string
  size: number
  mtimeMs: number
  /** Parsed from the Minecraft file name when possible, mtime otherwise. */
  capturedAt: number
  width: number
  height: number
  analysis: ScreenshotAnalysis | null
  meta: UserMeta
}

export interface FolderNode {
  /** Relative path, '' for root. */
  path: string
  name: string
  count: number
  children: FolderNode[]
}

export interface LibrarySnapshot {
  root: string
  rootExists: boolean
  folders: FolderNode
  screenshots: ScreenshotEntry[]
}

export interface MinecraftSource {
  label: string
  path: string
  count: number
}

export interface AppSettings {
  screenshotsDir: string
  /** Optional override for the font source (.jar or resource pack .zip). */
  fontSource: string
  autoAnalyze: boolean
  visionEnabled: boolean
  visionModel: string
  /** Analyse new screenshots with Claude automatically (costs API credits). */
  visionAuto: boolean
  thumbnailSize: number
  confirmDelete: boolean
  /** Back up new screenshots to Google Drive automatically while connected. */
  backupAuto: boolean
  /** Desktop popup when Minecraft saves a new screenshot. */
  notifyNewShots: boolean
  /** Put the coordinates of a new F3 screenshot on the clipboard automatically. */
  notifyAutoCopy: boolean
}

export interface SettingsView extends AppSettings {
  hasApiKey: boolean
  apiKeyEncrypted: boolean
}

export interface AnalysisProgress {
  pending: number
  running: number
  done: number
  total: number
  current?: string
  kind: 'ocr' | 'vision'
}

export type ClipboardMode = 'copy' | 'cut'

export interface FileOpResult {
  ok: boolean
  /** Ids (relative paths) produced or affected by the operation. */
  ids: string[]
  errors: string[]
}

export interface BackupAccount {
  email: string
  name: string
}

export interface BackupSummary {
  uploaded: number
  updated: number
  moved: number
  skipped: number
  failed: number
  /** Files that exist in Drive but not locally (never deleted by a backup). */
  remoteOnly: number
  bytes: number
  finishedAt: number
  errors: string[]
}

export interface BackupStatus {
  /** A Google OAuth client is configured (settings or build-time). */
  configured: boolean
  account: BackupAccount | null
  state: 'idle' | 'connecting' | 'running' | 'error'
  phase?: 'scanning' | 'listing' | 'uploading' | 'restoring'
  done: number
  total: number
  bytesDone: number
  bytesTotal: number
  current?: string
  lastRun: BackupSummary | null
  error?: string
  /** Web link of the backup folder in Drive, once it exists. */
  folderUrl?: string
}

/** What the new-capture popup shows. */
export interface CapturePopupPayload {
  entry: ScreenshotEntry
  /** The F3 is still being read. */
  reading: boolean
  /** Captures that arrived while this popup was already on screen. */
  more: number
  /** Global shortcut that copies the coordinates while the popup is visible. */
  shortcut: string | null
  /** Coordinates were copied automatically (auto-copy setting). */
  autoCopied: boolean
}
