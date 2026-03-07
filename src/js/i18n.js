const defaultLang = 'en'
const handledLanguages = ['pl', 'en']
let translations = {}
let currentLang = defaultLang

function normalizeLang(lang) {
  const l = String(lang).toLowerCase()
  return l.split('-')[0]
}

export function detectLanguage() {
  let lang = navigator.language ?? defaultLang
  lang = normalizeLang(lang)
  if (!handledLanguages.includes(lang)) {
    lang = defaultLang
  }
  return lang
}

export async function initI18n() {
  currentLang = detectLanguage()
  const url = `/i18n/${currentLang}.json`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    translations = await response.json()
  } catch {
    translations = {}
  }

  applyTranslations(document)
}

export function t(key, params = {}) {
  const raw = translations[key] || key
  return String(raw).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = params[k]
    return v == null ? '' : String(v)
  })
}

export function applyTranslations(root = document) {
  const nodes = root.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-alt]')
  for (const el of nodes) {
    const textKey = el.getAttribute('data-i18n')
    if (textKey) el.textContent = t(textKey)

    const titleKey = el.getAttribute('data-i18n-title')
    if (titleKey) el.setAttribute('title', t(titleKey))

    const altKey = el.getAttribute('data-i18n-alt')
    if (altKey) el.setAttribute('alt', t(altKey))
  }
}

export function getCurrentLanguage() {
  return currentLang
}
