import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { CapturePopupApi, Unsubscribe } from '@shared/ipc'
import { POPUP_IPC } from '@shared/popupIpc'

/** Minimal bridge for the new-capture popup: only what the popup needs. */
function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CapturePopupApi = {
  onShow: (cb) => subscribe(POPUP_IPC.show, cb),
  onCopied: (cb) => subscribe(POPUP_IPC.copied, cb),
  current: () => ipcRenderer.invoke(POPUP_IPC.current),
  copy: (text) => ipcRenderer.invoke(POPUP_IPC.copy, text),
  copyImage: (id) => ipcRenderer.invoke(POPUP_IPC.copyImage, id),
  open: (id) => ipcRenderer.invoke(POPUP_IPC.open, id),
  dismiss: () => ipcRenderer.invoke(POPUP_IPC.dismiss)
}

contextBridge.exposeInMainWorld('craftshotPopup', api)
