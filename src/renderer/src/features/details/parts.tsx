import { useState, type ReactNode } from 'react'
import type { InfoSource, VisionResult } from '@shared/types'
import { Icon } from '../../components/icons'
import { formatNumber } from '../../lib/format'
import { PROVIDER_LABEL, SOURCE_INFO } from '../../lib/sources'
import { copyText } from '../library/actions'
import { tr } from '@shared/i18n'

/** Building blocks of the details panel. */

export function Section({
  title,
  icon,
  children,
  collapsed = false,
  accent = false,
  action
}: {
  title: string
  icon: string
  children: ReactNode
  collapsed?: boolean
  accent?: boolean
  /** Extra control shown in the header (kept outside the toggle button). */
  action?: ReactNode
}) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <section className={`dsec ${accent ? 'accent' : ''}`}>
      <div className="dsec-headrow">
        <button className="dsec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={icon} size={16} />
          <span>{title}</span>
          <Icon name="chevronDown" size={16} className={`dsec-caret ${open ? 'open' : ''}`} />
        </button>
        {action}
      </div>
      {open && <div className="dsec-body">{children}</div>}
    </section>
  )
}

/** `wrap`: long labels break into lines instead of being cut. */
export function Rows({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return <dl className={`rows ${wrap ? 'wrap' : ''}`}>{children}</dl>
}

export function Row({
  k,
  v,
  hint,
  copy = true
}: {
  k: string
  v: string
  hint?: string
  copy?: boolean
}) {
  return (
    <div className="row">
      <dt title={hint}>{k}</dt>
      <dd>
        <span className="row-value">{v}</span>
        {copy && (
          <button
            className="row-copy"
            onClick={() => void copyText(v, k)}
            title={tr('Copiar {0}', k)}
          >
            <Icon name="copy" size={13} />
          </button>
        )}
      </dd>
    </div>
  )
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <div className="fact-label">{label}</div>
      {children}
    </div>
  )
}

export function Axis({ label, value }: { label: string; value: number }) {
  return (
    <button
      className="axis"
      onClick={() => void copyText(formatNumber(value), tr('Coordenada {0}', label))}
      title={tr('Copiar {0}', label)}
    >
      <span className="axis-label">{label}</span>
      <span className="axis-value">{formatNumber(value)}</span>
    </button>
  )
}

export function CopyButton({
  label,
  value,
  title
}: {
  label: string
  value: string
  title?: string
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      className={`copy-btn ${done ? 'done' : ''}`}
      title={title ?? value}
      onClick={() => {
        void copyText(value, label)
        setDone(true)
        window.setTimeout(() => setDone(false), 1200)
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={14} />
      <span className="copy-label">{label}</span>
      <span className="copy-value">{value}</span>
    </button>
  )
}

export function CopyChip({ value, what }: { value: string; what: string }) {
  return (
    <button
      className="chip"
      onClick={() => void copyText(value, what)}
      title={tr('Copiar {0}', what)}
    >
      <Icon name="copy" size={12} /> {value}
    </button>
  )
}

export function SourceTag({
  source,
  confidence,
  vision
}: {
  source: InfoSource
  confidence?: number
  vision?: VisionResult | null
}) {
  const info = SOURCE_INFO[source]
  const pct =
    confidence !== undefined && source !== 'f3' && source !== 'manual'
      ? ` · ${Math.round(confidence * 100)}%`
      : ''
  const who = source === 'vision' && vision?.provider ? ` (${PROVIDER_LABEL[vision.provider]})` : ''
  return (
    <span className={`source-tag ${source}`} title={`${info.label}${who}${pct}. ${info.hint}`}>
      {source === 'vision' && vision?.provider
        ? `IA · ${PROVIDER_LABEL[vision.provider]}`
        : info.tag}
    </span>
  )
}
