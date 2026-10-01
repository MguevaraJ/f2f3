import type { ClipboardMode } from '@shared/types'
import type { DataTable, ExportFormat, TableFormat } from '@shared/ipc'
import { api } from '../../lib/api'
import { formatBytes, plural } from '../../lib/format'
import { PROVIDER_LABEL } from '../../lib/sources'
import { useLibrary } from '../../store/library'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toasts'
import { useUi } from '../../store/ui'
import { tr } from '@shared/i18n'

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
    title: tr('Nueva carpeta'),
    label: tr('Nombre de la carpeta'),
    value: tr('Nueva carpeta'),
    confirm: tr('Crear'),
    onSubmit: async (name) => {
      const res = await api.library.createFolder(parent, name)
      if (!res.ok) throw new Error(res.errors[0])
      toast.success(tr('Carpeta "{0}" creada', name))
    }
  })
}

/** Assigns screenshots to a world (used by the map); empty = automatic (mod or folder). */
export function assignWorld(ids: string[]): void {
  const lib = useLibrary.getState()
  const first = lib.byId.get(ids[0])
  useUi.getState().openDialog({
    kind: 'prompt',
    title: ids.length > 1 ? tr('Asignar mundo a {0} capturas', ids.length) : tr('Asignar mundo'),
    label: tr('Nombre del mundo (vacío = automático)'),
    value: first?.meta.world ?? '',
    confirm: tr('Asignar'),
    allowEmpty: true,
    onSubmit: async (world) => {
      for (const id of ids) await lib.setMeta(id, { world: world.trim() })
    }
  })
}

export function renameItem(id: string, isFolder = false): void {
  const name = id.split('/').pop() ?? id
  const dot = name.lastIndexOf('.')
  useUi.getState().openDialog({
    kind: 'prompt',
    title: isFolder ? tr('Renombrar carpeta') : tr('Renombrar captura'),
    label: tr('Nuevo nombre'),
    value: name,
    selectLength: !isFolder && dot > 0 ? dot : name.length,
    confirm: tr('Renombrar'),
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
        ? tr('Carpeta enviada a la papelera')
        : tr(
            '{0} a la papelera',
            plural(ids.length, tr('captura enviada'), tr('capturas enviadas'))
          )
    )
  }
  if (useSettings.getState().settings?.confirmDelete === false) {
    void guard(run)
    return
  }
  useUi.getState().openDialog({
    kind: 'confirm',
    title: isFolder
      ? tr('Eliminar carpeta')
      : ids.length === 1
        ? tr('Eliminar captura')
        : tr('Eliminar {0} capturas', ids.length),
    message: isFolder
      ? tr('La carpeta "{0}" y todo su contenido se moverán a la papelera del sistema.', ids[0])
      : tr(
          '{0} a la papelera del sistema. Podrás recuperarlas desde allí.',
          plural(ids.length, tr('captura se moverá'), tr('capturas se moverán'))
        ),
    confirm: tr('Eliminar'),
    danger: true,
    onConfirm: run
  })
}

export function toClipboard(ids: string[], mode: ClipboardMode): void {
  if (!ids.length) return
  useUi.getState().setClipboard(ids, mode)
  toast.info(
    tr(
      '{0} {1}{2} · Ctrl+V para pegar',
      plural(ids.length, tr('elemento'), tr('elementos')),
      mode === 'cut' ? tr('cortado') : tr('copiado'),
      ids.length === 1 ? '' : 's'
    )
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
      `${plural(res.ids.length, tr('elemento pegado'), tr('elementos pegados'))} en ${target ? `"${target}"` : tr('la raíz')}`
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
      `${plural(res.ids.length, tr('captura movida'), tr('capturas movidas'))} a ${target ? `"${target}"` : tr('la raíz')}`
    )
  })
}

export async function importFiles(paths: string[], target = currentFolder()): Promise<void> {
  await guard(async () => {
    const res = await api.library.importFiles(paths, target)
    if (!res.ok) throw new Error(res.errors[0])
    toast.success(`${plural(res.ids.length, tr('archivo importado'), tr('archivos importados'))}`)
  })
}

export async function copyText(text: string, what = tr('Texto')): Promise<void> {
  await guard(async () => {
    await api.system.copyText(text)
    toast.success(tr('{0} copiado', what))
  })
}

export async function copyImage(id: string): Promise<void> {
  await guard(async () => {
    await api.library.copyImage(id)
    toast.success(tr('Imagen copiada al portapapeles'))
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
    toast.info(tr('Reanalizando {0}…', plural(ids.length, tr('captura'), tr('capturas'))))
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
      tr('La IA avanzada es opcional: actívala y configúrala en Ajustes › Análisis de capturas')
    )
    useUi.getState().setTab('settings')
    return
  }
  const run = async (): Promise<void> => {
    await api.analysis.vision(ids)
    toast.info(
      tr(
        'Analizando {0} con {1}…',
        plural(ids.length, tr('captura'), tr('capturas')),
        PROVIDER_LABEL[provider]
      )
    )
  }
  if (ids.length <= 3 || provider === 'ollama') {
    await guard(run)
    return
  }
  // Cloud providers bill per request: make bulk runs explicit.
  useUi.getState().openDialog({
    kind: 'confirm',
    title: tr('Analizar con IA avanzada'),
    message: tr(
      'Se enviarán {0} capturas a {1} ({2}). Cada captura es una petición que puede tener coste en tu cuenta.',
      ids.length,
      PROVIDER_LABEL[provider],
      s.visionModels[provider]
    ),
    confirm: tr('Analizar {0}', ids.length),
    onConfirm: run
  })
}

export async function exportData(ids: string[], format: ExportFormat): Promise<void> {
  await guard(async () => {
    const path = await api.library.exportData(ids, format)
    if (path) toast.success(tr('Exportado a {0}', path))
  })
}

export async function exportZip(ids: string[]): Promise<void> {
  if (!ids.length) return
  await guard(async () => {
    const res = await api.library.exportZip(ids)
    if (res)
      toast.success(
        `${plural(res.files, tr('captura guardada'), tr('capturas guardadas'))} en ${res.path} (${formatBytes(res.bytes)})`
      )
  })
}

export async function exportTable(table: DataTable, format: TableFormat): Promise<void> {
  if (!table.rows.length) return
  await guard(async () => {
    const path = await api.library.exportTable(table, format)
    if (path)
      toast.success(
        `${plural(table.rows.length, tr('fila exportada'), tr('filas exportadas'))} a ${path}`
      )
  })
}

export async function setBiome(id: string, biome: string | null): Promise<void> {
  await guard(() => api.analysis.setBiome(id, biome))
}
