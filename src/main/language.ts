import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLang, langForLocale, setLang } from '@shared/i18n'

/**
 * Sets the app's language before anything else is loaded (this module is the first import
 * of the main process): texts kept in module constants are translated when their module is
 * evaluated. The saved choice wins; without one, the system's language.
 */
function savedLanguage(): unknown {
  const given = app.commandLine.getSwitchValue('user-data-dir')
  const dirs = given
    ? [given]
    : [join(app.getPath('appData'), 'F2F3'), join(app.getPath('appData'), 'Craftshot')]
  for (const dir of dirs) {
    try {
      return (
        JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as { language?: unknown }
      ).language
    } catch {
      /* no settings there yet */
    }
  }
  return undefined
}

const saved = savedLanguage()
setLang(
  isLang(saved)
    ? saved
    : langForLocale(app.getPreferredSystemLanguages()[0] ?? process.env.LANG ?? app.getLocale())
)
