import type { LocalSceneResult } from '@core/localvision/classify'

export type LocalWorkerRequest =
  | { type: 'load'; cacheDir: string; allowDownload: boolean }
  | { type: 'analyze'; jobId: number; file: string; dimension: string | undefined }

export type LocalWorkerReply =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'load-error'; message: string }
  | { type: 'result'; jobId: number; result?: LocalSceneResult; error?: string }
