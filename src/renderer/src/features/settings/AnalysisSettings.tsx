import { useState, type ReactNode } from 'react'
import type { VisionProviderId } from '@shared/types'
import { Icon } from '../../components/icons'
import { SaveModButton } from '../../components/SaveModButton'
import { Toggle } from '../../components/Toggle'
import { api } from '../../lib/api'
import { LEVELS, MOD_LEVEL, PROVIDER_LABEL } from '../../lib/sources'
import { useLocalModel } from '../../store/localModel'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toasts'

interface ProviderMeta {
  id: VisionProviderId
  tagline: string
  keyUrl?: string
  keyHint?: string
  placeholder?: string
  defaultModels?: string[]
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'ollama',
    tagline: 'Gratis · en tu equipo · sin cuenta',
    defaultModels: []
  },
  {
    id: 'gemini',
    tagline: 'Cuenta de Google · suele tener uso gratuito',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'Crea una clave gratis en Google AI Studio.',
    placeholder: 'AIza…'
  },
  {
    id: 'anthropic',
    tagline: 'Muy preciso · pago por uso',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'Crea una clave en la consola de Anthropic.',
    placeholder: 'sk-ant-…',
    defaultModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5']
  },
  {
    id: 'openai',
    tagline: 'OpenAI u otro servicio compatible · pago por uso',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'Crea una clave en OpenAI (o usa la de OpenRouter, LM Studio…).',
    placeholder: 'sk-…'
  }
]

const open = (url: string): void => void window.open(url)

/** The three analysis levels, each in its own card. */
export function AnalysisSettings({
  fontSource,
  onChooseFont
}: {
  fontSource: string | null
  onChooseFont(): void
}) {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  if (!settings) return null
  return (
    <div className="levels">
      <LevelCard level={0} active>
        <Toggle
          label="Leer el F3 automáticamente"
          hint="Cada captura nueva se analiza al instante, sin internet."
          checked={settings.autoAnalyze}
          onChange={(v) => void update({ autoAnalyze: v })}
        />
        <div className="path-row">
          <code className="path" title="Fuente de Minecraft usada para leer el texto del F3">
            {fontSource ?? 'No se encontró ningún .jar de Minecraft'}
          </code>
          <button className="btn small" onClick={onChooseFont}>
            Elegir .jar
          </button>
          {settings.fontSource && (
            <button className="btn small ghost" onClick={() => void update({ fontSource: '' })}>
              Automático
            </button>
          )}
        </div>
        <p className="muted small tip-line">
          <span className="f3-badge">F3</span> En Minecraft 1.21.9 y posteriores el bioma viene
          oculto en el F3: actívalo con <span className="kbd">F3</span> +{' '}
          <span className="kbd">F6</span> para obtenerlo exacto.
        </p>
      </LevelCard>

      <ModCard />

      <LevelCard level={1} active={settings.localModelEnabled}>
        <LocalModelPanel />
      </LevelCard>

      <LevelCard level={2} active={settings.visionEnabled}>
        <Toggle
          label="Usar IA avanzada"
          hint="Opcional. Las capturas se envían al servicio que elijas solo cuando lo pides."
          checked={settings.visionEnabled}
          onChange={(v) => void update({ visionEnabled: v })}
        />
        {settings.visionEnabled && <ProviderPanel />}
      </LevelCard>
    </div>
  )
}

function LevelCard({
  level,
  active,
  children
}: {
  level: number
  active: boolean
  children: ReactNode
}) {
  const l = LEVELS[level]
  return (
    <section className={`level-card level-${l.id} ${active ? 'active' : ''}`}>
      <header className="level-head">
        <span className="level-number">{l.number}</span>
        <div className="level-title">
          <strong>{l.title}</strong>
          <span className="level-badge">{l.badge}</span>
        </div>
      </header>
      <p className="level-gives">
        <b>Qué obtienes:</b> {l.gives}
        <br />
        <b>Qué necesita:</b> {l.needs}
      </p>
      <div className="level-body">{children}</div>
    </section>
  )
}

/** The optional Fabric mod: exact data without the F3. Never installed automatically. */
function ModCard() {
  return (
    <section className="level-card level-mod active">
      <header className="level-head">
        <span className="level-number">+</span>
        <div className="level-title">
          <strong>{MOD_LEVEL.title}</strong>
          <span className="level-badge">{MOD_LEVEL.badge}</span>
        </div>
      </header>
      <p className="level-gives">
        <b>Qué obtienes:</b> {MOD_LEVEL.gives}
        <br />
        <b>Qué necesita:</b> {MOD_LEVEL.needs}
      </p>
      <div className="level-body">
        <div className="path-row">
          <SaveModButton small />
        </div>
        <p className="muted small tip-line">
          Hay un .jar para cada versión (Fabric 26.3, 1.21.1 y 1.20.1): elige la de tu perfil. Si
          tus perfiles del launcher comparten la carpeta <code>.minecraft/mods</code>, crea un
          perfil de Fabric con su propia carpeta de juego para que no falle en otras versiones.
        </p>
        <p className="muted small tip-line">
          <b>Guardar un build</b> (un jugador): desde fuera, apunta a la esquina inferior de la
          construcción más cercana a ti, a tu derecha, y pulsa <span className="kbd">Mayús+F2</span>
          . Son tres pasos, cada uno con la rueda del ratón estando agachado y{' '}
          <span className="kbd">F2</span> para pasar al siguiente: <b>1)</b> cuánto llega hacia el
          fondo, <b>2)</b> cuánto hacia tu izquierda y <b>3)</b> la altura. Otro{' '}
          <span className="kbd">F2</span> te pide un nombre (p. ej. «Casa del Lago»), hace la
          captura y guarda el build en el mundo como <code>f2f3:casa_del_lago</code> (vacío:{' '}
          <code>build_1</code>, <code>build_2</code>…); el chat te da el comando para pegarlo.{' '}
          <span className="kbd">Enter</span> fija la zona para que puedas moverte y revisarla, y{' '}
          <span className="kbd">Esc</span> vuelve un paso o cancela.
        </p>
        <p className="muted small tip-line">
          <b>F2+F3 dentro del juego:</b> <span className="kbd">F6</span> abre tus capturas con los
          mismos datos que ves aquí (notas, etiquetas y favoritas incluidas). Desde ahí, «Guiarme
          hasta aquí» muestra una flecha y la distancia hasta el lugar de la captura, y se quita
          sola al llegar (<span className="kbd">H</span> la oculta o la muestra); «Copiar
          coordenadas» las deja en el portapapeles; «Colocar el build» te deja ponerlo apuntando a
          un bloque (<span className="kbd">Enter</span> lo coloca, gírate para rotarlo y se puede
          deshacer desde la misma pantalla).
        </p>
      </div>
    </section>
  )
}

function LocalModelPanel() {
  const status = useLocalModel((s) => s.status)
  if (!status) return null
  switch (status.state) {
    case 'absent':
      return (
        <div className="local-model">
          <button className="btn primary" onClick={() => void api.localModel.enable()}>
            <Icon name="download" size={16} /> Descargar modelo local (~{status.sizeMB} MB)
          </button>
          <span className="muted small">
            Se descarga una sola vez. Tus capturas nunca salen de tu equipo.
          </span>
        </div>
      )
    case 'downloading':
      return (
        <div className="local-model column">
          <div className="row-between">
            <span>Descargando modelo…</span>
            <span className="muted">{Math.round(status.progress * 100)}%</span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${status.progress * 100}%` }} />
          </div>
        </div>
      )
    case 'loading':
      return (
        <div className="local-model">
          <span className="spinner" /> Cargando modelo…
        </div>
      )
    case 'error':
      return (
        <div className="local-model column">
          <div className="details-error">{status.error}</div>
          <button className="btn" onClick={() => void api.localModel.enable()}>
            <Icon name="refresh" size={15} /> Reintentar
          </button>
        </div>
      )
    case 'ready':
      return (
        <div className="local-model">
          <span className="state-pill on">
            <Icon name="check" size={14} /> Activo
          </span>
          <span className="muted small">
            {status.pending > 0
              ? `Estimando ${status.pending} capturas…`
              : 'Todas las capturas están estimadas.'}
          </span>
          <div className="toolbar-spacer" />
          <button
            className="btn small ghost"
            onClick={() =>
              void api.localModel
                .remove()
                .then(() =>
                  toast.info('Modelo local eliminado. Puedes volver a descargarlo cuando quieras.')
                )
            }
          >
            <Icon name="trash" size={14} /> Eliminar modelo
          </button>
        </div>
      )
  }
}

function ProviderPanel() {
  const settings = useSettings((s) => s.settings)!
  const update = useSettings((s) => s.update)
  const setApiKey = useSettings((s) => s.setApiKey)
  const provider = settings.visionProvider
  const meta = PROVIDERS.find((p) => p.id === provider)!
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [models, setModels] = useState<Record<string, string[]>>({})
  const available = models[provider] ?? meta.defaultModels ?? []
  const model = settings.visionModels[provider] ?? ''

  const setModel = (m: string): void =>
    void update({ visionModels: { ...settings.visionModels, [provider]: m } })

  const connect = async (): Promise<void> => {
    setTesting(true)
    const res = await api.settings.testVision(provider)
    setTesting(false)
    if (!res.ok) {
      toast.error(res.message)
      return
    }
    setModels((m) => ({ ...m, [provider]: res.models }))
    if (!model && res.models.length) setModel(pickDefault(provider, res.models))
    toast.success(res.message)
  }

  return (
    <div className="provider-panel">
      <div className="provider-grid" role="radiogroup" aria-label="Servicio de IA">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={provider === p.id}
            className={`provider-tile ${provider === p.id ? 'on' : ''}`}
            onClick={() => void update({ visionProvider: p.id })}
          >
            <strong>{PROVIDER_LABEL[p.id]}</strong>
            <span>{p.tagline}</span>
            {(p.id === 'ollama' || settings.apiKeys[p.id]) && settings.visionModels[p.id] && (
              <Icon name="check" size={14} className="provider-ready" />
            )}
          </button>
        ))}
      </div>

      {provider === 'ollama' ? (
        <div className="provider-help">
          <p className="muted small">
            <b>Ollama</b> ejecuta modelos de IA en tu propio equipo: gratis y privado, pero necesita
            una computadora con bastante memoria (idealmente una tarjeta gráfica).{' '}
            <button className="link-btn inline" onClick={() => open('https://ollama.com/download')}>
              Descargar Ollama
            </button>{' '}
            y luego instala un modelo con visión, por ejemplo: <code>ollama pull qwen2.5vl</code>
          </p>
          <label className="field">
            <span>Dirección de Ollama</span>
            <input
              className="input"
              placeholder="http://localhost:11434"
              defaultValue={settings.ollamaUrl}
              onBlur={(e) => void update({ ollamaUrl: e.target.value.trim() })}
            />
          </label>
        </div>
      ) : (
        <div className="provider-help">
          <label className="field">
            <span>
              Clave de {PROVIDER_LABEL[provider]}{' '}
              {meta.keyUrl && (
                <button className="link-btn inline" onClick={() => open(meta.keyUrl!)}>
                  ¿Cómo la consigo?
                </button>
              )}
            </span>
            <div className="path-row">
              <input
                className="input"
                type="password"
                placeholder={
                  settings.apiKeys[provider] ? '•••••••••••• (guardada)' : meta.placeholder
                }
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
              />
              <button
                className="btn primary"
                disabled={!key.trim()}
                onClick={() =>
                  void setApiKey(provider, key).then(() => {
                    setKey('')
                    toast.success('Clave guardada de forma cifrada en este equipo')
                  })
                }
              >
                Guardar
              </button>
              {settings.apiKeys[provider] && (
                <button className="btn ghost" onClick={() => void setApiKey(provider, null)}>
                  Borrar
                </button>
              )}
            </div>
            <small className="muted">
              {meta.keyHint} La clave se guarda cifrada y nunca se comparte.
            </small>
          </label>
          {provider === 'openai' && (
            <label className="field">
              <span>Dirección del servicio (opcional, para servicios compatibles)</span>
              <input
                className="input"
                placeholder="https://api.openai.com/v1"
                defaultValue={settings.openaiBaseUrl}
                onBlur={(e) => void update({ openaiBaseUrl: e.target.value.trim() })}
              />
            </label>
          )}
        </div>
      )}

      <div className="field">
        <span>Modelo</span>
        <div className="path-row">
          {available.length ? (
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              {!model && <option value="">Elige un modelo…</option>}
              {!available.includes(model) && model && <option value={model}>{model}</option>}
              {available.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              placeholder="Conecta para ver los modelos disponibles"
              defaultValue={model}
              onBlur={(e) => setModel(e.target.value.trim())}
            />
          )}
          <button className="btn" disabled={testing} onClick={() => void connect()}>
            <Icon name="refresh" size={15} /> {testing ? 'Conectando…' : 'Probar y cargar modelos'}
          </button>
        </div>
        <small className="muted">Elige un modelo que acepte imágenes (visión).</small>
      </div>

      <Toggle
        label="Analizar con IA cada captura nueva"
        hint={
          provider === 'ollama'
            ? 'Gratis, pero usa la potencia de tu equipo mientras juegas.'
            : 'Cada captura es una petición que puede tener coste en tu cuenta.'
        }
        checked={settings.visionAuto}
        onChange={(v) => void update({ visionAuto: v })}
      />
    </div>
  )
}

/** A sensible first choice among the listed models (vision-capable when recognisable). */
function pickDefault(provider: VisionProviderId, models: string[]): string {
  const prefer: Record<VisionProviderId, RegExp[]> = {
    anthropic: [/opus-5-5/, /sonnet-5-5/],
    gemini: [/flash(?!.*(lite|tts|image|embedding))/, /pro/],
    openai: [/^gpt-.*mini/, /^gpt-/],
    ollama: [/vl|vision|llava|gemma3|minicpm/]
  }
  for (const re of prefer[provider]) {
    const hit = models.find((m) => re.test(m))
    if (hit) return hit
  }
  return models[0]
}
