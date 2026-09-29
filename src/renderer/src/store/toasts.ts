import { create } from 'zustand'

export interface Toast {
  id: number
  level: 'info' | 'success' | 'error'
  message: string
}

interface ToastState {
  toasts: Toast[]
  push(level: Toast['level'], message: string): void
  dismiss(id: number): void
}

let seq = 0

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (level, message) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, level, message }] }))
    window.setTimeout(() => get().dismiss(id), level === 'error' ? 6000 : 2600)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  info: (m: string) => useToasts.getState().push('info', m),
  success: (m: string) => useToasts.getState().push('success', m),
  error: (m: string) => useToasts.getState().push('error', m)
}
