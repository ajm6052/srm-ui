import { createI18n } from 'vue-i18n'
import { en as vuetifyEn, es as vuetifyEs } from 'vuetify/locale'
import en from './en'
import es from './es'

// Supported UI languages. English is the source/fallback; Spanish is a full
// translation. Adding a locale = a new message file + an entry here.
export const SUPPORTED = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'es', label: 'Español', short: 'ES' },
]
const CODES = SUPPORTED.map((l) => l.code)
const STORAGE_KEY = 'srm.locale'

function initialLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (CODES.includes(saved)) return saved
  } catch {
    // ignore — fall through to the browser language
  }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase()
  return CODES.includes(nav) ? nav : 'en'
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale(),
  fallbackLocale: 'en',
  // Vuetify's own component strings (data-table footer, pagination, …) live under
  // the $vuetify key so the shared locale adapter translates them too.
  messages: {
    en: { ...en, $vuetify: vuetifyEn },
    es: { ...es, $vuetify: vuetifyEs },
  },
})

export function currentLocale() {
  return i18n.global.locale.value
}

// setLocale switches the active language, persists the choice, and updates the
// document's lang attribute (for accessibility and the browser's own UI).
export function setLocale(code) {
  if (!CODES.includes(code)) return
  i18n.global.locale.value = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // ignore — the choice just won't persist across reloads
  }
  document.documentElement.setAttribute('lang', code)
}

// Reflect the initial locale on the document at startup.
document.documentElement.setAttribute('lang', currentLocale())
