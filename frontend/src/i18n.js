import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import ko from './locales/ko.json'

function syncHtmlLang(lng) {
  if (typeof document === 'undefined') return
  const base = String(lng || '').split('-')[0]
  document.documentElement.lang = base === 'ko' ? 'ko' : 'en'
}

i18n.on('languageChanged', syncHtmlLang)
i18n.on('initialized', () => syncHtmlLang(i18n.language))

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
    },
    fallbackLng: 'en',
    supportedLngs: ['ko', 'en'],
    interpolation: {
      escapeValue: false,
    },
  })

syncHtmlLang(i18n.language)

export default i18n
