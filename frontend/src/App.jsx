import { useState, useEffect } from 'react'
import CityAutocompleteComponent from './components/CityAutocomplete'
import SocialLoginButtons from './components/SocialLoginButtons'
import { supabase } from './lib/supabaseClient'

function App() {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [birthDate, setBirthDate] = useState('')
  const [birthTime, setBirthTime] = useState('')
  const [cityData, setCityData] = useState({
    name: '',
    lat: null,
    lng: null,
    timezone: ''
  })
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 인증 상태 확인
  useEffect(() => {
    // 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoadingAuth(false)
    })

    // 인증 상태 변경 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoadingAuth(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 로그아웃 함수
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      setInterpretation('')
      setBirthDate('')
      setBirthTime('')
      setCityData({ name: '', lat: null, lng: null, timezone: '' })
    } catch (error) {
      console.error('로그아웃 오류:', error.message)
    }
  }

  // 도시 선택 시 호출되는 콜백
  const handleCitySelect = (selectedCity) => {
    setCityData({
      name: selectedCity.name,
      lat: selectedCity.lat,
      lng: selectedCity.lng,
      timezone: selectedCity.timezone
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInterpretation('')

    try {
      // 도시 정보 확인
      if (!cityData.lat || !cityData.lng) {
        throw new Error('도시를 선택해주세요.')
      }
      
      // 생년월일과 시간을 합쳐서 ISO 형식으로 변환
      const birthDateTime = birthTime 
        ? `${birthDate}T${birthTime}:00`
        : `${birthDate}T00:00:00`

      // 프로덕션에서는 환경 변수 사용, 개발 환경에서는 localhost 사용
      // GitHub Pages에서는 Cloudflare Workers URL 사용
      const apiUrl = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' 
          ? 'http://localhost:8787' 
          : 'https://true-future-backend.adriejeon.workers.dev');
      const response = await fetch(`${apiUrl}/api/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          birthDate: birthDateTime,
          lat: cityData.lat,
          lng: cityData.lng,
          reportType: 'daily'
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || '서버 오류가 발생했습니다.')
      }

      const data = await response.json()
      
      // 축약된 JSON 키를 읽기 쉬운 형식으로 변환
      // 백엔드 응답 형식: {s: "요약", a: ["행동1", "행동2", "행동3"], k: ["키워드1", "키워드2"]}
      if (data.interpretation) {
        const interp = data.interpretation;
        let formatted = '';
        
        if (interp.s) {
          formatted += `📝 ${interp.s}\n\n`;
        }
        
        if (interp.a && Array.isArray(interp.a) && interp.a.length > 0) {
          formatted += '💡 행동 지침:\n';
          interp.a.forEach((item, idx) => {
            formatted += `${idx + 1}. ${item}\n`;
          });
          formatted += '\n';
        }
        
        if (interp.k && Array.isArray(interp.k) && interp.k.length > 0) {
          formatted += `🏷️ 키워드: ${interp.k.join(', ')}`;
        }
        
        setInterpretation(formatted || JSON.stringify(interp, null, 2))
      } else {
        setInterpretation('결과를 불러올 수 없습니다.')
      }
    } catch (err) {
      setError(err.message || '요청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 인증 로딩 중
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm sm:text-base">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-3 sm:p-4 md:p-6" style={{ position: 'relative', zIndex: 1 }}>
      <div className="w-full max-w-2xl" style={{ position: 'relative', zIndex: 1 }}>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-6 sm:mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 px-2">
          내 진짜 미래 확인하기
        </h1>

        {/* 로그인하지 않은 경우: 로그인 버튼만 표시 */}
        {!user ? (
          <div className="mb-6 sm:mb-8">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 md:p-8 shadow-xl border border-slate-700 mb-4 sm:mb-6">
              <p className="text-center text-slate-300 mb-4 sm:mb-6 text-base sm:text-lg px-2">
                로그인 후 미래를 확인하실 수 있습니다
              </p>
              <SocialLoginButtons />
            </div>
          </div>
        ) : (
          <>
            {/* 로그인한 경우: 사용자 정보 및 로그아웃 버튼 */}
            <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 bg-slate-800/50 backdrop-blur-sm rounded-lg p-3 sm:p-4 shadow-xl border border-slate-700">
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                {user.user_metadata?.avatar_url && (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="프로필"
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-slate-400">안녕하세요!</p>
                  <p className="font-semibold text-white text-sm sm:text-base truncate">
                    {user.user_metadata?.full_name || user.user_metadata?.name || user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors duration-200 whitespace-nowrap"
              >
                로그아웃
              </button>
            </div>

            {/* 폼 표시 */}
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 mb-6 sm:mb-8" style={{ overflow: 'visible', position: 'relative', zIndex: 1 }}>
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700" style={{ overflow: 'visible', position: 'relative', zIndex: 50 }}>
            <div className="space-y-3 sm:space-y-4" style={{ overflow: 'visible', position: 'relative', zIndex: 1 }}>
              <div>
                <label htmlFor="birthDate" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 sm:mb-2">
                  생년월일
                </label>
                <input
                  type="date"
                  id="birthDate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
                />
              </div>

              <div>
                <label htmlFor="birthTime" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 sm:mb-2">
                  태어난 시간
                </label>
                <input
                  type="time"
                  id="birthTime"
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
                />
              </div>

              <div style={{ position: 'relative', zIndex: 10002 }}>
                <label htmlFor="cityInput" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 sm:mb-2">
                  태어난 도시
                </label>
                <CityAutocompleteComponent 
                  onCitySelect={handleCitySelect}
                />
                {cityData.name && (
                  <p className="mt-2 text-xs text-slate-400 break-words">
                    선택된 도시: {cityData.name} 
                    {cityData.timezone && ` (${cityData.timezone})`}
                  </p>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 text-sm sm:text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative touch-manipulation"
            style={{ zIndex: 1, position: 'relative' }}
          >
            {loading ? '미래를 계산하는 중...' : '내 진짜 미래 확인하기'}
          </button>
        </form>
          </>
        )}

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}

        {interpretation && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700" style={{ overflow: 'visible', position: 'relative', zIndex: 50 }}>
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              오늘의 운세
            </h2>
            <div className="prose prose-invert max-w-none prose-sm sm:prose-base">
              <p className="text-slate-200 leading-relaxed whitespace-pre-wrap text-sm sm:text-base break-words">
                {interpretation}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
