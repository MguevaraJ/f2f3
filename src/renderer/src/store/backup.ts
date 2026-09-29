import { create } from 'zustand'
import type { BackupStatus } from '@shared/types'
import { api } from '../lib/api'

interface BackupStore {
  status: BackupStatus | null
}

export const useBackup = create<BackupStore>(() => ({ status: null }))

/** Mirrors the main-process backup status into the store. */
export function connectBackup(): () => void {
  const off = api.backup.onStatus((status) => useBackup.setState({ status }))
  void api.backup.status().then((status) => useBackup.setState({ status }))
  return off
}
