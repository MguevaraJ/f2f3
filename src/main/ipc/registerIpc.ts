import { readFile, writeFile } from 'node:fs/promises'
import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { IPC, type ExportFormat } from '@shared/ipc'
import type { AppSettings, ClipboardMode, UserMeta } from '@shared/types'
import { loadFontFrom, ROW_OFFSET } from '@core/font/minecraftFont'
import type { FontGlyphs } from '@shared/ipc'
import { toCsv, toJson } from '../export'
import type { Services } from '../services'

/** Validates that an argument is a string (the renderer is treated as untrusted). */
const str = (v: unknown, name = 'argumento'): string => {
  if (typeof v !== 'string') throw new TypeError(`${name} inválido`)
  return v
}
const strArray = (v: unknown): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))
    throw new TypeError('lista inválida')
  return v as string[]
}

export function registerIpc(services: Services): void {
  const { library, analysis, settings, locator, vision } = services
  const handle = (
    channel: string,
    fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  ): void => {
    ipcMain.handle(channel, (e, ...args) => {
      // Only our own window (loaded from our bundle) may call in.
      if (!e.senderFrame || BrowserWindow.fromWebContents(e.sender) === null)
        throw new Error('Remitente no válido')
      return fn(e, ...args)
    })
  }
  const win = (e: IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender)

  // Library
  handle(IPC.library.get, () => library.snapshot())
  handle(IPC.library.refresh, () => library.refresh())
  handle(IPC.library.createFolder, (_e, parent, name) =>
    library.createFolder(str(parent), str(name))
  )
  handle(IPC.library.rename, (_e, id, name) => library.rename(str(id), str(name)))
  handle(IPC.library.remove, (_e, ids) => library.remove(strArray(ids)))
  handle(IPC.library.paste, (_e, ids, target, mode) =>
    library.paste(strArray(ids), str(target), (mode === 'cut' ? 'cut' : 'copy') as ClipboardMode)
  )
  handle(IPC.library.importFiles, (_e, paths, target) =>
    library.importFiles(strArray(paths), str(target))
  )
  handle(IPC.library.reveal, (_e, id) => shell.showItemInFolder(library.resolveId(str(id))))
  handle(IPC.library.openExternal, async (_e, id) => {
    const err = await shell.openPath(library.resolveId(str(id)))
    if (err) throw new Error(err)
  })
  handle(IPC.library.setMeta, (_e, id, meta) => {
    const abs = library.resolveId(str(id))
    const m = (meta ?? {}) as Partial<UserMeta>
    const clean: Partial<UserMeta> = {}
    if ('favorite' in m) clean.favorite = !!m.favorite
    if ('note' in m) clean.note = String(m.note ?? '').slice(0, 4000)
    if ('tags' in m)
      clean.tags = strArray(m.tags ?? [])
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 30)
    const next = services.metadata.setMeta(abs, clean)
    const entry = library.entry(str(id))
    if (entry) entry.meta = next
  })
  handle(IPC.library.copyImage, async (_e, id) => {
    const abs = library.resolveId(str(id))
    const png = /\.png$/i.test(abs) ? await readFile(abs) : nativeImage.createFromPath(abs).toPNG()
    if (!png.length) throw new Error('No se pudo leer la imagen')
    await clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })
    ])
  })
  handle(IPC.library.exportData, async (e, ids, format) => {
    const fmt: ExportFormat = format === 'json' ? 'json' : 'csv'
    const wanted = new Set(strArray(ids))
    const entries = (await library.snapshot()).screenshots.filter((s) => wanted.has(s.id))
    const parent = win(e)
    const options = {
      title: 'Exportar datos de capturas',
      defaultPath: `craftshot-${new Date().toISOString().slice(0, 10)}.${fmt}`,
      filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }]
    }
    const res = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, fmt === 'csv' ? toCsv(entries) : toJson(entries), 'utf8')
    return res.filePath
  })

  // Analysis
  handle(IPC.analysis.reanalyze, (_e, ids) => analysis.enqueueLocal(strArray(ids)))
  handle(IPC.analysis.vision, (_e, ids) => {
    if (!settings.getApiKey()) throw new Error('Configura tu API key de Anthropic en Ajustes.')
    analysis.enqueueVision(strArray(ids))
  })
  handle(IPC.analysis.setBiome, (_e, id, biome) =>
    analysis.setBiome(str(id), biome == null ? null : str(biome))
  )

  // Settings
  handle(IPC.settings.get, () => settings.view())
  handle(IPC.settings.update, (_e, patch) => settings.update((patch ?? {}) as Partial<AppSettings>))
  handle(IPC.settings.setApiKey, (_e, key) => settings.setApiKey(key == null ? null : str(key)))
  handle(IPC.settings.testApiKey, () => vision.test(settings.value.visionModel))
  handle(IPC.settings.detectSources, () => locator.detectSources())
  handle(IPC.settings.chooseDirectory, async (e) => {
    const parent = win(e)
    const options = {
      title: 'Carpeta de capturas',
      defaultPath: settings.value.screenshotsDir,
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
    }
    const res = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  handle(IPC.settings.chooseFontSource, async (e) => {
    const parent = win(e)
    const options = {
      title: 'Fuente de Minecraft (.jar del cliente o resource pack .zip)',
      defaultPath: locator.defaultMinecraftDir(),
      filters: [{ name: 'Minecraft', extensions: ['jar', 'zip'] }],
      properties: ['openFile'] as 'openFile'[]
    }
    const res = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  // System
  handle(IPC.system.copyText, (_e, text) => clipboard.writeText(str(text)))
  handle(IPC.system.info, () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    fontSource: services.fontSource()
  }))
  const glyphCache = new Map<string, FontGlyphs | null>()
  handle(IPC.system.fontGlyphs, () => {
    const source = services.fontSource()
    if (!source) return null
    if (!glyphCache.has(source)) {
      let value: FontGlyphs | null = null
      try {
        const font = loadFontFrom(source)
        if (font)
          value = {
            space: font.spaceAdvance,
            rowOffset: ROW_OFFSET,
            glyphs: Object.fromEntries(font.glyphs.map((g) => [g.char, [g.advance, ...g.columns]]))
          }
      } catch {
        /* unreadable jar: the UI falls back to a regular font */
      }
      glyphCache.set(source, value)
    }
    return glyphCache.get(source)
  })
  handle(IPC.system.minimize, (e) => win(e)?.minimize())
  handle(IPC.system.toggleMaximize, (e) => {
    const w = win(e)
    if (w?.isMaximized()) w.unmaximize()
    else w?.maximize()
  })
  handle(IPC.system.close, (e) => win(e)?.close())
}
