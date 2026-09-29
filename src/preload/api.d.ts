import type { CraftshotApi } from '../shared/ipc'

declare global {
  interface Window {
    craftshot: CraftshotApi
  }
}

export {}
