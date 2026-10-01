import type { CapturePopupApi, F2F3Api } from '../shared/ipc'

declare global {
  interface Window {
    f2f3: F2F3Api
    f2f3Popup: CapturePopupApi
  }
}

export {}
