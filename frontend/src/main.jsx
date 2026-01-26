import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 카카오 SDK 초기화
if (window.Kakao && !window.Kakao.isInitialized()) {
  const kakaoKey = import.meta.env.VITE_KAKAO_JS_KEY
  if (kakaoKey) {
    window.Kakao.init(kakaoKey)
    console.log('✅ 카카오 SDK 초기화 완료:', window.Kakao.isInitialized())
  } else {
    console.warn('⚠️ 카카오 JavaScript 키가 설정되지 않았습니다.')
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
