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
import { SaveModButton } from './SaveModButton'

const STEPS = ['Inicio', 'Tu Minecraft', 'Los datos', 'El mod', 'Avanzado'] as const
const FOLDER_STEP = 1

/** The technical side, one line each: enough to know it is there. */
const ADVANCED = [
  {
    icon: 'compass',
    title: 'Mapa',
    text: 'Tus capturas sobre un mapa por mundo y dimensión, con chunks de slime, Nether ⇄ Overworld y exportación de waypoints.'
  },
  {
    icon: 'grid',
    title: 'Planificadores',
    text: 'El mejor punto AFK para tus granjas y el enlace de portales, comprobado de ida y vuelta.'
  },
  {
    icon: 'gauge',
    title: 'Datos técnicos',
    text: 'TPS y MSPT, límites de mobs, señal de redstone, contenedores y los tratos de los aldeanos.'
  },
  {
    icon: 'layers',
    title: 'Builds',
    text: 'Lista de materiales de cada construcción guardada, exportación a .nbt y pegado en otro mundo.'
  }
] as const

/**
 * First-run introduction, from the basics to the technical side: what F2+F3 does, which
 * game folders it works with, where each piece of data comes from, the mod and the
 * advanced tools. Short on purpose. The game folder is the one thing that cannot be skipped;
 * users from before that step existed are asked just that, once.
 */
export function Onboarding() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const local = useLocalModel((s) => s.status)
  const setTab = useUi((s) => s.setTab)
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<string[] | null>(null)
  if (!settings || (settings.onboardingDone && settings.gameDirConfirmed)) return null

  const folders = picked ?? settings.screenshotsDirs
  const confirmFolder = (): Promise<void> =>
    update({ screenshotsDirs: folders, gameDirConfirmed: true })
  // New users start with where they played last and whatever already has screenshots;
  // the rest keep their folder (unless it is gone) and tick the ones they want to add.
  const preselect = (found: MinecraftSource[]): void => {
    if (picked || !found.length) return
    const known = settings.screenshotsDirs.filter((d) => found.some((s) => s.path === d))
    if (settings.onboardingDone && known.length) return
    setPicked(found.filter((s, i) => i === 0 || s.count > 0).map((s) => s.path))
  }
  const folderStep = (
    <div className="onb-folder">
      <h2>¿Dónde juegas?</h2>
      <p>
        F2+F3 trabaja con tus carpetas de juego: de ahí salen las capturas, los mundos y el sitio
        del mod. Encontré estas, la más reciente primero. Marca todas las que quieras ver.
      </p>
      <GameFolderPicker values={folders} onChange={setPicked} onLoaded={preselect} />
      <p className="muted small">Puedes añadir o quitar carpetas cuando quieras en Ajustes.</p>
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
              {folders.length > 1 ? 'Usar estas carpetas' : 'Usar esta carpeta'}
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
      <div className="modal onboarding" role="dialog" aria-modal aria-label="Introducción a F2+F3">
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
              <McText text="F2+F3" scale={4} />
              <p>
                Tus capturas de Minecraft, con todo lo que el juego sabía en ese momento: dónde
                estabas, qué bioma era, qué había alrededor.
              </p>
              <ul className="onb-list">
                <li>
                  <Icon name="pin" size={16} /> Coordenadas listas para copiar, con chunk, región y
                  /tp
                </li>
                <li>
                  <Icon name="eye" size={16} /> Galería con visor, búsqueda, filtros, notas y
                  carpetas
                </li>
                <li>
                  <Icon name="cloud" size={16} /> Aviso al hacer una captura y respaldo en Google
                  Drive
                </li>
              </ul>
              <p className="muted small">
                Con eso basta para empezar. Lo avanzado está ahí cuando lo necesites.
              </p>
            </div>
          )}

          {step === FOLDER_STEP && folderStep}

          {step === 2 && (
            <div className="onb-levels">
              <h2>De dónde sale cada dato</h2>
              <p className="muted">
                Cada dato lleva una etiqueta con su origen, del más fiable al más aproximado:
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
                      {l.id === 'local' && (
                        <div className="onb-inline">
                          {local?.state === 'ready' ? (
                            <span className="state-pill on">
                              <Icon name="check" size={14} /> Modelo listo
                            </span>
                          ) : local?.state === 'downloading' || local?.state === 'loading' ? (
                            <span className="muted small">
                              {local.state === 'loading'
                                ? 'Preparando…'
                                : `Descargando… ${Math.round(local.progress * 100)}% (sigue en segundo plano)`}
                            </span>
                          ) : (
                            <>
                              <button
                                className="btn small"
                                onClick={() => void api.localModel.enable()}
                              >
                                <Icon name="download" size={14} /> Descargar (~
                                {local?.sizeMB ?? 170} MB)
                              </button>
                              <span className="muted small">Opcional. Nada sale de tu equipo.</span>
                            </>
                          )}
                          {local?.state === 'error' && (
                            <span className="details-error">{local.error}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <p className="muted small">
                Haz las capturas (<span className="kbd">F2</span>) con el{' '}
                <span className="kbd">F3</span> abierto. Desde Minecraft 1.21.9 el F3 oculta el
                bioma: pulsa <span className="kbd">F3</span> + <span className="kbd">F6</span> y
                activa la línea <b>Biome</b> una vez.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="onb-mod">
              <h2>
                {MOD_LEVEL.title} <span className="source-tag mod">{SOURCE_INFO.mod.tag}</span>
              </h2>
              <p>
                Opcional, para <b>Fabric 26.3, 1.21.1 o 1.20.1</b>. Con él, cada captura guarda los
                datos reales del juego sin abrir el F3, y F2+F3 entra en la partida:
              </p>
              <ul className="onb-list">
                <li>
                  <Icon name="check" size={16} />
                  <span>
                    <b>Datos exactos</b> en cada <span className="kbd">F2</span>: posición, bioma,
                    mobs a la vista y estructuras.
                  </span>
                </li>
                <li>
                  <Icon name="image" size={16} />
                  <span>
                    <b>Tus capturas dentro del juego</b> con <span className="kbd">F6</span>, con
                    sus notas y datos.
                  </span>
                </li>
                <li>
                  <Icon name="compass" size={16} />
                  <span>
                    <b>Guía</b>: una flecha te lleva al lugar de cualquier captura.
                  </span>
                </li>
                <li>
                  <Icon name="layers" size={16} />
                  <span>
                    <b>Builds</b>: <span className="kbd">Mayús+F2</span> guarda una construcción y
                    luego la colocas donde quieras.
                  </span>
                </li>
              </ul>
              <div className="onb-actions">
                <SaveModButton />
                <button className="btn" onClick={() => go(step + 1)}>
                  Ahora no
                </button>
              </div>
              <p className="muted small">
                Se guarda en la carpeta <code>mods</code> de tu juego. Lo tienes también en Ajustes
                › Análisis.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="onb-advanced">
              <h2>Para cuando quieras ir más lejos</h2>
              <p className="muted">
                No hay nada que configurar: estas herramientas aparecen solas cuando tus capturas
                traen los datos.
              </p>
              <div className="onb-grid">
                {ADVANCED.map((a) => (
                  <div key={a.title} className="onb-card">
                    <Icon name={a.icon} size={18} />
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted small">Puedes volver a ver esta introducción desde Ajustes.</p>
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
              {step !== FOLDER_STEP
                ? 'Siguiente'
                : folders.length > 1
                  ? 'Usar estas carpetas'
                  : 'Usar esta carpeta'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
