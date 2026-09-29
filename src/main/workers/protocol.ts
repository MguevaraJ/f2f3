import type { ScreenshotAnalysis } from '@shared/types'

/** Messages exchanged between the main process and the analysis workers. */
export interface WorkerJob {
  jobId: number
  file: string
  fingerprint: string
  fontSource: string | null
  analyze: boolean
  thumb: { path: string; width: number } | null
}

export interface WorkerReply {
  jobId: number
  ok: boolean
  width?: number
  height?: number
  analysis?: ScreenshotAnalysis
  error?: string
}
