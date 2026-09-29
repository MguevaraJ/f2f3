import { create } from 'zustand'
import type { AppSettings, SettingsView } from '@shared/types'
import { api } from '../lib/api'

interface SettingsState {
  settings: SettingsView | null
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
  setApiKey(key: string | null): Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  load: async () => set({ settings: await api.settings.get() }),
  update: async (patch) => {
    set((s) => (s.settings ? { settings: { ...s.settings, ...patch } } : s)) // optimistic
    set({ settings: await api.settings.update(patch) })
  },
  setApiKey: async (key) => set({ settings: await api.settings.setApiKey(key) })
}))
