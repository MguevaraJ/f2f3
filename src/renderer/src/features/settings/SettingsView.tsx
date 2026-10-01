import { useEffect, useState, type ReactNode } from 'react'
import { LanguageSelect } from '../../components/LanguageButton'
import type { CloseAction } from '@shared/types'
import type { SystemInfo } from '@shared/ipc'
import { GameFolderPicker } from '../../components/GameFolderPicker'
import { Icon } from '../../components/icons'
import { BackupSettings } from './BackupSettings'
import { api } from '../../lib/api'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toasts'
import { AnalysisSettings } from './AnalysisSettings'
import { Toggle } from '../../components/Toggle'
import { tr } from '@shared/i18n'

export function SettingsView() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [info, setInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    void api.system.info().then(setInfo)
  }, [settings?.fontSource, settings?.screenshotsDirs])

  if (!settings) return null

  const chooseFont = async (): Promise<void> => {
    const f = await api.settings.chooseFontSource()
    if (f) await update({ fontSource: f })
  }
  return (
    <div className="settings">
      <div className="settings-inner">
        <Group
          title={tr('Carpetas de juego')}
          desc={tr(
            'F2+F3 muestra juntas las capturas de las carpetas que marques, lee sus mundos y guarda en cada una los datos para el mod. Estas son las que hay en tu equipo, la más reciente primero.'
          )}
        >
          <GameFolderPicker
            values={settings.screenshotsDirs}
            onChange={(paths) => void update({ screenshotsDirs: paths, gameDirConfirmed: true })}
          />
        </Group>

        <Group
          title={tr('Análisis de capturas')}
          desc={tr(
            'F2+F3 combina tres niveles de información. Cada dato de una captura indica de cuál viene.'
          )}
        >
          <AnalysisSettings
            fontSource={info?.fontSource ?? null}
            onChooseFont={() => void chooseFont()}
          />
          <div>
            <button
              className="btn small ghost"
              onClick={() => void update({ onboardingDone: false })}
            >
              <Icon name="info" size={14} /> {tr('Ver la introducción de nuevo')}
            </button>
          </div>
        </Group>

        <Group
          title={tr('Notificaciones')}
          desc={tr(
            'Mientras F2+F3 esté abierto, te avisa en la esquina de la pantalla cada vez que haces una captura en Minecraft (F2), sin sacarte del juego.'
          )}
        >
          <Toggle
            label={tr('Avisar de capturas nuevas')}
            hint={tr('Muestra un aviso con la miniatura y las coordenadas del F3.')}
            checked={settings.notifyNewShots}
            onChange={(v) => void update({ notifyNewShots: v })}
          />
          <Toggle
            label={tr('Copiar las coordenadas automáticamente')}
            hint={tr(
              'Si la captura tiene el F3 abierto, sus coordenadas quedan listas para pegar (X Y Z).'
            )}
            checked={settings.notifyAutoCopy}
            onChange={(v) => void update({ notifyAutoCopy: v })}
          />
          <p className="muted small">
            {tr('Con el aviso en pantalla,')} <span className="kbd">{tr('Ctrl+Shift+C')}</span>{' '}
            {tr('copia las coordenadas sin salir del juego.')}
          </p>
          <div>
            <button
              className="btn"
              onClick={() =>
                void api.settings.testNotification().catch((e) => toast.error(String(e)))
              }
            >
              <Icon name="eye" size={16} /> {tr('Probar aviso')}
            </button>
          </div>
        </Group>

        <Group
          title={tr('Copia de seguridad en Google Drive')}
          desc={tr(
            'Respalda tus capturas en tu propia cuenta de Google Drive para no perderlas nunca.'
          )}
        >
          <BackupSettings />
        </Group>

        <Group
          title={tr('Segundo plano e inicio')}
          desc={tr(
            'En segundo plano, F2+F3 sigue avisándote de las capturas nuevas y respaldando en Google Drive.'
          )}
        >
          <Toggle
            label={tr('Iniciar F2+F3 al encender el equipo')}
            hint={tr(
              'Se abre en segundo plano, sin mostrar la ventana, para avisarte de tus capturas desde que empiezas a jugar.'
            )}
            checked={settings.launchAtLogin}
            onChange={(v) => void update({ launchAtLogin: v })}
          />
          <label className="field">
            <span>{tr('Cuando cierres la ventana')}</span>
            <select
              className="input"
              value={settings.closeAction}
              onChange={(e) => void update({ closeAction: e.target.value as CloseAction })}
            >
              <option value="ask">{tr('Preguntar cada vez')}</option>
              <option value="background">{tr('Dejar F2+F3 en segundo plano')}</option>
              <option value="quit">{tr('Cerrar F2+F3')}</option>
            </select>
          </label>
          <Toggle
            label={tr('Mostrar icono en la bandeja del sistema')}
            hint={
              info?.platform === 'linux'
                ? tr(
                    'Solo si tu escritorio tiene bandeja (KDE, Cinnamon, XFCE…). Sin ella, vuelve a abrir F2+F3 ejecutándolo de nuevo.'
                  )
                : tr('Para abrir F2+F3 o salir de él mientras está en segundo plano.')
            }
            checked={settings.trayIcon}
            onChange={(v) => void update({ trayIcon: v })}
          />
          <div>
            <button className="btn" onClick={() => void api.system.quit()}>
              <Icon name="logout" size={16} /> {tr('Salir de F2+F3')}
            </button>
          </div>
        </Group>

        <Group title={tr('General')}>
          <label className="map-panel-row">
            {tr('Idioma')}
            <LanguageSelect />
          </label>
          <Toggle
            label={tr('Confirmar antes de eliminar')}
            checked={settings.confirmDelete}
            onChange={(v) => void update({ confirmDelete: v })}
          />
        </Group>

        <Group title={tr('Atajos de teclado')}>
          <div className="shortcuts">
            {[
              ['Enter', tr('Abrir en el visor')],
              ['← →', tr('Anterior / siguiente')],
              ['+ − 0 1', tr('Zoom, ajustar, 100%')],
              ['R / H', tr('Rotar / voltear')],
              ['P', tr('Cuentagotas de píxel')],
              ['I', tr('Panel de información')],
              ['F', tr('Favorita')],
              ['F2', tr('Renombrar')],
              ['Ctrl+C / X / V', tr('Copiar, cortar, pegar')],
              [tr('Supr'), tr('Eliminar')],
              ['Ctrl+F', tr('Buscar')],
              [tr('Ctrl+A'), tr('Seleccionar todo')]
            ].map(([k, d]) => (
              <div key={k} className="shortcut">
                <span className="kbd">{k}</span>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </Group>

        {info && (
          <p className="muted small about">
            F2+F3 {info.version} {tr('· Electron')} {info.electron} · {info.platform}
          </p>
        )}
      </div>
    </div>
  )
}

function Group({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="sgroup">
      <h2>{title}</h2>
      {desc && <p className="muted">{desc}</p>}
      <div className="sgroup-body">{children}</div>
    </section>
  )
}
