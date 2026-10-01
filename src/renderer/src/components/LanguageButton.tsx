import { getLang, LANG_STORAGE_KEY, type Lang } from '@shared/i18n'
import { useSettings } from '../store/settings'
import { tr } from '@shared/i18n'

const NAMES: Record<Lang, string> = { es: tr('Español'), en: 'English' }

/** Saves the language and reloads the window: texts are translated when the UI is built. */
export async function changeLanguage(lang: Lang): Promise<void> {
  if (lang === getLang()) return
  await useSettings.getState().update({ language: lang })
  localStorage.setItem(LANG_STORAGE_KEY, lang)
  location.reload()
}

/** ES | EN switch in the header. */
export function LanguageButton() {
  const current = getLang()
  return (
    <div className="lang-switch" role="group" aria-label="Idioma / Language">
      {(Object.keys(NAMES) as Lang[]).map((lang) => (
        <button
          key={lang}
          className={lang === current ? 'on' : ''}
          aria-pressed={lang === current}
          title={NAMES[lang]}
          onClick={() => void changeLanguage(lang)}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

/** The same choice as a drop-down, for Settings. */
export function LanguageSelect() {
  return (
    <select
      className="input"
      value={getLang()}
      onChange={(e) => void changeLanguage(e.target.value as Lang)}
      aria-label="Idioma / Language"
    >
      {(Object.keys(NAMES) as Lang[]).map((lang) => (
        <option key={lang} value={lang}>
          {NAMES[lang]}
        </option>
      ))}
    </select>
  )
}
