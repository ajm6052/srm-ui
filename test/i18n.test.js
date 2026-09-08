import { describe, it, expect, beforeEach } from 'vitest'
import { SUPPORTED, currentLocale, setLocale } from '@i18n'

describe('i18n locale switching', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* jsdom always has it, but stay defensive */
    }
    setLocale('en')
  })

  it('supports English and Spanish', () => {
    const codes = SUPPORTED.map((l) => l.code)
    expect(codes).toContain('en')
    expect(codes).toContain('es')
  })

  it('switches the active locale, persists it, and stamps <html lang>', () => {
    setLocale('es')
    expect(currentLocale()).toBe('es')
    expect(localStorage.getItem('srm.locale')).toBe('es')
    expect(document.documentElement.getAttribute('lang')).toBe('es')
  })

  it('ignores an unsupported locale (no-op)', () => {
    setLocale('es')
    setLocale('fr') // not supported
    expect(currentLocale()).toBe('es')
    expect(localStorage.getItem('srm.locale')).toBe('es')
  })
})
