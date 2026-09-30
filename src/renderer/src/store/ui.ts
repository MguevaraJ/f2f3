import { create } from 'zustand'
import type { ClipboardMode } from '@shared/types'
import {
  EMPTY_FILTERS,
  type Filters,
  type LibraryView,
  type Query,
  type SortDir,
  type SortKey
} from '../lib/query'

export type Tab = 'gallery' | 'coords' | 'map' | 'settings'

export interface MenuItem {
  label: string
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  action?: () => void
}

export type DialogState =
  | {
      kind: 'prompt'
      title: string
      label: string
      value: string
      confirm: string
      /** Characters to preselect (e.g. the name without extension). */
      selectLength?: number
      /** Accept an empty value (e.g. "automatic"). */
      allowEmpty?: boolean
      onSubmit: (value: string) => void | Promise<void>
    }
  | {
      kind: 'confirm'
      title: string
      message: string
      confirm: string
      danger?: boolean
      onConfirm: () => void | Promise<void>
    }

interface UiState {
  tab: Tab
  query: Query
  selection: string[]
  anchor: string | null
  clipboard: { ids: string[]; mode: ClipboardMode } | null
  viewerId: string | null
  detailsOpen: boolean
  dialog: DialogState | null
  menu: { x: number; y: number; items: MenuItem[] } | null

  setTab(tab: Tab): void
  setView(view: LibraryView): void
  setSearch(search: string): void
  setFilters(patch: Partial<Filters>): void
  resetFilters(): void
  setSort(key: SortKey, dir?: SortDir): void
  select(ids: string[], anchor?: string | null): void
  toggleSelect(id: string): void
  clearSelection(): void
  setClipboard(ids: string[], mode: ClipboardMode): void
  clearClipboard(): void
  openViewer(id: string | null): void
  setDetailsOpen(open: boolean): void
  openDialog(d: DialogState | null): void
  openMenu(x: number, y: number, items: MenuItem[]): void
  closeMenu(): void
}

export const useUi = create<UiState>((set) => ({
  tab: 'gallery',
  query: {
    view: { kind: 'all' },
    search: '',
    filters: EMPTY_FILTERS,
    sort: { key: 'date', dir: 'desc' }
  },
  selection: [],
  anchor: null,
  clipboard: null,
  viewerId: null,
  detailsOpen: true,
  dialog: null,
  menu: null,

  setTab: (tab) => set({ tab }),
  setView: (view) =>
    set((s) => ({ query: { ...s.query, view }, selection: [], anchor: null, tab: 'gallery' })),
  setSearch: (search) => set((s) => ({ query: { ...s.query, search } })),
  setFilters: (patch) =>
    set((s) => ({ query: { ...s.query, filters: { ...s.query.filters, ...patch } } })),
  resetFilters: () => set((s) => ({ query: { ...s.query, filters: EMPTY_FILTERS, search: '' } })),
  setSort: (key, dir) =>
    set((s) => ({
      query: {
        ...s.query,
        sort: {
          key,
          dir:
            dir ??
            (s.query.sort.key === key
              ? s.query.sort.dir === 'asc'
                ? 'desc'
                : 'asc'
              : key === 'name' || key === 'biome' || key === 'dimension'
                ? 'asc'
                : 'desc')
        }
      }
    })),
  select: (ids, anchor) =>
    set((s) => ({ selection: ids, anchor: anchor === undefined ? s.anchor : anchor })),
  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
      anchor: id
    })),
  clearSelection: () => set({ selection: [], anchor: null }),
  setClipboard: (ids, mode) => set({ clipboard: { ids, mode } }),
  clearClipboard: () => set({ clipboard: null }),
  openViewer: (viewerId) => set({ viewerId }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  openDialog: (dialog) => set({ dialog }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null })
}))
