import { create } from 'zustand'
import type { LocalModelStatus } from '@shared/types'
import { api } from '../lib/api'

export const useLocalModel = create<{ status: LocalModelStatus | null }>(() => ({ status: null }))

export function connectLocalModel(): () => void {
  const off = api.localModel.onStatus((status) => useLocalModel.setState({ status }))
  void api.localModel.status().then((status) => useLocalModel.setState({ status }))
  return off
}
