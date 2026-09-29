import type { CapturePopupApi, CraftshotApi } from '../shared/ipc'

declare global {
  interface Window {
    craftshot: CraftshotApi
    craftshotPopup: CapturePopupApi
  }
}

export {}
