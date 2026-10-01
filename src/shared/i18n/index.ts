import { EN } from './en'

/**
 * The app is written in Spanish; English is a dictionary keyed by the Spanish text.
 * A text without translation stays in Spanish, so nothing ever shows up empty.
 * The language is fixed before the UI is built (texts held in module constants are
 * translated once): changing it reloads the window.
 */
export type Lang = 'es' | 'en'

export const LANGS: Lang[] = ['es', 'en']
export const LANG_STORAGE_KEY = 'f2f3.lang'

export const isLang = (v: unknown): v is Lang => v === 'es' || v === 'en'

/** Language for a system locale ("es-MX", "en-US"…): Spanish for Spanish, English for the rest. */
export const langForLocale = (locale: string | undefined): Lang =>
  locale?.toLowerCase().startsWith('es') ? 'es' : 'en'

function initial(): Lang {
  // In a window: the choice kept for the next load, else the system's language.
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LANG_STORAGE_KEY)
      if (isLang(saved)) return saved
      return langForLocale(navigator.language)
    }
  } catch {
    /* no storage: fall through */
  }
  return 'es'
}

let lang: Lang = initial()

export const getLang = (): Lang => lang

export function setLang(next: Lang): void {
  lang = next
}

/**
 * The text in the current language. "{0}", "{1}"… are replaced by `args`, so word
 * order can change between languages.
 */
export function tr(text: string, ...args: (string | number | null | undefined)[]): string {
  const base = lang === 'en' ? (EN[text] ?? text) : text
  return args.length ? base.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : base
}
