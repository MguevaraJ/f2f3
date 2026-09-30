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

export interface TargetedBlock {
  pos: Vec3
  id?: string
  /** Block state properties, e.g. { delay: '3', facing: 'south' }. */
  state?: Record<string, string>
  /** Block tags, e.g. ['minecraft:mineable/pickaxe']. */
  tags?: string[]
}

export interface ServerTick {
  /** Milliseconds per tick (MSPT). */
  mspt?: number
  /** Target tick length (50 ms = 20 TPS; changes with /tick rate). */
  targetMs?: number
  /** /tick state: frozen, stepping or sprinting. */
  tickState?: 'frozen' | 'stepping' | 'sprinting'
  /** Multiplayer: the server brand (vanilla, Paper, Fabric…). */
  brand?: string
}

/** Mob spawn categories as the game names them (MobCategory). */
export type SpawnCategory =
  | 'monster'
  | 'creature'
  | 'ambient'
  | 'axolotls'
  | 'underground_water_creature'
  | 'water_creature'
  | 'water_ambient'
  | 'misc'

export interface SpawnCounts {
  /** Chunks eligible for spawning (289 = one player, full caps). */
  chunks: number
  counts: Partial<Record<SpawnCategory, number>>
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
  targetedBlock?: TargetedBlock
  targetedFluid?: TargetedBlock
  targetedEntity?: string
  /** Integrated server tick time ("Integrated server @ 6.7/50.0 ms"), or the server brand in multiplayer. */
  server?: ServerTick
  /** Mob counts per spawn category ("SC: 289, MO: 70, C: 12…"): the mob caps. */
  spawnCounts?: SpawnCounts
  /** "Day #12". */
  day?: number
  /** Player speed in blocks per tick. */
  speed?: number
  /** Heightmaps at the player, client (CH) and server (SH): S, M, ML, O… → Y. */
  heightmaps?: { client?: Record<string, number>; server?: Record<string, number> }
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

/**
 * Where a piece of information comes from, from most to least reliable:
 * manual (the user), mod (Craftshot Companion: exact game state), f3 (read from
 * the overlay: exact), vision (advanced AI), local (on-device model: estimate),
 * heuristic (colours: rough estimate).
 */
export type InfoSource = 'mod' | 'f3' | 'vision' | 'local' | 'heuristic' | 'manual'

/**
 * Exact game state written by the Craftshot Companion mod next to a screenshot
 * ("name.craftshot.json", format "craftshot-companion" schema 1).
 */
export interface CompanionData {
  modVersion: string
  minecraft: string
  /** ISO timestamp of the moment F2 was pressed. */
  capturedAt: string
  world: {
    type: 'singleplayer' | 'multiplayer' | 'realms'
    name: string
    /** Singleplayer only; a string because 64-bit seeds exceed JS numbers. */
    seed?: string
    dimension: DimensionId
    day: number
    /** 0..23999 ticks. */
    timeOfDay: number
    weather: 'clear' | 'rain' | 'thunder'
  }
  player: {
    position: Vec3
    block: Vec3
    chunk: Vec3
    facing: { direction: string; yaw: number; pitch: number }
    gameMode: string
  }
  biome: string
  light?: { sky: number; block: number }
  target: { block?: { id: string; pos: Vec3 }; entity?: { id: string; distance: number } }
  /** Living entities visible in the picture, grouped by type. */
  entities: { id: string; count: number; nearest: number }[]
  /** Raw structure ids; absent when unknown (multiplayer). */
  structures?: { inside: string[]; target: string[] }
}

/** Position data shown in the UI, from the mod (preferred) or the F3 overlay. */
export type LocationData = Pick<
  F3Data,
  | 'position'
  | 'block'
  | 'chunk'
  | 'chunkRelative'
  | 'region'
  | 'facing'
  | 'light'
  | 'localDifficulty'
  | 'targetedBlock'
  | 'targetedFluid'
  | 'targetedEntity'
  | 'dimension'
> & { source: 'mod' | 'f3' }

export type VisionProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama'

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
  provider?: VisionProviderId
  model: string
  analyzedAt: number
  description: string
  biome?: { id: string; confidence: number }
  dimension?: DimensionId
  timeOfDay?: string
  weather?: string
  mobs: { id: string; count: number }[]
  /** Structure ids from the catalog (minecraft:desert_pyramid…). */
  structures: string[]
}

/** On-device model output (basic: biome and the mob at the crosshair). */
export interface LocalVisionResult {
  model: string
  analyzedAt: number
  biome: { id: string; confidence: number } | null
  targetedMob: { id: string; confidence: number } | null
}

export interface StructureInfo {
  id: string
  source: InfoSource
}

export interface ScreenshotAnalysis {
  /** Bumped whenever the analysis pipeline changes, forcing a re-scan. */
  schema: number
  fingerprint: string
  analyzedAt: number
  hasF3: boolean
  f3: F3Data | null
  ocr: OcrStats | null
  /** Sidecar written by the Craftshot Companion mod, when present. */
  mod: CompanionData | null
  /** Colour-statistics estimate, kept as the last-resort source. */
  heuristic: { dimension: string | null; biome: { id: string; confidence: number } | null }
  local: LocalVisionResult | null
  vision: VisionResult | null
  /** Biome chosen by the user (overrides everything). */
  manualBiome: string | null
  // ── Resolved values (derived from the sources above by resolveAnalysis) ──
  /** Coordinates, orientation and target: mod first, then F3. */
  location: LocationData | null
  dimension: { id: DimensionId; source: InfoSource } | null
  biome: BiomeInfo | null
  mobs: MobInfo[]
  structures: StructureInfo[]
  /** Average colour, handy for placeholders while the thumbnail loads. */
  averageColor: string
  error?: string
}

export interface UserMeta {
  favorite?: boolean
  note?: string
  tags?: string[]
  /** World assigned by the user (overrides the mod's world name and the folder). */
  world?: string
}

export interface ScreenshotEntry {
  /** Path relative to the screenshots root, always with forward slashes. */
  id: string
  name: string
  /** Relative folder ('' for the root). */
  folder: string
  size: number
  mtimeMs: number
  /** mtime of the Companion mod sidecar next to the image, when there is one. */
  companionMtimeMs?: number
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

export type CloseAction = 'ask' | 'background' | 'quit'

export interface AppSettings {
  screenshotsDir: string
  /** Optional override for the font source (.jar or resource pack .zip). */
  fontSource: string
  autoAnalyze: boolean
  visionEnabled: boolean
  /** Advanced-AI provider and the model chosen for each one. */
  visionProvider: VisionProviderId
  visionModels: Record<VisionProviderId, string>
  /** OpenAI-compatible endpoint (OpenAI, OpenRouter, LM Studio…). */
  openaiBaseUrl: string
  ollamaUrl: string
  /** Level 2: on-device model for basic biome/mob recognition. */
  localModelEnabled: boolean
  /** First-run introduction was completed. */
  onboardingDone: boolean
  /** One-off tips the user dismissed (e.g. "enable the biome line in F3"). */
  dismissedTips: string[]
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
  /** What closing the window does: ask every time, keep running in the background, or quit. */
  closeAction: CloseAction
  /** Show an icon in the system tray while running in the background. */
  trayIcon: boolean
  /** Start Craftshot (in the background) when the user logs in. Off by default. */
  launchAtLogin: boolean
  /** Seeds typed by the user, by world name (the mod fills them in singleplayer). */
  worldSeeds: Record<string, string>
}

export interface SettingsView extends AppSettings {
  /** Which providers have a stored key (keys themselves never leave the main process). */
  apiKeys: Record<VisionProviderId, boolean>
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

/** State of the on-device model (level 2). */
export interface LocalModelStatus {
  state: 'absent' | 'downloading' | 'loading' | 'ready' | 'error'
  /** 0..1 while downloading. */
  progress: number
  /** Approximate download size, for the consent prompt. */
  sizeMB: number
  /** Screenshots waiting for the local analysis. */
  pending: number
  error?: string
}
