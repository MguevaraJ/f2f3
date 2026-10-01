import { dimensionName } from '@shared/catalog/biomes'
import {
  checkPortalPair,
  farmStatus,
  linkedPortal,
  otherPortalDimension,
  portalExit,
  type PortalDimension,
  type PortalRef
} from '@shared/planner'
import type { Vec3 } from '@shared/types'
import { Icon } from '../../components/icons'
import { copyText } from '../library/actions'
import { afkSpot, farmVerdict, type AfkState, type PortalEnd, type PortalState } from './planners'
import { tr } from '@shared/i18n'

export type KnownPortal = PortalRef & { dimension: PortalDimension; label: string }

const xyz = (p: Vec3): string => `${p.x} ${p.y} ${p.z}`

/** Three integer inputs for a block position. */
function CoordInputs({ value, onChange }: { value: Vec3; onChange: (v: Vec3) => void }) {
  const set = (k: keyof Vec3, raw: string): void => {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n)) onChange({ ...value, [k]: n })
  }
  return (
    <div className="coord-inputs">
      {(['x', 'y', 'z'] as const).map((k) => (
        <label key={k}>
          {k.toUpperCase()}
          <input
            className="input"
            type="number"
            value={value[k]}
            onChange={(e) => set(k, e.target.value)}
          />
        </label>
      ))}
    </div>
  )
}

function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="map-panel-head">
      <b>{title}</b>
      <button className="icon-btn" onClick={onClose} title={tr('Cerrar')}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

/** Sends the plan to the Companion mod, which draws it in the world. */
function InGame({ ready, onSend }: { ready: boolean; onSend: (show: boolean) => void }) {
  return (
    <div className="map-panel-result">
      <span>{tr('En el juego (mod F2+F3 Companion)')}</span>
      <div className="map-panel-actions">
        <button
          className="btn small"
          disabled={!ready}
          onClick={() => onSend(true)}
          title={tr('El mod lo dibuja en el mundo; J lo oculta o lo muestra')}
        >
          <Icon name="pin" size={14} /> {tr('Mostrar en el juego')}
        </button>
        <button className="btn small" onClick={() => onSend(false)}>
          {tr('Quitar')}
        </button>
      </div>
    </div>
  )
}

export function AfkPanel({
  state,
  onChange,
  simulationSource,
  onSend,
  onClose
}: {
  state: AfkState
  onChange: (s: AfkState) => void
  simulationSource: string
  onSend: (show: boolean) => void
  onClose: () => void
}) {
  const spot = afkSpot(state)
  const verdicts = spot
    ? state.farms.map((f) => farmVerdict(farmStatus(spot, f, state.simulation), state.kind))
    : []
  const working = verdicts.filter((v) => v.level !== 'bad').length
  return (
    <div className="map-panel">
      <PanelHead title={tr('Punto AFK')} onClose={onClose} />
      <p className="muted small">
        {tr(
          'Haz clic en las capturas de tus granjas (o en cualquier punto del mapa) para añadirlas.'
        )}
      </p>
      <div className="segmented">
        <button
          className={state.kind === 'mobs' ? 'on' : ''}
          onClick={() => onChange({ ...state, kind: 'mobs' })}
          title={tr('Los mobs aparecen entre 24 y 128 bloques del jugador')}
        >
          {tr('Granjas de mobs')}
        </button>
        <button
          className={state.kind === 'load' ? 'on' : ''}
          onClick={() => onChange({ ...state, kind: 'load' })}
          title={tr('Redstone, cultivos, aldeanos: solo necesitan sus chunks cargados')}
        >
          {tr('Solo carga')}
        </button>
      </div>
      <label className="map-panel-row">
        {tr('Distancia de simulación')}
        <input
          className="input"
          type="number"
          min={2}
          max={32}
          value={state.simulation}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10)
            if (n >= 2 && n <= 32) onChange({ ...state, simulation: n })
          }}
        />
      </label>
      <span className="muted small">{simulationSource}</span>

      {state.farms.length > 0 && (
        <ol className="farm-list">
          {state.farms.map((f, i) => (
            <li key={f.key} className={verdicts[i]?.level}>
              <div>
                <b>{f.label}</b>
                <span className="mono">
                  {f.x} {f.y ?? '?'} {f.z}
                </span>
                {verdicts[i] && <span className="small">{verdicts[i].text}</span>}
              </div>
              <button
                className="icon-btn"
                title={tr('Quitar')}
                onClick={() =>
                  onChange({ ...state, farms: state.farms.filter((x) => x.key !== f.key) })
                }
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {spot && (
        <div className="map-panel-result">
          <div className="map-panel-row">
            <span>
              {tr('Punto AFK')} {state.manual ? tr('(a mano)') : tr('(calculado)')}
              {state.farms.length > 0 && (
                <>
                  {' '}
                  · {working}/{state.farms.length} {tr('funcionan')}
                </>
              )}
            </span>
          </div>
          <CoordInputs
            value={spot}
            onChange={(v) => onChange({ ...state, manual: v, placing: false })}
          />
          <div className="map-panel-actions">
            <button
              className="btn small"
              onClick={() => void copyText(`/tp @s ${xyz(spot)}`, tr('Comando /tp'))}
            >
              <Icon name="copy" size={14} /> {tr('/tp')}
            </button>
            {state.manual && (
              <button
                className="btn small"
                onClick={() => onChange({ ...state, manual: null, placing: false })}
              >
                {tr('Calcular')}
              </button>
            )}
          </div>
        </div>
      )}
      <button
        className={`btn small ${state.placing ? 'primary' : ''}`}
        onClick={() => onChange({ ...state, placing: !state.placing })}
      >
        <Icon name="pin" size={14} />{' '}
        {state.placing ? tr('Haz clic en el mapa…') : tr('Colocar el punto AFK')}
      </button>
      <InGame ready={spot !== null} onSend={onSend} />
      <p className="muted small legend">
        <i className="sw sim" /> {tr('entidades (simulación)')} <i className="sw blk" />{' '}
        {tr('solo bloques')}
        {state.kind === 'mobs' && (
          <>
            {' '}
            <i className="sw near" /> 24 <i className="sw far" />{' '}
            {tr('128 bloques (corte a la altura del punto)')}
          </>
        )}
      </p>
    </div>
  )
}

function LinkLine({
  label,
  ok,
  landed,
  expected,
  newNear
}: {
  label: string
  ok: boolean
  landed: (PortalRef & { label?: string }) | null
  expected: string
  newNear: Vec3
}) {
  return (
    <li className={ok ? 'ok' : 'bad'}>
      <b>{label}</b>{' '}
      {ok
        ? tr('llega a {0}', expected)
        : landed
          ? tr(
              'va a otro portal más cercano ({0}, {1})',
              landed.label ?? landed.id,
              xyz(landed.pos)
            )
          : tr('no encuentra {0}: creará un portal nuevo cerca de {1}', expected, xyz(newNear))}
    </li>
  )
}

export function PortalPanel({
  state,
  onChange,
  known,
  onSend,
  onClose
}: {
  state: PortalState
  onChange: (s: PortalState) => void
  onSend: (show: boolean) => void
  /** Portals seen in screenshots, competing for the links. */
  known: KnownPortal[]
  onClose: () => void
}) {
  const bDim = otherPortalDimension(state.aDim)
  const exit = state.a && portalExit(state.a.pos, state.aDim)
  const pair = state.a && state.b && checkPortalPair(state.a, state.aDim, state.b, known)
  const landsOn =
    exit && !state.b
      ? linkedPortal(
          exit,
          known.filter((k) => k.dimension === bDim)
        )
      : null
  const setEnd = (which: 'a' | 'b', pos: Vec3): void => {
    const cur = state[which]
    const end: PortalEnd = { id: which.toUpperCase(), label: cur?.label ?? tr('A mano'), pos }
    onChange({ ...state, [which]: end, picking: null })
  }
  const pick = (which: 'a' | 'b'): void =>
    onChange({ ...state, picking: state.picking === which ? null : which })

  return (
    <div className="map-panel">
      <PanelHead title={tr('Enlace de portales')} onClose={onClose} />
      <div className="map-panel-row">
        <span>{tr('Portal A en')}</span>
        <div className="segmented">
          {(['minecraft:overworld', 'minecraft:the_nether'] as const).map((d) => (
            <button
              key={d}
              className={state.aDim === d ? 'on' : ''}
              onClick={() => onChange({ ...state, aDim: d, a: null, b: null, picking: 'a' })}
            >
              {dimensionName(d)}
            </button>
          ))}
        </div>
      </div>
      {state.a ? (
        <CoordInputs value={state.a.pos} onChange={(p) => setEnd('a', p)} />
      ) : (
        <button className="btn small" onClick={() => setEnd('a', { x: 0, y: 64, z: 0 })}>
          {tr('Escribir coordenadas')}
        </button>
      )}
      <button
        className={`btn small ${state.picking === 'a' ? 'primary' : ''}`}
        onClick={() => pick('a')}
      >
        <Icon name="pin" size={14} />{' '}
        {state.picking === 'a' ? tr('Haz clic en el mapa…') : tr('Elegir A en el mapa')}
      </button>

      {exit && (
        <div className="map-panel-result">
          <span>
            {tr('Destino ideal en el')} {dimensionName(bDim)}:{' '}
            <b className="mono">{xyz(exit.pos)}</b>
          </span>
          <span className="muted small">
            {tr('El juego busca un portal en un cuadrado de ±')}
            {exit.radius} {tr('bloques (')}
            {exit.radius * 2 + 1}×{exit.radius * 2 + 1}
            {tr(', toda la altura) y elige el más cercano.')}
          </span>
          {!state.b && (
            <span className="small">
              {landsOn
                ? tr(
                    'Ahora llegarías al portal de «{0}» ({1}).',
                    (landsOn as KnownPortal).label,
                    xyz(landsOn.pos)
                  )
                : tr('Ningún portal conocido ahí: se creará uno nuevo.')}
            </span>
          )}
          <div className="map-panel-actions">
            <button
              className="btn small"
              onClick={() => void copyText(xyz(exit.pos), tr('Coordenadas'))}
            >
              <Icon name="copy" size={14} /> {tr('Copiar')}
            </button>
            {!state.b && (
              <button className="btn small" onClick={() => setEnd('b', exit.pos)}>
                {tr('Usar como portal B')}
              </button>
            )}
          </div>
        </div>
      )}

      {state.a && (
        <>
          <div className="map-panel-row">
            <span>
              {tr('Portal B en el')} {dimensionName(bDim)}
            </span>
          </div>
          {state.b && <CoordInputs value={state.b.pos} onChange={(p) => setEnd('b', p)} />}
          <button
            className={`btn small ${state.picking === 'b' ? 'primary' : ''}`}
            onClick={() => pick('b')}
          >
            <Icon name="pin" size={14} />{' '}
            {state.picking === 'b' ? tr('Haz clic en el mapa…') : tr('Elegir B en el mapa')}
          </button>
        </>
      )}

      {pair && state.a && state.b && (
        <ul className="link-check">
          <LinkLine
            label={tr('A → B:')}
            ok={pair.forwardOk}
            landed={pair.forward}
            expected="B"
            newNear={portalExit(state.a.pos, state.aDim).pos}
          />
          <LinkLine
            label={tr('B → A:')}
            ok={pair.backOk}
            landed={pair.back}
            expected="A"
            newNear={portalExit(state.b.pos, bDim).pos}
          />
        </ul>
      )}
      <InGame ready={state.a !== null} onSend={onSend} />
      <p className="muted small">
        {known.length
          ? tr(
              '{0} portal{1} de capturas (apuntando al portal) compiten por el enlace.',
              known.length,
              known.length > 1 ? 'es' : ''
            )
          : tr('Las capturas apuntando a un portal se tienen en cuenta como portales existentes.')}
      </p>
    </div>
  )
}
