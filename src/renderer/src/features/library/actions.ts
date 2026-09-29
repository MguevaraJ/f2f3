import type { ClipboardMode } from '@shared/types'
import type { DataTable, ExportFormat, TableFormat } from '@shared/ipc'
import { api } from '../../lib/api'
import { formatBytes, plural } from '../../lib/format'
import { PROVIDER_LABEL } from '../../lib/sources'
import { useLibrary } from '../../store/library'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toasts'
import { useUi } from '../../store/ui'

/**
 * User-level commands. Components call these instead of talking to the API
 * directly, so feedback (toasts, dialogs, selection updates) stays consistent.
 */

const errorOf = (e: unknown): string =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    toast.error(errorOf(e))
    return undefined
  }
}

/** Folder new items / pastes go to: the folder being browsed, or the root. */
export function currentFolder(): string {
  const view = useUi.getState().query.view
  return view.kind === 'folder' ? view.path : ''
}

export function newFolder(parent = currentFolder()): void {
  useUi.getState().openDialog({
    kind: 'prompt',
    title: 'Nueva carpeta',
    label: 'Nombre de la carpeta',
    value: 'Nueva carpeta',
    confirm: 'Crear',
    onSubmit: async (name) => {
      const res = await api.library.createFolder(parent, name)
      if (!res.ok) throw new Error(res.errors[0])
      toast.success(`Carpeta "${name}" creada`)
    }
  })
}

export function renameItem(id: string, isFolder = false): void {
  const name = id.split('/').pop() ?? id
  const dot = name.lastIndexOf('.')
  useUi.getState().openDialog({
    kind: 'prompt',
    title: isFolder ? 'Renombrar carpeta' : 'Renombrar captura',
    label: 'Nuevo nombre',
    value: name,
    selectLength: !isFolder && dot > 0 ? dot : name.length,
    confirm: 'Renombrar',
    onSubmit: async (next) => {
      const res = await api.library.rename(id, next)
      if (!res.ok) throw new Error(res.errors[0])
      const ui = useUi.getState()
      if (isFolder) {
        const view = ui.query.view
        if (view.kind === 'folder' && (view.path === id || view.path.startsWith(id + '/')))
          ui.setView({ ...view, path: res.ids[0] + view.path.slice(id.length) })
      } else {
        ui.select(res.ids, res.ids[0])
        if (ui.viewerId === id) ui.openViewer(res.ids[0])
      }
    }
  })
}

export function deleteItems(ids: string[], isFolder = false): void {
  if (!ids.length) return
  const run = async (): Promise<void> => {
    const res = await api.library.remove(ids)
    if (!res.ok) throw new Error(res.errors[0])
    const ui = useUi.getState()
    ui.select(ui.selection.filter((s) => !ids.includes(s)))
    if (ui.viewerId && ids.includes(ui.viewerId)) ui.openViewer(null)
    toast.success(
      isFolder
        ? 'Carpeta enviada a la papelera'
        : `${plural(ids.length, 'captura enviada', 'capturas enviadas')} a la papelera`
    )
  }
  if (useSettings.getState().settings?.confirmDelete === false) {
    void guard(run)
    return
  }
  useUi.getState().openDialog({
    kind: 'confirm',
    title: isFolder
      ? 'Eliminar carpeta'
      : ids.length === 1
        ? 'Eliminar captura'
        : `Eliminar ${ids.length} capturas`,
    message: isFolder
      ? `La carpeta "${ids[0]}" y todo su contenido se moverán a la papelera del sistema.`
      : `${plural(ids.length, 'captura se moverá', 'capturas se moverán')} a la papelera del sistema. Podrás recuperarlas desde allí.`,
    confirm: 'Eliminar',
    danger: true,
    onConfirm: run
  })
}

export function toClipboard(ids: string[], mode: ClipboardMode): void {
  if (!ids.length) return
  useUi.getState().setClipboard(ids, mode)
  toast.info(
    `${plural(ids.length, 'elemento', 'elementos')} ${mode === 'cut' ? 'cortado' : 'copiado'}${ids.length === 1 ? '' : 's'} · Ctrl+V para pegar`
  )
}

export async function paste(target = currentFolder()): Promise<void> {
  const clip = useUi.getState().clipboard
  if (!clip) return
  await guard(async () => {
    const res = await api.library.paste(clip.ids, target, clip.mode)
    if (!res.ok) throw new Error(res.errors[0])
    if (clip.mode === 'cut') useUi.getState().clearClipboard()
    useUi.getState().select(res.ids, res.ids[0] ?? null)
    toast.success(
      `${plural(res.ids.length, 'elemento pegado', 'elementos pegados')} en ${target ? `"${target}"` : 'la raíz'}`
    )
  })
}

export async function moveTo(
  ids: string[],
  target: string,
  mode: ClipboardMode = 'cut'
): Promise<void> {
  await guard(async () => {
    const res = await api.library.paste(ids, target, mode)
    if (!res.ok) throw new Error(res.errors[0])
    toast.success(
      `${plural(res.ids.length, 'captura movida', 'capturas movidas')} a ${target ? `"${target}"` : 'la raíz'}`
    )
  })
}

export async function importFiles(paths: string[], target = currentFolder()): Promise<void> {
  await guard(async () => {
    const res = await api.library.importFiles(paths, target)
    if (!res.ok) throw new Error(res.errors[0])
    toast.success(`${plural(res.ids.length, 'archivo importado', 'archivos importados')}`)
  })
}

export async function copyText(text: string, what = 'Texto'): Promise<void> {
  await guard(async () => {
    await api.system.copyText(text)
    toast.success(`${what} copiado`)
  })
}

export async function copyImage(id: string): Promise<void> {
  await guard(async () => {
    await api.library.copyImage(id)
    toast.success('Imagen copiada al portapapeles')
  })
}

export const reveal = (id: string): Promise<void | undefined> => guard(() => api.library.reveal(id))
export const openExternal = (id: string): Promise<void | undefined> =>
  guard(() => api.library.openExternal(id))

export function toggleFavorite(ids: string[]): void {
  const lib = useLibrary.getState()
  const allFav = ids.every((id) => lib.byId.get(id)?.meta.favorite)
  for (const id of ids) void lib.setMeta(id, { favorite: !allFav })
}

export async function reanalyze(ids: string[]): Promise<void> {
  await guard(async () => {
    await api.analysis.reanalyze(ids)
    toast.info(`Reanalizando ${plural(ids.length, 'captura', 'capturas')}…`)
  })
}

export async function analyzeWithAi(ids: string[]): Promise<void> {
  const s = useSettings.getState().settings
  const provider = s?.visionProvider ?? 'anthropic'
  const ready =
    !!s?.visionEnabled &&
    !!s.visionModels[provider] &&
    (provider === 'ollama' || s.apiKeys[provider])
  if (!ready) {
    toast.info(
      'La IA avanzada es opcional: actívala y configúrala en Ajustes › Análisis de capturas'
    )
    useUi.getState().setTab('settings')
    return
  }
  const run = async (): Promise<void> => {
    await api.analysis.vision(ids)
    toast.info(
      `Analizando ${plural(ids.length, 'captura', 'capturas')} con ${PROVIDER_LABEL[provider]}…`
    )
  }
  if (ids.length <= 3 || provider === 'ollama') {
    await guard(run)
    return
  }
  // Cloud providers bill per request: make bulk runs explicit.
  useUi.getState().openDialog({
    kind: 'confirm',
    title: 'Analizar con IA avanzada',
    message: `Se enviarán ${ids.length} capturas a ${PROVIDER_LABEL[provider]} (${s.visionModels[provider]}). Cada captura es una petición que puede tener coste en tu cuenta.`,
    confirm: `Analizar ${ids.length}`,
    onConfirm: run
  })
}

export async function exportData(ids: string[], format: ExportFormat): Promise<void> {
  await guard(async () => {
    const path = await api.library.exportData(ids, format)
    if (path) toast.success(`Exportado a ${path}`)
  })
}

export async function exportZip(ids: string[]): Promise<void> {
  if (!ids.length) return
  await guard(async () => {
    const res = await api.library.exportZip(ids)
    if (res)
      toast.success(
        `${plural(res.files, 'captura guardada', 'capturas guardadas')} en ${res.path} (${formatBytes(res.bytes)})`
      )
  })
}

export async function exportTable(table: DataTable, format: TableFormat): Promise<void> {
  if (!table.rows.length) return
  await guard(async () => {
    const path = await api.library.exportTable(table, format)
    if (path)
      toast.success(`${plural(table.rows.length, 'fila exportada', 'filas exportadas')} a ${path}`)
  })
}

export async function setBiome(id: string, biome: string | null): Promise<void> {
  await guard(() => api.analysis.setBiome(id, biome))
}
