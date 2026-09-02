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

// 사용자가 마이페이지에서 직접 고른 언어만 기록 (LanguageDetector 의 자동 감지값과 구분)
const EXPLICIT_LANG_KEY = 'tf_lang_choice'
export function setExplicitLanguage(lng) {
  try { localStorage.setItem(EXPLICIT_LANG_KEY, String(lng || '').split('-')[0]) } catch (_) { /* noop */ }
}
/**
 * SEO 계층(title/meta/JSON-LD) 전용 언어.
 * 크롤러는 en-US 로케일로 렌더하므로 UI 언어를 그대로 쓰면 한국 서비스의 메타가 영어로 수집된다.
 * → 사용자가 직접 영어를 고른 경우에만 'en', 그 외(자동 감지·미선택)는 항상 'ko'.
 */
export function getSeoLanguage() {
  try { const v = localStorage.getItem(EXPLICIT_LANG_KEY); if (v && v.startsWith('en')) return 'en' } catch (_) { /* noop */ }
  return 'ko'
}
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
    // localStorage 우선 → navigator 순으로 감지
    // → 사용자가 직접 선택한 언어는 새로고침 후에도 유지
    // → 첫 방문 시 디바이스 언어가 ko면 한국어, 나머지는 영어
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

syncHtmlLang(i18n.language)

export default i18n
