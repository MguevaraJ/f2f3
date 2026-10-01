import { GoogleButton } from '../../components/GoogleButton'
import { Icon } from '../../components/icons'
import { api } from '../../lib/api'
import { formatBytes, formatDateTime, formatRelative, plural } from '../../lib/format'
import { useBackup } from '../../store/backup'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toasts'
import { useUi } from '../../store/ui'
import { tr } from '@shared/i18n'

const errorText = (e: unknown): string =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)

/** "Copia de seguridad en Google Drive" section of the settings tab. */
export function BackupSettings() {
  const status = useBackup((s) => s.status)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const openDialog = useUi((s) => s.openDialog)

  if (!status || !settings) return null
  const running = status.state === 'running'
  const connecting = status.state === 'connecting'
  const last = status.lastRun

  const connect = async (): Promise<void> => {
    const s = await api.backup.connect()
    if (s.account)
      toast.success(tr('Sesión iniciada como {0}. Empezando el respaldo…', s.account.email))
    else if (s.error) toast.error(s.error)
  }
  const runNow = async (): Promise<void> => {
    try {
      const r = await api.backup.run()
      if (r && !r.errors.length)
        toast.success(
          r.uploaded + r.updated + r.moved
            ? tr(
                'Respaldo completo: {0}{1}',
                plural(r.uploaded + r.updated, tr('captura subida'), tr('capturas subidas')),
                r.moved ? tr(', {0} reorganizadas', r.moved) : ''
              )
            : tr('Todo está respaldado')
        )
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  const restore = (): void =>
    openDialog({
      kind: 'confirm',
      title: tr('Restaurar desde Google Drive'),
      message: tr(
        'Se descargarán a tu carpeta de capturas las imágenes respaldadas que ya no están en tu equipo. Nunca se sobrescribe un archivo existente.'
      ),
      confirm: tr('Restaurar'),
      onConfirm: async () => {
        const r = await api.backup.restore()
        toast.success(
          r.restored
            ? `${plural(r.restored, tr('captura restaurada'), tr('capturas restauradas'))}`
            : tr('No faltaba ninguna captura')
        )
      }
    })
  const disconnect = (): void =>
    openDialog({
      kind: 'confirm',
      title: tr('Desconectar Google Drive'),
      message: tr(
        'F2+F3 dejará de respaldar y revocará su acceso a tu cuenta. Las copias que ya están en Drive no se borran.'
      ),
      confirm: tr('Desconectar'),
      danger: true,
      onConfirm: async () => {
        await api.backup.disconnect()
        toast.info(tr('Google Drive desconectado'))
      }
    })

  return (
    <div className="backup">
      {status.account ? (
        <>
          <div className="backup-account">
            <div className="backup-avatar">
              {(status.account.name || status.account.email)[0]?.toUpperCase()}
            </div>
            <div className="backup-who">
              <strong>{status.account.name}</strong>
              <span className="muted">{status.account.email}</span>
            </div>
            <span className="drive-chip">
              <Icon name="cloud" size={14} /> {tr('Google Drive')}
            </span>
          </div>

          {running ? (
            <div className="backup-progress">
              <div className="backup-progress-head">
                <span>
                  {status.phase === 'scanning'
                    ? tr('Revisando capturas locales…')
                    : status.phase === 'listing'
                      ? tr('Consultando Google Drive…')
                      : status.phase === 'restoring'
                        ? tr('Restaurando {0} de {1}', status.done, status.total)
                        : tr('Subiendo {0} de {1}', status.done, status.total)}
                </span>
                <span className="muted">
                  {status.bytesTotal > 0 &&
                    `${formatBytes(status.bytesDone)} / ${formatBytes(status.bytesTotal)}`}
                </span>
              </div>
              <div className="progress">
                <div
                  className="progress-fill"
                  style={{ width: `${(status.done / Math.max(1, status.total)) * 100}%` }}
                />
              </div>
              {status.current && <div className="muted small ellipsis">{status.current}</div>}
              <button className="btn small" onClick={() => void api.backup.cancel()}>
                {tr('Cancelar')}
              </button>
            </div>
          ) : (
            <div className="backup-actions">
              <button className="btn primary" onClick={() => void runNow()}>
                <Icon name="cloudUp" size={17} /> {tr('Respaldar ahora')}
              </button>
              <button
                className="btn"
                disabled={!status.folderUrl}
                onClick={() => void api.backup.openFolder()}
              >
                <Icon name="external" size={16} /> {tr('Abrir en Drive')}
              </button>
              <button
                className="btn"
                onClick={restore}
                title={tr('Descarga las capturas respaldadas que faltan en tu equipo')}
              >
                <Icon name="download" size={16} /> {tr('Restaurar faltantes')}
              </button>
              <div className="toolbar-spacer" />
              <button className="btn ghost" onClick={disconnect}>
                <Icon name="logout" size={16} /> {tr('Desconectar')}
              </button>
            </div>
          )}

          {status.error && !running && <div className="details-error">{status.error}</div>}

          {last && !running && (
            <div className="backup-last">
              <div>
                <span className="muted">{tr('Último respaldo')}</span>
                <strong title={formatDateTime(last.finishedAt)}>
                  {formatRelative(last.finishedAt)}
                </strong>
              </div>
              <div>
                <span className="muted">{tr('Subidas')}</span>
                <strong>{last.uploaded + last.updated}</strong>
              </div>
              <div>
                <span className="muted">{tr('Ya respaldadas')}</span>
                <strong>{last.skipped}</strong>
              </div>
              <div>
                <span className="muted">{tr('Reorganizadas')}</span>
                <strong>{last.moved}</strong>
              </div>
              <div>
                <span className="muted">{tr('Solo en Drive')}</span>
                <strong>{last.remoteOnly}</strong>
              </div>
              <div>
                <span className="muted">{tr('Fallidas')}</span>
                <strong className={last.failed ? 'bad' : ''}>{last.failed}</strong>
              </div>
            </div>
          )}
          {last && last.errors.length > 0 && !running && (
            <details className="backup-errors">
              <summary>
                {tr('Ver errores (')}
                {last.errors.length})
              </summary>
              <ul>
                {last.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}

          <label className="toggle-row">
            <span>
              <span className="toggle-label">{tr('Respaldar automáticamente')}</span>
              <small className="muted">
                {tr('Sube las capturas nuevas unos segundos después de hacerlas.')}
              </small>
            </span>
            <span className="switch">
              <input
                type="checkbox"
                checked={settings.backupAuto}
                onChange={(e) => void update({ backupAuto: e.target.checked })}
              />
            </span>
          </label>
          <p className="muted small">
            {tr('Las capturas se guardan en')} <b>{tr('Mi unidad › F2+F3')}</b>
            {tr(', con tus mismas carpetas y un archivo')} <code>{tr('f2f3-datos.json')}</code>{' '}
            {tr(
              'con notas, favoritas y datos del F3. El respaldo nunca borra nada de Drive. F2+F3 solo puede ver los archivos que él mismo crea.'
            )}
          </p>
        </>
      ) : (
        <div className="backup-signin">
          <div className="backup-signin-art">
            <Icon name="cloud" size={30} />
          </div>
          <div className="backup-signin-text">
            <strong>{tr('Guarda tus capturas en la nube')}</strong>
            <span className="muted">
              {tr(
                'Inicia sesión con tu cuenta de Google y F2+F3 guardará una copia de todas tus capturas en tu Google Drive, y la mantendrá al día cada vez que hagas una nueva.'
              )}
            </span>
          </div>
          {connecting ? (
            <div className="backup-waiting">
              <span className="spinner" />
              <span>
                {tr(
                  'Termina de iniciar sesión en la ventana de Google que se abrió en tu navegador…'
                )}
              </span>
              <button className="btn small ghost" onClick={() => void api.backup.cancelConnect()}>
                {tr('Cancelar')}
              </button>
            </div>
          ) : status.configured ? (
            <GoogleButton onClick={() => void connect()} />
          ) : (
            <p className="muted small">
              {tr('El inicio de sesión con Google no está disponible en esta versión de F2+F3.')}
            </p>
          )}
          {status.error && <div className="details-error">{status.error}</div>}
          <p className="backup-privacy muted small">
            {tr(
              'F2+F3 solo podrá ver y administrar los archivos que él mismo guarde en tu Drive; nunca el resto de tus archivos. Puedes desconectarlo cuando quieras.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
