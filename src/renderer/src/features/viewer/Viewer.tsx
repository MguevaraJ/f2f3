import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { imageUrl, thumbUrl } from '@shared/ipc'
import type { ScreenshotEntry } from '@shared/types'
import { Icon } from '../../components/icons'
import { isEditable } from '../../lib/dom'
import { formatDateTime } from '../../lib/format'
import { useUi } from '../../store/ui'
import { DetailsPanel } from '../details/DetailsPanel'
import { copyImage, copyText, deleteItems, renameItem, toggleFavorite } from '../library/actions'
import { tr } from '@shared/i18n'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 32
const ZOOM_STEPS = [
  0.05, 0.1, 0.17, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32
]
const FIT_PADDING = 48

interface View {
  zoom: number
  x: number
  y: number
}

interface Pixel {
  x: number
  y: number
  color: string
}

/** Viewer preferences that persist while moving between images. */
interface Prefs {
  showInfo: boolean
  showStrip: boolean
  smooth: boolean
  picker: boolean
}

/**
 * Full-window image viewer. The outer component owns navigation and the
 * preferences; the frame is keyed by screenshot so per-image state (zoom,
 * pan, rotation) starts fresh for every image.
 */
export function Viewer({ shots }: { shots: ScreenshotEntry[] }) {
  const viewerId = useUi((s) => s.viewerId)
  const openViewer = useUi((s) => s.openViewer)
  const [prefs, setPrefs] = useState<Prefs>({
    showInfo: true,
    showStrip: true,
    smooth: false,
    picker: false
  })
  const index = shots.findIndex((s) => s.id === viewerId)
  const shot = index >= 0 ? shots[index] : undefined

  const go = useCallback(
    (delta: number) => {
      if (!shots.length) return
      const next = shots[(index + delta + shots.length) % shots.length]
      openViewer(next.id)
      useUi.getState().select([next.id], next.id)
    },
    [index, shots, openViewer]
  )

  if (!shot) return null
  return (
    <ViewerFrame
      shot={shot}
      shots={shots}
      index={index}
      go={go}
      prefs={prefs}
      setPrefs={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
    />
  )
}

interface FrameProps {
  shot: ScreenshotEntry
  shots: ScreenshotEntry[]
  index: number
  go(delta: number): void
  prefs: Prefs
  setPrefs(patch: Partial<Prefs>): void
}

function ViewerFrame({ shot, shots, index, go, prefs, setPrefs }: FrameProps) {
  const openViewer = useUi((s) => s.openViewer)
  const dialog = useUi((s) => s.dialog)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)

  const [stage, setStage] = useState({ w: 0, h: 0 })
  /** Real size of the image once it has loaded; until then the library's size frames it. */
  const [dims, setDims] = useState<{ id: string; w: number; h: number } | null>(null)
  const loaded = dims?.id === shot.id
  const natural = loaded ? dims : { w: shot.width, h: shot.height }
  const [rotation, setRotation] = useState(0)
  const [flip, setFlip] = useState({ x: false, y: false })
  /** null = "fit to window" (derived from the stage size), otherwise a manual view. */
  const [manual, setManual] = useState<View | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  const [pixel, setPixel] = useState<Pixel | null>(null)
  const { showInfo, showStrip, smooth, picker } = prefs

  // The viewer stays mounted while moving between screenshots (no flicker): only the
  // per-image state starts over.
  const [shownId, setShownId] = useState(shot.id)
  if (shownId !== shot.id) {
    setShownId(shot.id)
    setRotation(0)
    setFlip({ x: false, y: false })
    setManual(null)
    setPixel(null)
  }
  useEffect(() => {
    canvasRef.current = null
  }, [shot.id])

  // Track the stage size; "fit" is then pure derived state.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setStage({ w: entry.contentRect.width, h: entry.contentRect.height })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rotated = rotation % 180 !== 0
  const fitZoom =
    natural.w && stage.w
      ? Math.min(
          (stage.w - FIT_PADDING) / (rotated ? natural.h : natural.w),
          (stage.h - FIT_PADDING) / (rotated ? natural.w : natural.h),
          1
        )
      : 1
  const view: View = manual ?? { zoom: fitZoom, x: 0, y: 0 }

  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    openViewer(null)
  }, [openViewer])

  /** Zooms keeping the image point under (cx, cy) — stage coords from the centre — fixed. */
  const zoomTo = useCallback(
    (zoom: number, cx = 0, cy = 0) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
      const k = z / view.zoom
      setManual({ zoom: z, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k })
    },
    [view.zoom, view.x, view.y]
  )

  const step = useCallback(
    (dir: 1 | -1) => {
      const next =
        dir > 0
          ? (ZOOM_STEPS.find((z) => z > view.zoom * 1.01) ?? MAX_ZOOM)
          : ([...ZOOM_STEPS].reverse().find((z) => z < view.zoom * 0.99) ?? MIN_ZOOM)
      zoomTo(next)
    },
    [view.zoom, zoomTo]
  )

  const fit = useCallback(() => setManual(null), [])
  const rotate = useCallback((deg: number) => {
    setRotation((r) => (r + deg + 360) % 360)
    setManual(null)
  }, [])
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }, [])

  // Keyboard shortcuts (capture phase so the gallery underneath never sees them).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (dialog || isEditable(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void copyImage(shot.id)
        return
      }
      if (ctrl) return
      const map: Record<string, () => void> = {
        Escape: close,
        ArrowLeft: () => go(-1),
        ArrowRight: () => go(1),
        PageUp: () => go(-1),
        PageDown: () => go(1),
        '+': () => step(1),
        '=': () => step(1),
        '-': () => step(-1),
        '0': fit,
        '1': () => zoomTo(1),
        '2': () => zoomTo(2),
        '4': () => zoomTo(4),
        r: () => rotate(e.shiftKey ? -90 : 90),
        h: () => setFlip((f) => ({ ...f, x: !f.x })),
        v: () => setFlip((f) => ({ ...f, y: !f.y })),
        i: () => setPrefs({ showInfo: !showInfo }),
        t: () => setPrefs({ showStrip: !showStrip }),
        s: () => setPrefs({ smooth: !smooth }),
        p: () => setPrefs({ picker: !picker }),
        f: () => toggleFavorite([shot.id]),
        F11: toggleFullscreen,
        F2: () => renameItem(shot.id),
        Delete: () => deleteItems([shot.id])
      }
      const fn = map[e.key] ?? map[e.key.toLowerCase()]
      if (fn) {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [
    close,
    go,
    step,
    fit,
    zoomTo,
    rotate,
    toggleFullscreen,
    shot.id,
    dialog,
    showInfo,
    showStrip,
    smooth,
    picker,
    setPrefs
  ])

  const stagePoint = (e: { clientX: number; clientY: number }): { cx: number; cy: number } => {
    const r = stageRef.current!.getBoundingClientRect()
    return { cx: e.clientX - r.left - r.width / 2, cy: e.clientY - r.top - r.height / 2 }
  }

  const onWheel = (e: WheelEvent): void => {
    const { cx, cy } = stagePoint(e)
    zoomTo(view.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), cx, cy)
  }

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    // Capturing the pointer would redirect the click away from the ‹ › buttons on the stage.
    if (e.target instanceof Element && e.target.closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y, moved: false }
  }
  const onPointerMove = (e: PointerEvent): void => {
    const d = drag.current
    if (d) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
        d.moved = true
        setGrabbing(true)
      }
      if (d.moved) setManual({ zoom: view.zoom, x: d.ox + dx, y: d.oy + dy })
    }
    if (picker) setPixel(readPixel(e.clientX, e.clientY))
  }
  const onPointerUp = (e: PointerEvent): void => {
    const d = drag.current
    drag.current = null
    setGrabbing(false)
    if (d && !d.moved && picker) {
      const px = readPixel(e.clientX, e.clientY)
      if (px) void copyText(px.color, tr('Color {0}', px.color))
    }
  }

  /** Maps a screen point to image pixel coordinates (undoing rotation/flip) and samples it. */
  const readPixel = (clientX: number, clientY: number): Pixel | null => {
    const img = imgRef.current
    if (!img || !img.complete || !natural.w) return null
    const r = img.getBoundingClientRect()
    let u = (clientX - (r.left + r.width / 2)) / view.zoom
    let v = (clientY - (r.top + r.height / 2)) / view.zoom
    const rad = (-rotation * Math.PI) / 180
    ;[u, v] = [u * Math.cos(rad) - v * Math.sin(rad), u * Math.sin(rad) + v * Math.cos(rad)]
    if (flip.x) u = -u
    if (flip.y) v = -v
    const x = Math.floor(u + natural.w / 2)
    const y = Math.floor(v + natural.h / 2)
    if (x < 0 || y < 0 || x >= natural.w || y >= natural.h) return null
    if (!canvasRef.current) {
      const c = document.createElement('canvas')
      c.width = natural.w
      c.height = natural.h
      c.getContext('2d', { willReadFrequently: true })?.drawImage(img, 0, 0)
      canvasRef.current = c
    }
    const d = canvasRef.current
      .getContext('2d', { willReadFrequently: true })
      ?.getImageData(x, y, 1, 1).data
    if (!d) return null
    return {
      x,
      y,
      color:
        `#${[d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    }
  }

  const transform = `translate(${view.x}px, ${view.y}px) rotate(${rotation}deg) scale(${view.zoom * (flip.x ? -1 : 1)}, ${view.zoom * (flip.y ? -1 : 1)})`
  const pixelated = !smooth && view.zoom >= 1

  return (
    <div className="viewer" role="dialog" aria-label={tr('Visor: {0}', shot.name)}>
      <div className="viewer-top">
        <button className="icon-btn" onClick={close} title={tr('Cerrar (Esc)')}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="viewer-title">
          <strong>{shot.name}</strong>
          <span className="muted">
            {formatDateTime(shot.capturedAt)} · {index + 1} / {shots.length}
          </span>
        </div>
        <div className="viewer-tools">
          <button className="icon-btn" onClick={() => step(-1)} title={tr('Alejar (-)')}>
            <Icon name="zoomOut" />
          </button>
          <button className="zoom-readout" onClick={() => zoomTo(1)} title={tr('Tamaño real (1)')}>
            {Math.round(view.zoom * 100)}%
          </button>
          <button className="icon-btn" onClick={() => step(1)} title={tr('Acercar (+)')}>
            <Icon name="zoomIn" />
          </button>
          <button
            className={`icon-btn ${manual ? '' : 'on'}`}
            onClick={fit}
            title={tr('Ajustar a la ventana (0)')}
          >
            <Icon name="fit" />
          </button>
          <button className="icon-btn" onClick={() => zoomTo(1)} title={tr('Tamaño real 1:1 (1)')}>
            <Icon name="actual" />
          </button>
          <span className="tool-sep" />
          <button className="icon-btn" onClick={() => rotate(90)} title={tr('Rotar (R)')}>
            <Icon name="rotate" />
          </button>
          <button
            className={`icon-btn ${flip.x ? 'on' : ''}`}
            onClick={() => setFlip((f) => ({ ...f, x: !f.x }))}
            title={tr('Voltear horizontal (H)')}
          >
            <Icon name="flip" />
          </button>
          <button
            className={`icon-btn ${picker ? 'on' : ''}`}
            onClick={() => setPrefs({ picker: !picker })}
            title={tr('Cuentagotas: coordenadas y color del píxel (P)')}
          >
            <Icon name="pipette" />
          </button>
          <button
            className={`icon-btn ${smooth ? 'on' : ''}`}
            onClick={() => setPrefs({ smooth: !smooth })}
            title={tr('Suavizado al ampliar (S)')}
          >
            <Icon name="grid" />
          </button>
          <span className="tool-sep" />
          <button
            className={`icon-btn ${shot.meta.favorite ? 'on fav' : ''}`}
            onClick={() => toggleFavorite([shot.id])}
            title={tr('Favorita (F)')}
          >
            <Icon name="star" fill={shot.meta.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            className="icon-btn"
            onClick={() => void copyImage(shot.id)}
            title={tr('Copiar imagen (Ctrl+C)')}
          >
            <Icon name="copy" />
          </button>
          <button
            className="icon-btn"
            onClick={() => deleteItems([shot.id])}
            title={tr('Eliminar (Supr)')}
          >
            <Icon name="trash" />
          </button>
          <button
            className="icon-btn"
            onClick={toggleFullscreen}
            title={tr('Pantalla completa (F11)')}
          >
            <Icon name="fullscreen" />
          </button>
          <button
            className={`icon-btn ${showInfo ? 'on' : ''}`}
            onClick={() => setPrefs({ showInfo: !showInfo })}
            title={tr('Información (I)')}
          >
            <Icon name="info" />
          </button>
        </div>
      </div>

      <div className="viewer-body">
        <div className="viewer-center">
          <div
            ref={stageRef}
            className={`viewer-stage ${picker ? 'picking' : ''} ${grabbing ? 'grabbing' : ''}`}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setPixel(null)}
            onDoubleClick={(e) => {
              if (!manual || view.zoom < 0.99) {
                const { cx, cy } = stagePoint(e)
                zoomTo(1, cx, cy)
              } else fit()
            }}
          >
            {/* The thumbnail shows at once, framed like the image that then fades in over it. */}
            <img
              key={`thumb-${shot.id}`}
              className="viewer-placeholder"
              src={thumbUrl(shot.id, shot.mtimeMs)}
              alt=""
              draggable={false}
              style={{
                width: natural.w,
                height: natural.h,
                transform,
                // Leaves once the image has faded in over it (its blur would show as a halo).
                opacity: loaded ? 0 : undefined,
                transitionDelay: loaded ? '0.2s' : undefined
              }}
            />
            <img
              key={shot.id}
              ref={imgRef}
              className={`viewer-img ${pixelated ? 'pixelated' : ''}`}
              src={imageUrl(shot.id, shot.mtimeMs)}
              crossOrigin="anonymous"
              alt={shot.name}
              draggable={false}
              style={{ transform, opacity: loaded ? 1 : 0 }}
              onLoad={(e) =>
                setDims({
                  id: shot.id,
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight
                })
              }
            />
            <button
              className="viewer-nav prev"
              onClick={() => go(-1)}
              aria-label={tr('Anterior (←)')}
            >
              <Icon name="chevronLeft" size={28} />
            </button>
            <button
              className="viewer-nav next"
              onClick={() => go(1)}
              aria-label={tr('Siguiente (→)')}
            >
              <Icon name="chevronRight" size={28} />
            </button>
            {picker && (
              <div className="pixel-readout">
                {pixel ? (
                  <>
                    <span className="swatch" style={{ background: pixel.color }} />
                    <span>
                      {pixel.x}, {pixel.y}
                    </span>
                    <b>{pixel.color}</b>
                    <span className="muted">{tr('clic para copiar')}</span>
                  </>
                ) : (
                  <span className="muted">{tr('Pasa el cursor sobre la imagen')}</span>
                )}
              </div>
            )}
          </div>

          {showStrip && (
            <Filmstrip
              shots={shots}
              current={shot.id}
              onPick={(id) => {
                openViewer(id)
                useUi.getState().select([id], id)
              }}
            />
          )}
        </div>

        {showInfo && (
          <aside className="viewer-info">
            <DetailsPanel shot={shot} compact />
          </aside>
        )}
      </div>
    </div>
  )
}

function Filmstrip({
  shots,
  current,
  onPick
}: {
  shots: ScreenshotEntry[]
  current: string
  onPick(id: string): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current
      ?.querySelector('.strip-item.current')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [current])
  return (
    <div className="filmstrip" ref={ref}>
      {shots.map((s) => (
        <button
          key={s.id}
          className={`strip-item ${s.id === current ? 'current' : ''}`}
          onClick={() => onPick(s.id)}
          title={s.name}
        >
          <img src={thumbUrl(s.id, s.mtimeMs)} alt="" loading="lazy" draggable={false} />
        </button>
      ))}
    </div>
  )
}
