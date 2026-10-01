import { useEffect, useMemo, useRef, useState } from 'react'
import { dimensionName } from '@shared/catalog/biomes'
import { thumbUrl } from '@shared/ipc'
import { DEFAULT_SIMULATION, isPortalDimension, otherPortalDimension } from '@shared/planner'
import { parseSeed, slimeChecker } from '@shared/slime'
import type { ScreenshotEntry, Vec3 } from '@shared/types'
import { listWorlds, mapPoint, NO_WORLD, worldOf } from '@shared/worlds'
import { Icon } from '../../components/icons'
import { api } from '../../lib/api'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toasts'
import { useUi } from '../../store/ui'
import { drawMap, hitTest, type DrawPoint } from './drawMap'
import { AfkPanel, PortalPanel, type KnownPortal } from './PlannerPanels'
import {
  afkShapes,
  afkSpot,
  gameAfkPlan,
  gamePortalPlan,
  portalShapes,
  type AfkState,
  type PortalState
} from './planners'
import { convertXZ, fitView, scaleBar, toWorld, zoomAt, type View } from './view'
import { getLang, tr } from '@shared/i18n'

const DIMENSIONS = ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'] as const

const fmt = (n: number): string => Math.round(n).toLocaleString(getLang())

/**
 * Top-down map of the screenshots of one world and dimension: slime chunks,
 * chunk/region grid, Nether ⇄ Overworld overlay, measuring and waypoint export.
 */
export function MapView({ shots }: { shots: ScreenshotEntry[] }) {
  const settings = useSettings((s) => s.settings)
  const updateSettings = useSettings((s) => s.update)
  const openViewer = useUi((s) => s.openViewer)
  const seeds = settings?.worldSeeds

  const worlds = useMemo(
    () => listWorlds(shots, seeds).filter((w) => w.located > 0),
    [shots, seeds]
  )
  const [world, setWorld] = useState<string | null>(null)
  const current = worlds.find((w) => w.name === world) ?? worlds[0]
  const [dimension, setDimension] = useState<string>('minecraft:overworld')
  const [overlay, setOverlay] = useState(true)
  const [grid, setGrid] = useState(true)
  const [slimeOn, setSlimeOn] = useState(true)
  const [tool, setTool] = useState<'none' | 'measure' | 'afk' | 'portal'>('none')
  const measuring = tool === 'measure'
  const [measure, setMeasure] = useState<[number, number][]>([])
  const [editingSeed, setEditingSeed] = useState(false)

  // Screenshots of this world with coordinates.
  const located = useMemo(
    () =>
      current
        ? shots.flatMap((s) => {
            const p = worldOf(s).name === current.name ? mapPoint(s) : null
            return p ? [{ shot: s, p }] : []
          })
        : [],
    [shots, current]
  )
  const dimsWithShots = useMemo(() => new Set(located.map((l) => l.p.dimension)), [located])

  const points: DrawPoint[] = useMemo(
    () =>
      located.flatMap(({ shot, p }) => {
        const own = p.dimension === dimension
        const xz = own ? [p.x, p.z] : overlay ? convertXZ(p.x, p.z, p.dimension, dimension) : null
        return xz
          ? [{ id: shot.id, x: xz[0], z: xz[1], overlay: !own, favorite: !!shot.meta.favorite }]
          : []
      }),
    [located, dimension, overlay]
  )
  const byId = useMemo(() => new Map(located.map((l) => [l.shot.id, l])), [located])

  // ── planners ──
  // Simulation distance of the newest capture that knows it (mod).
  const simulation = useMemo(() => {
    const withGame = located
      .filter((l) => l.shot.analysis?.mod?.game)
      .sort((a, b) => b.shot.capturedAt - a.shot.capturedAt)[0]
    return withGame
      ? {
          value: withGame.shot.analysis!.mod!.game!.simulationDistance,
          source: tr('De la captura {0} (mod).', withGame.shot.name)
        }
      : {
          value: DEFAULT_SIMULATION,
          source: tr('Valor por defecto en un jugador; cámbialo si usas otro.')
        }
  }, [located])
  const [afk, setAfk] = useState<AfkState>({
    farms: [],
    kind: 'mobs',
    simulation: simulation.value,
    manual: null,
    placing: false
  })
  const [portal, setPortal] = useState<PortalState>({
    aDim: 'minecraft:overworld',
    a: null,
    b: null,
    picking: 'a'
  })
  // Screenshots aimed at a portal block count as existing portals.
  const knownPortals: KnownPortal[] = useMemo(
    () =>
      located.flatMap(({ shot, p }) => {
        const t = shot.analysis?.location?.targetedBlock
        return t?.id === 'minecraft:nether_portal' && isPortalDimension(p.dimension)
          ? [{ id: shot.id, label: shot.name, dimension: p.dimension, pos: t.pos }]
          : []
      }),
    [located]
  )
  // Plans belong to one world (and the AFK spot to one dimension): reset when they change.
  const planKey = `${current?.name}|${simulation.value}`
  const afkKey = `${planKey}|${dimension}`
  const [planned, setPlanned] = useState({ planKey, afkKey })
  if (planned.planKey !== planKey || planned.afkKey !== afkKey) {
    setPlanned({ planKey, afkKey })
    setAfk((s) => ({ ...s, farms: [], manual: null, placing: false, simulation: simulation.value }))
    if (planned.planKey !== planKey) setPortal((s) => ({ ...s, a: null, b: null, picking: 'a' }))
  }
  const shapes = useMemo(
    () =>
      tool === 'afk'
        ? afkShapes(afk, afkSpot(afk))
        : tool === 'portal'
          ? portalShapes(portal, dimension)
          : [],
    [tool, afk, portal, dimension]
  )

  const seed = current?.seed ? parseSeed(current.seed) : null
  const slime = useMemo(() => (seed !== null ? slimeChecker(seed) : null), [seed])

  // ── canvas ──
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ cx: 0, cz: 0, scale: 1 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [cursor, setCursor] = useState<{ sx: number; sy: number } | null>(null)
  const [slimeHidden, setSlimeHidden] = useState(false)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Frame the dimension's screenshots when the world or dimension changes, and keep
  // framing while analyses arrive — until the user pans or zooms.
  const frameKey = `${current?.name}|${dimension}`
  const framed = useRef({ key: '', count: -1, touched: false })
  useEffect(() => {
    const f = framed.current
    const own = points.filter((p) => !p.overlay)
    if (size.w < 50) return
    if (f.key !== frameKey) Object.assign(f, { key: frameKey, count: -1, touched: false })
    else if (f.touched || f.count === points.length) return
    f.count = points.length
    setView(fitView(own.length ? own : points, size.w, size.h))
    setMeasure([])
  }, [frameKey, points, size])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const r = drawMap(ctx, {
      view,
      width: size.w,
      height: size.h,
      dimension,
      points,
      hovered,
      grid,
      slime: slimeOn && dimension === 'minecraft:overworld' ? slime : null,
      measure,
      shapes
    })
    setSlimeHidden(r.slimeHidden)
  }, [view, size, dimension, points, hovered, grid, slime, slimeOn, measure, shapes])

  const local = (e: React.MouseEvent | React.WheelEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  const onWheel = (e: React.WheelEvent): void => {
    const [sx, sy] = local(e)
    framed.current.touched = true
    setView((v) => zoomAt(v, size.w, size.h, sx, sy, e.deltaY < 0 ? 1.25 : 0.8))
  }
  const onDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false }
  }
  const onMove = (e: React.MouseEvent): void => {
    const [sx, sy] = local(e)
    setCursor({ sx, sy })
    const d = drag.current
    if (d) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (d.moved) {
        framed.current.touched = true
        setView({ ...d.view, cx: d.view.cx - dx / d.view.scale, cz: d.view.cz - dy / d.view.scale })
        return
      }
    }
    setHovered(hitTest(points, view, size.w, size.h, sx, sy)?.id ?? null)
  }
  const onUp = (e: React.MouseEvent): void => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    const [sx, sy] = local(e)
    const hit = hitTest(points, view, size.w, size.h, sx, sy)
    const at: [number, number] = hit ? [hit.x, hit.z] : toWorld(view, size.w, size.h, sx, sy)
    if (measuring) {
      // Snap to a screenshot when clicking on one.
      setMeasure((m) => (m.length >= 2 ? [at] : [...m, at]))
    } else if (tool === 'afk') clickAfk(hit && !hit.overlay ? hit.id : null, at)
    else if (tool === 'portal' && portal.picking) clickPortal(hit?.id ?? null, at)
    else if (hit) openViewer(hit.id)
  }

  const block = ([x, z]: [number, number]): { x: number; z: number } => ({
    x: Math.floor(x),
    z: Math.floor(z)
  })

  const clickAfk = (shotId: string | null, at: [number, number]): void => {
    const real = shotId ? byId.get(shotId) : undefined
    if (afk.placing) {
      const y = real?.p.y ?? afkSpot(afk)?.y ?? 64
      setAfk({ ...afk, manual: { ...block(at), y: Math.floor(y) }, placing: false })
      return
    }
    if (real && afk.farms.some((f) => f.shotId === real.shot.id)) {
      setAfk({ ...afk, farms: afk.farms.filter((f) => f.shotId !== real.shot.id) })
      return
    }
    const farm = real
      ? {
          key: real.shot.id,
          shotId: real.shot.id,
          label: real.shot.meta.note?.split('\n')[0] || real.shot.name,
          x: Math.floor(real.p.x),
          y: Math.floor(real.p.y),
          z: Math.floor(real.p.z)
        }
      : { key: `p${Date.now()}`, label: tr('Punto del mapa'), ...block(at), y: null }
    setAfk({ ...afk, farms: [...afk.farms, farm] })
  }

  const clickPortal = (shotId: string | null, at: [number, number]): void => {
    const which = portal.picking
    if (!which) return
    const want = which === 'a' ? null : otherPortalDimension(portal.aDim)
    const real = shotId ? byId.get(shotId) : undefined
    const aim = real && knownPortals.find((k) => k.id === real.shot.id)
    let dim = real && isPortalDimension(real.p.dimension) ? real.p.dimension : null
    let pos: Vec3 | null =
      real && dim ? (aim?.pos ?? { x: real.p.x, y: real.p.y, z: real.p.z }) : null
    // A click on empty map (or a screenshot of the wrong dimension) uses the map's coordinates.
    if (!pos || !dim || (want && dim !== want)) {
      if (!isPortalDimension(dimension)) return
      const target = want ?? dimension
      const xz = convertXZ(at[0], at[1], dimension, target)
      if (!xz) return
      const y = which === 'b' ? (portal.a?.pos.y ?? 64) : 64
      dim = target
      pos = { ...block(xz), y }
    }
    const end = {
      id: which.toUpperCase(),
      label: real ? real.shot.name : tr('Punto del mapa'),
      pos: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
    }
    if (which === 'a') setPortal({ aDim: dim, a: end, b: null, picking: 'b' })
    else setPortal({ ...portal, b: end, picking: null })
  }

  // The plan goes to the mod, with the seed for slime chunks where it cannot read it.
  const sendPlan = async (which: 'afk' | 'portals', show: boolean): Promise<void> => {
    if (!current) return
    const plan = !show
      ? null
      : which === 'afk'
        ? gameAfkPlan(afk, dimension)
        : gamePortalPlan(portal)
    try {
      const n = await api.companion.sendPlan(current.name, {
        [which]: plan,
        seed: current.seed ?? null
      })
      if (!n) toast.error(tr('Ninguna de tus carpetas de juego está lista para recibir planes.'))
      else if (show)
        toast.success(
          tr('Enviado al juego: pulsa J en «{0}» para verlo', current.name || tr('el mundo'))
        )
      else toast.success(tr('Quitado del juego'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr('No se pudo enviar al juego'))
    }
  }

  const saveSeed = (value: string): void => {
    if (!current) return
    const v = value.trim()
    if (v && parseSeed(v) === null) {
      toast.error(tr('Semilla no válida: debe ser un número entero de hasta 64 bits.'))
      return
    }
    const next = { ...(seeds ?? {}) }
    if (v) next[current.name] = v
    else delete next[current.name]
    void updateSettings({ worldSeeds: next })
    setEditingSeed(false)
  }

  const exportWaypoints = async (): Promise<void> => {
    if (!current) return
    try {
      const res = await api.library.exportWaypoints(
        located.map((l) => l.shot.id),
        current.name || tr('Sin mundo')
      )
      if (res) toast.success(tr('{0} waypoints guardados en {1}', res.count, res.path))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (!current)
    return (
      <div className="map-view">
        <div className="empty-state">
          <Icon name="compass" size={48} />
          <h3>{tr('El mapa está vacío')}</h3>
          <p>
            {tr(
              'Las capturas con coordenadas (con el F3 abierto o con el mod F2+F3 Companion) aparecerán aquí como puntos sobre el mundo.'
            )}
          </p>
        </div>
      </div>
    )

  const hot = hovered ? byId.get(hovered) : undefined
  const cursorWorld = cursor ? toWorld(view, size.w, size.h, cursor.sx, cursor.sy) : null
  const bar = scaleBar(view.scale)
  const dist =
    measure.length === 2
      ? Math.hypot(measure[1][0] - measure[0][0], measure[1][1] - measure[0][1])
      : null
  const otherName = dimension === 'minecraft:the_nether' ? tr('Overworld') : tr('Nether')

  return (
    <div className="map-view">
      <div className="coords-toolbar map-toolbar">
        <select
          className="input small-select"
          value={current.name}
          onChange={(e) => {
            setWorld(e.target.value)
            setEditingSeed(false)
          }}
          aria-label={tr('Mundo')}
        >
          {worlds.map((w) => (
            <option key={w.name} value={w.name}>
              {w.name === NO_WORLD ? tr('Sin mundo asignado') : w.name} ({w.located})
            </option>
          ))}
        </select>
        <div className="segmented">
          {DIMENSIONS.map((d) => (
            <button
              key={d}
              className={d === dimension ? 'on' : ''}
              onClick={() => setDimension(d)}
              title={dimsWithShots.has(d) ? undefined : tr('Sin capturas en esta dimensión')}
            >
              {dimensionName(d)}
            </button>
          ))}
        </div>
        {dimension !== 'minecraft:the_end' && (
          <label
            className="checkbox"
            title={tr('Muestra las capturas de la otra dimensión convertidas (×8 / ÷8)')}
          >
            <input
              type="checkbox"
              checked={overlay}
              onChange={(e) => setOverlay(e.target.checked)}
            />
            {otherName} {tr('superpuesto')}
          </label>
        )}
        <label className="checkbox" title={tr('Chunks (16 bloques) y regiones (512 bloques)')}>
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
          {tr('Cuadrícula')}
        </label>
        {dimension === 'minecraft:overworld' && (
          <label
            className="checkbox"
            title={seed === null ? tr('Necesita la semilla del mundo') : undefined}
          >
            <input
              type="checkbox"
              checked={slimeOn && seed !== null}
              disabled={seed === null}
              onChange={(e) => setSlimeOn(e.target.checked)}
            />
            {tr('Chunks slime')}
          </label>
        )}
        <div className="toolbar-spacer" />
        <button
          className={`btn small ${measuring ? 'primary' : ''}`}
          onClick={() => {
            setTool(measuring ? 'none' : 'measure')
            setMeasure([])
          }}
          title={tr('Haz clic en dos puntos del mapa para medir la distancia')}
        >
          <Icon name="pin" size={15} /> {tr('Medir')}
        </button>
        <button
          className={`btn small ${tool === 'afk' ? 'primary' : ''}`}
          onClick={() => {
            setTool(tool === 'afk' ? 'none' : 'afk')
            setMeasure([])
          }}
          title={tr('Dónde quedarse AFK para que tus granjas funcionen a la vez')}
        >
          <Icon name="gauge" size={15} /> {tr('AFK')}
        </button>
        <button
          className={`btn small ${tool === 'portal' ? 'primary' : ''}`}
          onClick={() => {
            setTool(tool === 'portal' ? 'none' : 'portal')
            setMeasure([])
          }}
          title={tr('Planifica un portal del Nether y comprueba que enlaza en ambos sentidos')}
        >
          <Icon name="layers" size={15} /> {tr('Portales')}
        </button>
        <button
          className="btn small"
          onClick={() => {
            const own = points.filter((p) => !p.overlay)
            setView(fitView(own.length ? own : points, size.w, size.h))
          }}
          title={tr('Encuadrar todas las capturas')}
        >
          <Icon name="fit" size={15} />
        </button>
        <button
          className="btn small"
          onClick={() => void exportWaypoints()}
          title={tr("Waypoints para Xaero's Minimap (JourneyMap 6 también los importa)")}
        >
          <Icon name="download" size={15} /> {tr('Waypoints')}
        </button>
      </div>

      <div className="map-seed muted small">
        {editingSeed ? (
          <form
            className="seed-form"
            onSubmit={(e) => {
              e.preventDefault()
              saveSeed(new FormData(e.currentTarget).get('seed') as string)
            }}
          >
            <input
              name="seed"
              className="search-input"
              autoFocus
              defaultValue={seeds?.[current.name] ?? ''}
              placeholder={tr('Semilla del mundo (/seed en el juego)')}
            />
            <button className="btn small primary" type="submit">
              {tr('Guardar')}
            </button>
            <button className="btn small ghost" type="button" onClick={() => setEditingSeed(false)}>
              {tr('Cancelar')}
            </button>
          </form>
        ) : current.seed ? (
          <>
            {tr('Semilla')} <code>{current.seed}</code>{' '}
            {current.seedSource === 'mod' ? tr('(del mod)') : tr('(escrita por ti)')} ·{' '}
            <button className="link" onClick={() => setEditingSeed(true)}>
              {tr('cambiar')}
            </button>
          </>
        ) : (
          <>
            {tr('Sin semilla: los chunks slime necesitan la semilla del mundo (en el juego:')}{' '}
            <code>{tr('/seed')}</code>) ·{' '}
            <button className="link" onClick={() => setEditingSeed(true)}>
              {tr('añadir semilla')}
            </button>
          </>
        )}
      </div>

      <div className="map-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={`map-canvas ${
            measuring || (tool === 'afk' && afk.placing) || (tool === 'portal' && portal.picking)
              ? 'measuring'
              : hovered || tool === 'afk'
                ? 'pointing'
                : ''
          }`}
          style={{ width: size.w, height: size.h }}
          onWheel={onWheel}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={() => {
            drag.current = null
            setHovered(null)
            setCursor(null)
          }}
        />

        {hot && cursor && (
          <div
            className="map-tip"
            style={{
              left: Math.min(cursor.sx + 16, size.w - 230),
              top: Math.min(cursor.sy + 16, size.h - 190)
            }}
          >
            <img src={thumbUrl(hot.shot.id, hot.shot.mtimeMs)} alt="" />
            <b>{hot.shot.name}</b>
            <span>
              {fmt(hot.p.x)} {fmt(hot.p.y)} {fmt(hot.p.z)} · {dimensionName(hot.p.dimension)}
            </span>
            {hot.shot.meta.note && (
              <span className="muted">{hot.shot.meta.note.split('\n')[0]}</span>
            )}
          </div>
        )}

        {tool === 'afk' && (
          <AfkPanel
            state={afk}
            onChange={setAfk}
            simulationSource={simulation.source}
            onSend={(show) => void sendPlan('afk', show)}
            onClose={() => setTool('none')}
          />
        )}
        {tool === 'portal' && (
          <PortalPanel
            state={portal}
            onChange={setPortal}
            known={knownPortals}
            onSend={(show) => void sendPlan('portals', show)}
            onClose={() => setTool('none')}
          />
        )}

        <div className="map-hud">
          <div className="map-scale">
            <span style={{ width: bar.px }} />
            {fmt(bar.blocks)} {tr('bloques')}
          </div>
          {slimeHidden && slimeOn && (
            <span className="chip">{tr('Acerca el mapa para ver los chunks slime')}</span>
          )}
          {dist !== null && (
            <span className="chip measure">
              {fmt(dist)} {tr('bloques')}
              {dimension === 'minecraft:overworld' && tr(' · {0} en el Nether', fmt(dist / 8))}
              {dimension === 'minecraft:the_nether' && tr(' · {0} en el Overworld', fmt(dist * 8))}
            </span>
          )}
          {measuring && measure.length < 2 && (
            <span className="chip">
              {tr('Haz clic en')} {measure.length ? tr('el segundo') : tr('el primer')}{' '}
              {tr('punto')}
            </span>
          )}
          <div className="toolbar-spacer" />
          {cursorWorld && (
            <span className="map-cursor">
              X {fmt(cursorWorld[0])} · Z {fmt(cursorWorld[1])} {tr('· chunk')}{' '}
              {Math.floor(cursorWorld[0] / 16)}, {Math.floor(cursorWorld[1] / 16)} · r.
              {Math.floor(cursorWorld[0] / 512)}.{Math.floor(cursorWorld[1] / 512)}
              {tr('.mca')}
              {slime &&
                dimension === 'minecraft:overworld' &&
                slime(Math.floor(cursorWorld[0] / 16), Math.floor(cursorWorld[1] / 16)) &&
                tr(' · slime')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
