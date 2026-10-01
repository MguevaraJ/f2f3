import { afterEach, describe, expect, it } from 'vitest'
import { EN } from '../src/shared/i18n/en'
import { langForLocale, setLang, tr } from '../src/shared/i18n'

afterEach(() => setLang('es'))

describe('tr', () => {
  it('leaves Spanish as written and fills the placeholders', () => {
    expect(tr('Guardar')).toBe('Guardar')
    expect(tr('Restaurando {0} de {1}', 2, 5)).toBe('Restaurando 2 de 5')
  })

  it('translates to English and falls back to Spanish for unknown texts', () => {
    setLang('en')
    expect(tr('Guardar')).toBe('Save')
    expect(tr('Restaurando {0} de {1}', 2, 5)).toBe('Restoring 2 of 5')
    expect(tr('Texto sin traducir')).toBe('Texto sin traducir')
  })

  it('picks Spanish only for Spanish locales', () => {
    expect(langForLocale('es-MX')).toBe('es')
    expect(langForLocale('en-US')).toBe('en')
    expect(langForLocale(undefined)).toBe('en')
  })
})

describe('English dictionary', () => {
  it('never uses a placeholder the Spanish text does not have', () => {
    const marks = (s: string): string[] => s.match(/\{\d+\}/g) ?? []
    for (const [es, en] of Object.entries(EN))
      for (const m of marks(en)) expect(marks(es), es).toContain(m)
  })
})
