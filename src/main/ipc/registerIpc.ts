import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { IPC, type ExportFormat } from '@shared/ipc'
import type { AppSettings, ClipboardMode, UserMeta, VisionProviderId } from '@shared/types'
import { loadFontFrom, ROW_OFFSET } from '@core/font/minecraftFont'
import type { DataTable, FontGlyphs } from '@shared/ipc'
import modJar from '../../../resources/craftshot-companion.jar?asset'
import { copyImageToClipboard } from '../clipboardImage'
import { toCsv, toJson } from '../export'
import { tableToCsv, tableToXlsx } from '../tableExport'
import { writeZip, zipNames } from '../zipExport'
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
  handle(IPC.library.copyImage, (_e, id) => copyImageToClipboard(library.resolveId(str(id))))
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

  handle(IPC.library.exportZip, async (e, ids) => {
    const list = strArray(ids)
    if (!list.length) throw new Error('No hay capturas seleccionadas')
    const paths = list.map((id) => library.resolveId(id))
    const parent = win(e)
    const date = new Date().toISOString().slice(0, 10)
    const options = {
      title: 'Guardar capturas en un ZIP',
      defaultPath: join(app.getPath('downloads'), `craftshot-${date}-${list.length}-capturas.zip`),
      buttonLabel: 'Guardar ZIP',
      filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory'] as (
        'showOverwriteConfirmation' | 'createDirectory'
      )[]
    }
    const res = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    const out = /\.zip$/i.test(res.filePath) ? res.filePath : `${res.filePath}.zip`
    const names = zipNames(list)
    const { files, bytes } = await writeZip(
      paths.map((path, i) => ({ path, name: names[i] })),
      out
    )
    return { path: out, files, bytes }
  })

  handle(IPC.library.exportTable, async (e, raw, format) => {
    const table = validTable(raw)
    const fmt = format === 'csv' ? 'csv' : 'xlsx'
    const parent = win(e)
    const safeName = table.fileName.replace(/[\\/:*?"<>|]/g, '-')
    const options = {
      title: fmt === 'xlsx' ? 'Exportar tabla a Excel' : 'Exportar tabla a CSV',
      defaultPath: join(app.getPath('downloads'), `${safeName}.${fmt}`),
      buttonLabel: 'Exportar',
      filters: [
        fmt === 'xlsx'
          ? { name: 'Libro de Excel', extensions: ['xlsx'] }
          : { name: 'CSV (separado por comas)', extensions: ['csv'] }
      ],
      properties: ['showOverwriteConfirmation', 'createDirectory'] as (
        'showOverwriteConfirmation' | 'createDirectory'
      )[]
    }
    const res = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    const out = res.filePath.toLowerCase().endsWith(`.${fmt}`)
      ? res.filePath
      : `${res.filePath}.${fmt}`
    await writeFile(out, fmt === 'xlsx' ? tableToXlsx(table) : tableToCsv(table))
    return out
  })

  // Craftshot Companion mod: the .jar ships inside the app
  handle(IPC.companion.saveMod, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const options = {
      title: 'Guardar el mod Craftshot Companion',
      defaultPath: join(app.getPath('downloads'), 'craftshot-companion-1.0.0+26.3.jar'),
      filters: [{ name: 'Mod de Fabric', extensions: ['jar'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory'] as (
        'showOverwriteConfirmation' | 'createDirectory'
      )[]
    }
    const res = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    await copyFile(modJar, res.filePath)
    return res.filePath
  })

  // On-device model (level 2)
  const { localVision } = services
  handle(IPC.localModel.status, () => localVision.status)
  handle(IPC.localModel.enable, () => localVision.enable())
  handle(IPC.localModel.remove, () => localVision.remove())

  // Google Drive backup
  const { backup } = services
  handle(IPC.backup.status, () => backup.current)
  handle(IPC.backup.connect, () => backup.connect())
  handle(IPC.backup.cancelConnect, () => backup.cancelConnect())
  handle(IPC.backup.disconnect, () => backup.disconnect())
  handle(IPC.backup.run, () => backup.run())
  handle(IPC.backup.cancel, () => backup.cancel())
  handle(IPC.backup.restore, () => backup.restoreMissing())
  handle(IPC.backup.openFolder, async () => {
    const url = backup.current.folderUrl
    if (!url) throw new Error('Aún no hay ningún respaldo en Drive')
    await shell.openExternal(url)
  })

  // Analysis
  handle(IPC.analysis.reanalyze, (_e, ids) => analysis.enqueueLocal(strArray(ids)))
  handle(IPC.analysis.vision, (_e, ids) => {
    if (!settings.value.visionEnabled) throw new Error('Activa la IA avanzada en Ajustes.')
    if (!vision.isReady())
      throw new Error(
        'Termina de configurar la IA avanzada en Ajustes (proveedor, clave y modelo).'
      )
    analysis.enqueueVision(strArray(ids))
  })
  handle(IPC.analysis.setBiome, (_e, id, biome) =>
    analysis.setBiome(str(id), biome == null ? null : str(biome))
  )

  // Settings
  handle(IPC.settings.get, () => settings.view())
  handle(IPC.settings.update, (_e, patch) => settings.update((patch ?? {}) as Partial<AppSettings>))
  handle(IPC.settings.setApiKey, (_e, provider, key) =>
    settings.setProviderKey(visionProvider(provider), key == null ? null : str(key))
  )
  handle(IPC.settings.testVision, (_e, provider) => vision.test(visionProvider(provider)))
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

/** Structural validation of a table sent by the renderer. */
function validTable(raw: unknown): DataTable {
  const t = raw as DataTable
  const cell = (v: unknown): boolean => v === null || typeof v === 'string' || typeof v === 'number'
  if (
    !t ||
    typeof t.sheetName !== 'string' ||
    typeof t.fileName !== 'string' ||
    !Array.isArray(t.columns) ||
    !t.columns.every((c) => typeof c?.header === 'string') ||
    !Array.isArray(t.rows) ||
    !t.rows.every((r) => Array.isArray(r) && r.length === t.columns.length && r.every(cell))
  )
    throw new TypeError('Tabla inválida')
  return t
}

function visionProvider(v: unknown): VisionProviderId {
  if (v === 'anthropic' || v === 'openai' || v === 'gemini' || v === 'ollama') return v
  throw new TypeError('Proveedor inválido')
}
