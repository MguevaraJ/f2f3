import { useEffect, useState, type ReactNode } from 'react'
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
          title="Carpetas de juego"
          desc="Craftshot muestra juntas las capturas de las carpetas que marques, lee sus mundos y guarda en cada una los datos para el mod. Estas son las que hay en tu equipo, la más reciente primero."
        >
          <GameFolderPicker
            values={settings.screenshotsDirs}
            onChange={(paths) => void update({ screenshotsDirs: paths, gameDirConfirmed: true })}
          />
        </Group>

        <Group
          title="Análisis de capturas"
          desc="Craftshot combina tres niveles de información. Cada dato de una captura indica de cuál viene."
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
              <Icon name="info" size={14} /> Ver la introducción de nuevo
            </button>
          </div>
        </Group>

        <Group
          title="Notificaciones"
          desc="Mientras Craftshot esté abierto, te avisa en la esquina de la pantalla cada vez que haces una captura en Minecraft (F2), sin sacarte del juego."
        >
          <Toggle
            label="Avisar de capturas nuevas"
            hint="Muestra un aviso con la miniatura y las coordenadas del F3."
            checked={settings.notifyNewShots}
            onChange={(v) => void update({ notifyNewShots: v })}
          />
          <Toggle
            label="Copiar las coordenadas automáticamente"
            hint="Si la captura tiene el F3 abierto, sus coordenadas quedan listas para pegar (X Y Z)."
            checked={settings.notifyAutoCopy}
            onChange={(v) => void update({ notifyAutoCopy: v })}
          />
          <p className="muted small">
            Con el aviso en pantalla, <span className="kbd">Ctrl+Shift+C</span> copia las
            coordenadas sin salir del juego.
          </p>
          <div>
            <button
              className="btn"
              onClick={() =>
                void api.settings.testNotification().catch((e) => toast.error(String(e)))
              }
            >
              <Icon name="eye" size={16} /> Probar aviso
            </button>
          </div>
        </Group>

        <Group
          title="Copia de seguridad en Google Drive"
          desc="Respalda tus capturas en tu propia cuenta de Google Drive para no perderlas nunca."
        >
          <BackupSettings />
        </Group>

        <Group
          title="Segundo plano e inicio"
          desc="En segundo plano, Craftshot sigue avisándote de las capturas nuevas y respaldando en Google Drive."
        >
          <Toggle
            label="Iniciar Craftshot al encender el equipo"
            hint="Se abre en segundo plano, sin mostrar la ventana, para avisarte de tus capturas desde que empiezas a jugar."
            checked={settings.launchAtLogin}
            onChange={(v) => void update({ launchAtLogin: v })}
          />
          <label className="field">
            <span>Cuando cierres la ventana</span>
            <select
              className="input"
              value={settings.closeAction}
              onChange={(e) => void update({ closeAction: e.target.value as CloseAction })}
            >
              <option value="ask">Preguntar cada vez</option>
              <option value="background">Dejar Craftshot en segundo plano</option>
              <option value="quit">Cerrar Craftshot</option>
            </select>
          </label>
          <Toggle
            label="Mostrar icono en la bandeja del sistema"
            hint={
              info?.platform === 'linux'
                ? 'Solo si tu escritorio tiene bandeja (KDE, Cinnamon, XFCE…). Sin ella, vuelve a abrir Craftshot ejecutándolo de nuevo.'
                : 'Para abrir Craftshot o salir de él mientras está en segundo plano.'
            }
            checked={settings.trayIcon}
            onChange={(v) => void update({ trayIcon: v })}
          />
          <div>
            <button className="btn" onClick={() => void api.system.quit()}>
              <Icon name="logout" size={16} /> Salir de Craftshot
            </button>
          </div>
        </Group>

        <Group title="General">
          <Toggle
            label="Confirmar antes de eliminar"
            checked={settings.confirmDelete}
            onChange={(v) => void update({ confirmDelete: v })}
          />
        </Group>

        <Group title="Atajos de teclado">
          <div className="shortcuts">
            {[
              ['Enter', 'Abrir en el visor'],
              ['← →', 'Anterior / siguiente'],
              ['+ − 0 1', 'Zoom, ajustar, 100%'],
              ['R / H', 'Rotar / voltear'],
              ['P', 'Cuentagotas de píxel'],
              ['I', 'Panel de información'],
              ['F', 'Favorita'],
              ['F2', 'Renombrar'],
              ['Ctrl+C / X / V', 'Copiar, cortar, pegar'],
              ['Supr', 'Eliminar'],
              ['Ctrl+F', 'Buscar'],
              ['Ctrl+A', 'Seleccionar todo']
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
            Craftshot {info.version} · Electron {info.electron} · {info.platform}
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
