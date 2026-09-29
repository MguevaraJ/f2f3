// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { BackupStatus, SettingsView } from '../src/shared/types'

Object.assign(window, { craftshot: {} })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const { BackupSettings } = await import('../src/renderer/src/features/settings/BackupSettings')
const { useBackup } = await import('../src/renderer/src/store/backup')
const { useSettings } = await import('../src/renderer/src/store/settings')

const base: BackupStatus = {
  configured: true,
  account: { email: 'steve@example.com', name: 'Steve' },
  state: 'idle',
  done: 0,
  total: 0,
  bytesDone: 0,
  bytesTotal: 0,
  lastRun: {
    uploaded: 18,
    updated: 1,
    moved: 2,
    skipped: 0,
    failed: 1,
    remoteOnly: 3,
    bytes: 40_000_000,
    finishedAt: Date.now() - 60_000,
    errors: ['a.png: boom']
  },
  folderUrl: 'https://drive.google.com/drive/folders/x'
}
useSettings.setState({
  settings: { backupAuto: true } as SettingsView
})
const render = (status: BackupStatus): string => {
  useBackup.setState({ status })
  const el = document.createElement('div')
  act(() => createRoot(el).render(createElement(BackupSettings)))
  return el.innerHTML
}

describe('BackupSettings UI', () => {
  it('shows the connected account, actions and the last run', () => {
    const html = render(base)
    expect(html).toContain('steve@example.com')
    expect(html).toContain('Respaldar ahora')
    expect(html).toContain('Restaurar faltantes')
    expect(html).toContain('Ver errores (1)')
  })

  it('shows progress while backing up', () => {
    const html = render({
      ...base,
      state: 'running',
      phase: 'uploading',
      done: 3,
      total: 10,
      bytesDone: 5e6,
      bytesTotal: 2e7,
      current: 'x.png'
    })
    expect(html).toContain('Subiendo 3 de 10')
    expect(html).toContain('Cancelar')
  })

  it('offers a plain "Continuar con Google" sign-in, with no technical setup', () => {
    const html = render({ ...base, account: null })
    expect(html).toContain('Continuar con Google')
    expect(html).not.toMatch(/Client ID|secret|Cloud Console/i)
    expect(render({ ...base, account: null, state: 'connecting' })).toContain(
      'Termina de iniciar sesión'
    )
    expect(render({ ...base, account: null, configured: false })).toContain('no está disponible')
  })
})
