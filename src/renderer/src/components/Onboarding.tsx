import { useState } from 'react'
import type { MinecraftSource } from '@shared/types'
import { api } from '../lib/api'
import { LEVELS, MOD_LEVEL, SOURCE_INFO } from '../lib/sources'
import { useLocalModel } from '../store/localModel'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { GameFolderPicker } from './GameFolderPicker'
import { GrassBlock, Icon } from './icons'
import { McText } from './McText'

const STEPS = ['Inicio', 'Tu Minecraft', 'Niveles', 'Modelo local', 'Consejo F3'] as const
const FOLDER_STEP = 1

/**
 * First-run introduction: what Craftshot does, which game folder it works with and where
 * each piece of data comes from. The game folder is the one thing that cannot be skipped;
 * users from before that step existed are asked just that, once.
 */
export function Onboarding() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const local = useLocalModel((s) => s.status)
  const setTab = useUi((s) => s.setTab)
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  if (!settings || (settings.onboardingDone && settings.gameDirConfirmed)) return null

  const folder = picked ?? settings.screenshotsDir
  const confirmFolder = (): Promise<void> =>
    update({ screenshotsDir: folder, gameDirConfirmed: true })
  // New users start from where they played last; the rest keep their folder unless it is gone.
  const preselect = (found: MinecraftSource[]): void => {
    const keep = settings.onboardingDone && found.some((s) => s.path === settings.screenshotsDir)
    if (!picked && !keep && found[0]) setPicked(found[0].path)
  }
  const folderStep = (
    <div className="onb-folder">
      <h2>¿Dónde juegas?</h2>
      <p>
        Craftshot trabaja con la carpeta del juego: de ahí salen tus capturas, tus mundos y el sitio
        del mod. Encontré estas; la primera es donde jugaste por última vez.
      </p>
      <GameFolderPicker
        value={folder}
        current={
          settings.gameDirConfirmed || settings.onboardingDone ? settings.screenshotsDir : ''
        }
        onChange={setPicked}
        onLoaded={preselect}
      />
      <p className="muted small">Puedes cambiarla cuando quieras en Ajustes.</p>
    </div>
  )

  if (settings.onboardingDone) {
    return (
      <div className="modal-backdrop onboarding-backdrop">
        <div className="modal onboarding" role="dialog" aria-modal aria-label="Carpeta del juego">
          <div className="onb-body">{folderStep}</div>
          <div className="modal-foot onb-foot">
            <div className="toolbar-spacer" />
            <button className="btn primary" onClick={() => void confirmFolder()}>
              Usar esta carpeta
            </button>
          </div>
        </div>
      </div>
    )
  }

  const finish = (goToSettings = false): void => {
    if (!settings.gameDirConfirmed) {
      setStep(FOLDER_STEP)
      return
    }
    void update({ onboardingDone: true })
    if (goToSettings) setTab('settings')
  }
  const go = (to: number): void => {
    // Leaving the folder step forwards confirms it; nothing past it opens before that.
    if (step === FOLDER_STEP && to > step) void confirmFolder()
    else if (to > FOLDER_STEP && !settings.gameDirConfirmed) to = FOLDER_STEP
    setStep(to)
  }
  const last = step === STEPS.length - 1

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div
        className="modal onboarding"
        role="dialog"
        aria-modal
        aria-label="Introducción a Craftshot"
      >
        <div className="onb-steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              className={`onb-step ${i === step ? 'on' : i < step ? 'done' : ''}`}
              onClick={() => go(i)}
            >
              <span>{i + 1}</span> {s}
            </button>
          ))}
        </div>

        <div className="onb-body">
          {step === 0 && (
            <div className="onb-welcome">
              <GrassBlock size={64} />
              <McText text="CRAFTSHOT" scale={4} />
              <p>
                Tus capturas de Minecraft, organizadas. Craftshot lee la pantalla <b>F3</b> de cada
                captura y te da las coordenadas listas para copiar, además del bioma, los mobs y
                más.
              </p>
              <ul className="onb-list">
                <li>
                  <Icon name="pin" size={16} /> Coordenadas, chunk, región y comando /tp en un clic
                </li>
                <li>
                  <Icon name="eye" size={16} /> Visor con zoom, filtros, búsqueda y carpetas
                </li>
                <li>
                  <Icon name="cloud" size={16} /> Aviso al hacer una captura y respaldo en Google
                  Drive
                </li>
              </ul>
            </div>
          )}

          {step === FOLDER_STEP && folderStep}

          {step === 2 && (
            <div className="onb-levels">
              <h2>Tres niveles de información (y un extra)</h2>
              <p className="muted">
                No todas las capturas dicen lo mismo. Por eso cada dato lleva una etiqueta que
                indica de dónde viene:
              </p>
              {LEVELS.map((l, i) => {
                const source = (['f3', 'local', 'vision'] as const)[i]
                return (
                  <div key={l.id} className={`onb-level level-${l.id}`}>
                    <span className="level-number">{l.number}</span>
                    <div>
                      <div className="onb-level-title">
                        <strong>{l.title}</strong>
                        <span className={`source-tag ${source}`}>{SOURCE_INFO[source].tag}</span>
                        <span className="level-badge">{l.badge}</span>
                      </div>
                      <p>{l.gives}</p>
                      <p className="muted small">{l.needs}</p>
                    </div>
                  </div>
                )
              })}
              <div className="onb-level level-mod">
                <span className="level-number">+</span>
                <div>
                  <div className="onb-level-title">
                    <strong>{MOD_LEVEL.title}</strong>
                    <span className="source-tag mod">{SOURCE_INFO.mod.tag}</span>
                    <span className="level-badge">{MOD_LEVEL.badge}</span>
                  </div>
                  <p>{MOD_LEVEL.gives}</p>
                  <p className="muted small">
                    Opcional, para Fabric 26.3. Lo encuentras en Ajustes › Análisis.
                  </p>
                </div>
              </div>
              <p className="muted small">
                Si ninguno responde, se usa una aproximación por colores con la etiqueta{' '}
                <span className="source-tag heuristic">Colores</span>. Siempre puedes corregir el
                bioma a mano.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="onb-local">
              <h2>¿Descargar el modelo local?</h2>
              <p>
                Reconoce de forma básica el <b>bioma</b> y el <b>mob que tienes en la mira</b> en
                capturas sin F3. Funciona en tu equipo: gratis, sin internet y sin enviar tus
                capturas a nadie.
              </p>
              <p className="muted small">
                Es conservador: solo da un resultado cuando está bastante seguro. Descarga única de
                ~{local?.sizeMB ?? 170} MB.
              </p>
              {local?.state === 'ready' ? (
                <div className="state-pill on big">
                  <Icon name="check" size={16} /> Modelo listo
                </div>
              ) : local?.state === 'downloading' || local?.state === 'loading' ? (
                <div className="onb-progress">
                  <span>
                    {local.state === 'loading'
                      ? 'Preparando…'
                      : `Descargando… ${Math.round(local.progress * 100)}%`}
                  </span>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: `${local.progress * 100}%` }} />
                  </div>
                  <span className="muted small">
                    Puedes continuar; la descarga sigue en segundo plano.
                  </span>
                </div>
              ) : (
                <div className="onb-actions">
                  <button className="btn primary" onClick={() => void api.localModel.enable()}>
                    <Icon name="download" size={16} /> Descargar ahora
                  </button>
                  <button className="btn" onClick={() => go(step + 1)}>
                    Ahora no
                  </button>
                  {local?.state === 'error' && <div className="details-error">{local.error}</div>}
                </div>
              )}
              <p className="muted small">
                ¿Quieres más? La <b>IA avanzada</b> (nivel 3) detecta también estructuras como
                aldeas o templos. Es opcional y se configura en Ajustes.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="onb-tip">
              <h2>Consejo: activa el bioma en tu F3</h2>
              <p>
                Desde Minecraft 1.21.9, la pantalla F3 ya no muestra el bioma por defecto. Actívalo
                una vez y Craftshot lo leerá exacto en todas tus capturas:
              </p>
              <ol className="steps big">
                <li>
                  En el juego pulsa <span className="kbd">F3</span> +{' '}
                  <span className="kbd">F6</span>.
                </li>
                <li>
                  Busca la línea del <b>bioma</b> (Biome) y actívala.
                </li>
                <li>
                  Opcional: activa también la <b>entidad apuntada</b> para registrar el mob que
                  miras.
                </li>
              </ol>
              <p className="muted small">
                Y recuerda: haz las capturas (<span className="kbd">F2</span>) con el F3 abierto
                para guardar las coordenadas.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot onb-foot">
          <button className="btn ghost" onClick={() => finish()}>
            Saltar introducción
          </button>
          <div className="toolbar-spacer" />
          {step > 0 && (
            <button className="btn" onClick={() => go(step - 1)}>
              Atrás
            </button>
          )}
          {last ? (
            <>
              <button className="btn" onClick={() => finish(true)}>
                Ver ajustes
              </button>
              <button className="btn primary" onClick={() => finish()}>
                Empezar
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={() => go(step + 1)}>
              {step === FOLDER_STEP ? 'Usar esta carpeta' : 'Siguiente'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
