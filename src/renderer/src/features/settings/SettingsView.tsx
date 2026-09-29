import { useEffect, useState, type ReactNode } from 'react'
import type { CloseAction, MinecraftSource } from '@shared/types'
import type { SystemInfo } from '@shared/ipc'
import { Icon } from '../../components/icons'
import { BackupSettings } from './BackupSettings'
import { api } from '../../lib/api'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toasts'

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recomendado)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (más económico)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (el más rápido)' }
]

export function SettingsView() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const setApiKey = useSettings((s) => s.setApiKey)
  const [sources, setSources] = useState<MinecraftSource[] | null>(null)
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void api.settings.detectSources().then(setSources)
    void api.system.info().then(setInfo)
  }, [settings?.fontSource, settings?.screenshotsDir])

  if (!settings) return null

  const chooseDir = async (): Promise<void> => {
    const dir = await api.settings.chooseDirectory()
    if (dir) await update({ screenshotsDir: dir })
  }
  const chooseFont = async (): Promise<void> => {
    const f = await api.settings.chooseFontSource()
    if (f) await update({ fontSource: f })
  }
  const saveKey = async (): Promise<void> => {
    await setApiKey(key)
    setKey('')
    toast.success('API key guardada de forma cifrada')
  }
  const test = async (): Promise<void> => {
    setTesting(true)
    const res = await api.settings.testApiKey()
    setTesting(false)
    if (res.ok) toast.success(res.message)
    else toast.error(res.message)
  }

  return (
    <div className="settings">
      <div className="settings-inner">
        <Group
          title="Carpeta de capturas"
          desc="Craftshot muestra y organiza las imágenes de esta carpeta. Minecraft seguirá guardando nuevas capturas en ella."
        >
          <div className="path-row">
            <code className="path">{settings.screenshotsDir}</code>
            <button className="btn" onClick={() => void chooseDir()}>
              <Icon name="folder" size={16} /> Cambiar
            </button>
          </div>
          {sources && sources.length > 0 && (
            <div className="sources">
              <div className="filter-label">Carpetas detectadas</div>
              {sources.map((s) => (
                <button
                  key={s.path}
                  className={`source ${s.path === settings.screenshotsDir ? 'active' : ''}`}
                  onClick={() => void update({ screenshotsDir: s.path })}
                >
                  <Icon name={s.path === settings.screenshotsDir ? 'check' : 'folder'} size={16} />
                  <span className="source-label">{s.label}</span>
                  <span className="source-path">{s.path}</span>
                  <span className="source-count">{s.count}</span>
                </button>
              ))}
            </div>
          )}
        </Group>

        <Group
          title="Lectura del F3"
          desc="El texto del F3 se lee píxel a píxel con la fuente real de Minecraft, tomada del .jar del juego. No necesita internet."
        >
          <Toggle
            label="Analizar capturas automáticamente"
            hint="Lee el F3 y estima bioma/dimensión de cada captura nueva."
            checked={settings.autoAnalyze}
            onChange={(v) => void update({ autoAnalyze: v })}
          />
          <div className="path-row">
            <code className="path">
              {info?.fontSource ?? 'No se encontró ningún .jar de Minecraft'}
            </code>
            <button className="btn" onClick={() => void chooseFont()}>
              Elegir .jar
            </button>
            {settings.fontSource && (
              <button className="btn ghost" onClick={() => void update({ fontSource: '' })}>
                Automático
              </button>
            )}
          </div>
        </Group>

        <Group
          title="Visión con IA (Claude)"
          desc="Opcional. Envía la captura a la API de Anthropic para identificar bioma, mobs, estructuras, clima y momento del día. Tiene coste por uso en tu cuenta de Anthropic."
        >
          <Toggle
            label="Activar análisis con IA"
            checked={settings.visionEnabled}
            onChange={(v) => void update({ visionEnabled: v })}
          />
          <div className={`vision-options ${settings.visionEnabled ? '' : 'disabled-block'}`}>
            <label className="field">
              <span>API key de Anthropic</span>
              <div className="path-row">
                <input
                  className="input"
                  type="password"
                  placeholder={settings.hasApiKey ? '•••••••••••• (guardada)' : 'sk-ant-…'}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoComplete="off"
                />
                <button
                  className="btn primary"
                  disabled={!key.trim()}
                  onClick={() => void saveKey()}
                >
                  Guardar
                </button>
                {settings.hasApiKey && (
                  <>
                    <button className="btn" disabled={testing} onClick={() => void test()}>
                      {testing ? 'Probando…' : 'Probar'}
                    </button>
                    <button className="btn ghost" onClick={() => void setApiKey(null)}>
                      Borrar
                    </button>
                  </>
                )}
              </div>
              <small className="muted">
                {settings.hasApiKey
                  ? settings.apiKeyEncrypted
                    ? 'Guardada y cifrada con el llavero del sistema.'
                    : 'Guardada (el sistema no ofrece cifrado; se guarda solo en este equipo).'
                  : 'También puedes definir la variable de entorno ANTHROPIC_API_KEY.'}
              </small>
            </label>
            <label className="field">
              <span>Modelo</span>
              <select
                className="input"
                value={settings.visionModel}
                onChange={(e) => void update({ visionModel: e.target.value })}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!MODELS.some((m) => m.id === settings.visionModel) && (
                  <option value={settings.visionModel}>{settings.visionModel}</option>
                )}
              </select>
            </label>
            <Toggle
              label="Analizar con IA cada captura nueva"
              hint="Cuidado: cada captura es una petición a la API."
              checked={settings.visionAuto}
              onChange={(v) => void update({ visionAuto: v })}
            />
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
          title="Al cerrar la ventana"
          desc="En segundo plano, Craftshot sigue avisándote de las capturas nuevas y respaldando en Google Drive."
        >
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

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange(v: boolean): void
}) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </span>
    </label>
  )
}
