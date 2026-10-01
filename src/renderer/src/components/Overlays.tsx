import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useToasts } from '../store/toasts'
import { useUi, type DialogState } from '../store/ui'
import { Icon } from './icons'
import { tr } from '@shared/i18n'

const dialogKeys = new WeakMap<object, number>()
let dialogSeq = 0
const keyOf = (d: object): number => {
  if (!dialogKeys.has(d)) dialogKeys.set(d, ++dialogSeq)
  return dialogKeys.get(d)!
}

/** Launcher-style modal for prompts (new folder, rename) and confirmations (delete). */
export function Dialog() {
  const dialog = useUi((s) => s.dialog)
  return dialog ? <DialogForm key={keyOf(dialog)} dialog={dialog} /> : null
}

function DialogForm({ dialog }: { dialog: DialogState }) {
  const close = (): void => useUi.getState().openDialog(null)
  const [value, setValue] = useState(dialog.kind === 'prompt' ? dialog.value : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (dialog.kind !== 'prompt') return
    const input = inputRef.current
    input?.focus()
    input?.setSelectionRange(0, dialog.selectLength ?? dialog.value.length)
  }, [dialog])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      if (dialog.kind === 'prompt') {
        if (!value.trim() && !dialog.allowEmpty) throw new Error(tr('Escribe un nombre'))
        await dialog.onSubmit(value.trim())
      } else await dialog.onConfirm()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="modal"
        role="dialog"
        aria-modal
        aria-labelledby="modal-title"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="modal-head">
          <h2 id="modal-title">{dialog.title}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label={tr('Cerrar')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          {dialog.kind === 'prompt' ? (
            <label className="field">
              <span>{dialog.label}</span>
              <input
                ref={inputRef}
                className="input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
              />
            </label>
          ) : (
            <p>{dialog.message}</p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={close}>
            {tr('Cancelar')}
          </button>
          <button
            type="submit"
            className={`btn ${dialog.kind === 'confirm' && dialog.danger ? 'danger' : 'primary'}`}
            disabled={busy}
            autoFocus={dialog.kind === 'confirm'}
          >
            {dialog.confirm}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ContextMenu() {
  const menu = useUi((s) => s.menu)
  const closeMenu = useUi((s) => s.closeMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8)
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (e: Event): void => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'mousedown' && ref.current?.contains(e.target as Node)) return
      closeMenu()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [menu, closeMenu])

  if (!menu) return null
  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              closeMenu()
              item.action?.()
            }}
          >
            <span className="menu-icon">{item.icon && <Icon name={item.icon} size={16} />}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`} onClick={() => dismiss(t.id)}>
          <Icon
            name={t.level === 'error' ? 'close' : t.level === 'success' ? 'check' : 'info'}
            size={16}
          />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
