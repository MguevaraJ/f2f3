import { getLang, tr } from '@shared/i18n'
const dateFmt = new Intl.DateTimeFormat(getLang(), { dateStyle: 'long' })
const dateTimeFmt = new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' })
const timeFmt = new Intl.DateTimeFormat(getLang(), { timeStyle: 'short' })
const rel = new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' })

export const formatDate = (t: number): string => dateFmt.format(t)
export const formatDateTime = (t: number): string => dateTimeFmt.format(t)
export const formatTime = (t: number): string => timeFmt.format(t)

export function dayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function formatDayHeading(t: number): string {
  const today = new Date()
  const d = new Date(t)
  const diffDays = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000
  )
  if (diffDays === 0) return tr('Hoy')
  if (diffDays === 1) return tr('Ayer')
  const s = formatDate(t)
  return diffDays < 7
    ? `${capitalize(new Intl.DateTimeFormat(getLang(), { weekday: 'long' }).format(t))}, ${s}`
    : s
}

export function formatRelative(t: number): string {
  const sec = (t - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60]
  ]
  for (const [unit, s] of units)
    if (Math.abs(sec) >= s) return rel.format(Math.round(sec / s), unit)
  return tr('hace un momento')
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

export const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function formatNumber(n: number, decimals = 3): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals).replace(/\.?0+$/, '')
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString(getLang())} ${n === 1 ? one : many}`
}
