import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.jsx'
import './index.css'

// Samsung Internet: 강제 다크모드에서 그라데이션/클립 텍스트가 어둡게 깨지는 이슈 대응용
try {
  const ua = window?.navigator?.userAgent || ""
  if (/SamsungBrowser/i.test(ua)) {
    document.documentElement.classList.add("samsung-internet")
  }
} catch (_) {}

// 카카오 SDK 초기화
if (window.Kakao && !window.Kakao.isInitialized()) {
  const kakaoKey = import.meta.env.VITE_KAKAO_JS_KEY
  if (kakaoKey) {
    window.Kakao.init(kakaoKey)
  } else {
    console.warn('⚠️ 카카오 JavaScript 키가 설정되지 않았습니다.')
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)
