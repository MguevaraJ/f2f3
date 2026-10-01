import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { thumbUrl } from '@shared/ipc'
import { biomeName, DIMENSIONS, dimensionName } from '@shared/catalog/biomes'
import type { CapturePopupPayload } from '@shared/types'
import { Icon } from '../components/icons'
import { blockString, tpCommand } from '../lib/coords'
import { formatTime } from '../lib/format'
import { tr } from '@shared/i18n'

const popup = window.f2f3Popup
/** Visible time after the last update; paused while hovered. */
const LIFETIME_MS = 10_000

/** Content of the always-on-top "new capture" window. */
export function CapturePopupView() {
  const [payload, setPayload] = useState<CapturePopupPayload | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [hover, setHover] = useState(false)
  /** Time left before auto-dismiss, and when the current countdown segment started. */
  const [remaining, setRemaining] = useState(LIFETIME_MS)
  const [runStart, setRunStart] = useState(0)
  const copiedTimer = useRef<number | undefined>(undefined)

  const flash = useCallback((what: string) => {
    setCopied(what)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1600)
  }, [])

  useEffect(() => {
    const show = (p: CapturePopupPayload): void => {
      setPayload(p)
      setRemaining(LIFETIME_MS)
      setRunStart(Date.now())
      if (p.autoCopied) flash('auto')
    }
    const offShow = popup.onShow(show)
    // The first push can arrive before this effect subscribes: pull the current state too.
    void popup.current().then((p) => p && show(p))
    const offCopied = popup.onCopied(() => flash('coords'))
    return () => {
      offShow()
      offCopied()
    }
  }, [flash])

  // Auto-dismiss, paused while the pointer is over the popup.
  useEffect(() => {
    if (!payload || hover) return
    const t = window.setTimeout(() => void popup.dismiss(), remaining)
    return () => window.clearTimeout(t)
  }, [payload, hover, remaining, runStart])

  const pause = (): void => {
    setHover(true)
    setRemaining((r) => Math.max(1500, r - (Date.now() - runStart)))
  }
  const resume = (): void => {
    setHover(false)
    setRunStart(Date.now())
  }

  if (!payload) return null
  const { entry, reading, more, shortcut } = payload
  const a = entry.analysis
  const loc = a?.location
  const block = loc?.block
  const dim = a?.dimension?.id
  const tp = loc ? tpCommand(loc) : null

  const copy = (text: string, what: string): void => {
    void popup.copy(text)
    flash(what)
  }

  return (
    <div className={`popup ${hover ? 'hover' : ''}`} onMouseEnter={pause} onMouseLeave={resume}>
      <div className="popup-head">
        <span className="popup-dot" />
        <span className="popup-title">{tr('Nueva captura')}</span>
        <span className="popup-time">{formatTime(entry.capturedAt)}</span>
        {more > 0 && <span className="popup-more">+{more}</span>}
        <button
          className="popup-close"
          onClick={() => void popup.dismiss()}
          aria-label={tr('Cerrar')}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="popup-body">
        <button
          className="popup-thumb"
          onClick={() => void popup.open(entry.id)}
          title={tr('Ver en F2+F3')}
        >
          <img src={thumbUrl(entry.id, entry.mtimeMs)} alt="" />
        </button>
        <div className="popup-info">
          {reading ? (
            <div className="popup-reading">
              <span className="spinner" /> {tr('Leyendo F3…')}
            </div>
          ) : block ? (
            <>
              <div className="popup-coords" title={tr('Coordenadas del bloque')}>
                {block.x} <span>{block.y}</span> {block.z}
              </div>
              <div className="popup-meta">
                {dim && (
                  <span>
                    <span
                      className="dot"
                      style={{ background: DIMENSIONS[dim]?.color ?? '#888' }}
                    />
                    {dimensionName(dim)}
                  </span>
                )}
                {a?.biome && a.biome.source !== 'heuristic' && <span>{biomeName(a.biome.id)}</span>}
              </div>
            </>
          ) : (
            <div className="popup-nof3">
              <strong>{tr('Sin F3')}</strong>
              <span>{tr('Esta captura no muestra coordenadas.')}</span>
            </div>
          )}
          <div className="popup-name">{entry.name}</div>
        </div>
      </div>

      <div className="popup-actions">
        {block ? (
          <>
            <button
              className={`pbtn primary ${copied === 'coords' || copied === 'auto' ? 'done' : ''}`}
              onClick={() => copy(blockString(block), 'coords')}
            >
              <Icon name={copied === 'coords' || copied === 'auto' ? 'check' : 'copy'} size={15} />
              {copied === 'auto'
                ? tr('Copiadas')
                : copied === 'coords'
                  ? tr('¡Copiado!')
                  : tr('Copiar X Y Z')}
              {shortcut && copied !== 'coords' && copied !== 'auto' && <kbd>{shortcut}</kbd>}
            </button>
            {tp && (
              <button
                className={`pbtn ${copied === 'tp' ? 'done' : ''}`}
                onClick={() => copy(tp, 'tp')}
                title={tp}
              >
                {copied === 'tp' ? <Icon name="check" size={15} /> : '/tp'}
              </button>
            )}
          </>
        ) : (
          <button
            className={`pbtn ${copied === 'image' ? 'done' : ''}`}
            disabled={reading}
            onClick={() => {
              void popup.copyImage(entry.id)
              flash('image')
            }}
          >
            <Icon name={copied === 'image' ? 'check' : 'image'} size={15} />
            {copied === 'image' ? tr('¡Copiada!') : tr('Copiar imagen')}
          </button>
        )}
        <button className="pbtn" onClick={() => void popup.open(entry.id)}>
          <Icon name="eye" size={15} /> {tr('Ver')}
        </button>
      </div>

      <div className="popup-timer">
        <div
          key={`${runStart}-${hover}`}
          className={`popup-timer-fill ${hover ? 'paused' : ''}`}
          style={
            {
              animationDuration: `${remaining}ms`,
              '--from': remaining / LIFETIME_MS
            } as CSSProperties
          }
        />
      </div>
    </div>
  )
}
