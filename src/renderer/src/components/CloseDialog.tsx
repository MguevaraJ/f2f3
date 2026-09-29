import { useEffect, useState } from 'react'
import type { CloseChoice } from '@shared/ipc'
import { api } from '../lib/api'
import { useSettings } from '../store/settings'
import { Icon } from './icons'

/** "Close Craftshot or keep it in the background?" — asked when the window is closed. */
export function CloseDialog() {
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const [platform, setPlatform] = useState('')
  const trayIcon = useSettings((s) => s.settings?.trayIcon ?? false)

  useEffect(() => {
    void api.system.info().then((i) => setPlatform(i.platform))
    return api.system.onConfirmClose(() => {
      setRemember(false)
      setOpen(true)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        answer('cancel')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!open) return null

  function answer(choice: CloseChoice): void {
    setOpen(false)
    void api.system.resolveClose(choice, remember)
  }

  const whereToFind = trayIcon
    ? platform === 'darwin'
      ? 'Lo encontrarás en la barra de menús, arriba a la derecha.'
      : 'Lo encontrarás en la bandeja del sistema, junto al reloj.'
    : 'Para volver a abrirlo, ejecuta Craftshot de nuevo.'

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && answer('cancel')}
    >
      <div className="modal close-modal" role="dialog" aria-modal aria-labelledby="close-title">
        <div className="modal-head">
          <h2 id="close-title">¿Cerrar Craftshot?</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => answer('cancel')}
            aria-label="Cancelar"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <div className="close-option">
            <Icon name="cloud" size={20} />
            <p>
              <b>En segundo plano</b> seguirás recibiendo el aviso de cada captura nueva con sus
              coordenadas, y los respaldos en Google Drive continuarán. {whereToFind}
            </p>
          </div>
          <label className="checkbox remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            No volver a preguntar (puedes cambiarlo en Ajustes)
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={() => answer('quit')}>
            Cerrar Craftshot
          </button>
          <button
            type="button"
            className="btn primary"
            autoFocus
            onClick={() => answer('background')}
          >
            Dejar en segundo plano
          </button>
        </div>
      </div>
    </div>
  )
}
