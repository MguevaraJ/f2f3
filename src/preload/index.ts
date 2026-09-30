import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type CraftshotApi, type Unsubscribe } from '@shared/ipc'

/**
 * The only bridge between the sandboxed renderer and Node/Electron.
 * Exposes a narrow, typed API — never ipcRenderer itself.
 */
const invoke =
  <A extends unknown[], R>(channel: string) =>
  (...args: A): Promise<R> =>
    ipcRenderer.invoke(channel, ...args) as Promise<R>

function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CraftshotApi = {
  library: {
    get: invoke(IPC.library.get),
    refresh: invoke(IPC.library.refresh),
    createFolder: invoke(IPC.library.createFolder),
    rename: invoke(IPC.library.rename),
    remove: invoke(IPC.library.remove),
    paste: invoke(IPC.library.paste),
    importFiles: invoke(IPC.library.importFiles),
    reveal: invoke(IPC.library.reveal),
    openExternal: invoke(IPC.library.openExternal),
    setMeta: invoke(IPC.library.setMeta),
    copyImage: invoke(IPC.library.copyImage),
    exportData: invoke(IPC.library.exportData),
    exportZip: invoke(IPC.library.exportZip),
    exportWaypoints: invoke(IPC.library.exportWaypoints),
    exportTable: invoke(IPC.library.exportTable),
    pathForFile: (file) => webUtils.getPathForFile(file),
    onChanged: (cb) => subscribe(IPC.events.libraryChanged, cb),
    onOpenRequest: (cb) => subscribe(IPC.events.openScreenshot, cb)
  },
  analysis: {
    reanalyze: invoke(IPC.analysis.reanalyze),
    vision: invoke(IPC.analysis.vision),
    setBiome: invoke(IPC.analysis.setBiome),
    onUpdated: (cb) => subscribe(IPC.events.analysisUpdated, cb),
    onProgress: (cb) => subscribe(IPC.events.analysisProgress, cb)
  },
  backup: {
    status: invoke(IPC.backup.status),
    connect: invoke(IPC.backup.connect),
    cancelConnect: invoke(IPC.backup.cancelConnect),
    disconnect: invoke(IPC.backup.disconnect),
    run: invoke(IPC.backup.run),
    cancel: invoke(IPC.backup.cancel),
    restore: invoke(IPC.backup.restore),
    openFolder: invoke(IPC.backup.openFolder),
    onStatus: (cb) => subscribe(IPC.events.backupStatus, cb)
  },
  companion: {
    saveMod: invoke(IPC.companion.saveMod),
    exportBuild: invoke(IPC.companion.exportBuild)
  },
  localModel: {
    status: invoke(IPC.localModel.status),
    enable: invoke(IPC.localModel.enable),
    remove: invoke(IPC.localModel.remove),
    onStatus: (cb) => subscribe(IPC.events.localModelStatus, cb)
  },
  settings: {
    get: invoke(IPC.settings.get),
    update: invoke(IPC.settings.update),
    setApiKey: invoke(IPC.settings.setApiKey),
    testVision: invoke(IPC.settings.testVision),
    chooseDirectory: invoke(IPC.settings.chooseDirectory),
    chooseFontSource: invoke(IPC.settings.chooseFontSource),
    detectSources: invoke(IPC.settings.detectSources),
    testNotification: invoke(IPC.settings.testNotification)
  },
  system: {
    copyText: invoke(IPC.system.copyText),
    info: invoke(IPC.system.info),
    fontGlyphs: invoke(IPC.system.fontGlyphs),
    minimize: invoke(IPC.system.minimize),
    toggleMaximize: invoke(IPC.system.toggleMaximize),
    close: invoke(IPC.system.close),
    resolveClose: invoke(IPC.system.resolveClose),
    quit: invoke(IPC.system.quit),
    onConfirmClose: (cb) => subscribe(IPC.events.confirmClose, cb),
    onNotice: (cb) => subscribe(IPC.events.notice, cb)
  }
}

contextBridge.exposeInMainWorld('craftshot', api)
