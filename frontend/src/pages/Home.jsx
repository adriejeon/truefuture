import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SocialLoginButtons from '../components/SocialLoginButtons'
import PageTitle from '../components/PageTitle'
import FortuneForm from '../components/FortuneForm'
import FortuneResult from '../components/FortuneResult'
import UserInfo from '../components/UserInfo'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import { detectInAppBrowser, redirectToExternalBrowser, getBrowserGuideMessage } from '../utils/inAppBrowserDetector'

function Home() {
  const { user, loadingAuth, logout } = useAuth()
  const [inAppBrowserWarning, setInAppBrowserWarning] = useState(null)
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 인앱 브라우저 감지 및 처리
  useEffect(() => {
    const { isInApp, appName } = detectInAppBrowser()
    
    if (isInApp && appName) {
      console.log(`인앱 브라우저 감지: ${appName}`)
      
      const redirectSuccess = redirectToExternalBrowser(appName, window.location.href)
      
      if (!redirectSuccess) {
        const message = getBrowserGuideMessage(appName)
        setInAppBrowserWarning({ appName, message })
      } else {
        const timer = setTimeout(() => {
          const message = getBrowserGuideMessage(appName)
          setInAppBrowserWarning({ appName, message })
        }, 2000)
        
        return () => clearTimeout(timer)
      }
    }
  }, [])

  const handleSubmit = async (formData) => {
    // 로그인 체크
    if (!user) {
      setError('로그인이 필요합니다. 먼저 로그인해주세요.')
      return
    }

    setLoading(true)
    setError('')
    setInterpretation('')

    try {
      const requestBody = {
        ...formData,
        fortuneType: 'daily',
        reportType: 'daily' // 하위 호환성 유지
      }

      // 디버깅: 전송하는 데이터 로그
      console.log('\n' + '='.repeat(60))
      console.log('📤 API 요청 전송 데이터')
      console.log('='.repeat(60))
      console.log('생년월일시:', formData.birthDate)
      console.log('위치:', `위도 ${formData.lat}, 경도 ${formData.lng}`)
      console.log('전체 요청 본문:', JSON.stringify(requestBody, null, 2))
      console.log('='.repeat(60) + '\n')

      const { data, error: functionError } = await supabase.functions.invoke('get-fortune', {
        body: requestBody
      })

      if (functionError) {
        throw new Error(functionError.message || '서버 오류가 발생했습니다.')
      }

      if (!data || data.error) {
        throw new Error(data?.error || '서버 오류가 발생했습니다.')
      }

      // 디버깅: 받은 응답 로그
      console.log('\n' + '='.repeat(60))
      console.log('📥 API 응답 받은 데이터')
      console.log('='.repeat(60))
      
      if (data.chart) {
        console.log('계산된 차트 데이터:')
        console.log('  행성 7개 위치:')
        if (data.chart.planets) {
          const planetNames = {
            sun: '태양(Sun)', moon: '달(Moon)', mercury: '수성(Mercury)', venus: '금성(Venus)',
            mars: '화성(Mars)', jupiter: '목성(Jupiter)', saturn: '토성(Saturn)',
          }
          Object.entries(data.chart.planets).forEach(([name, planet]) => {
            const displayName = planetNames[name] || name
            console.log(`    ${displayName.padEnd(20)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(2).padStart(6)}도 (하우스 ${planet.house})`)
          })
        }
        console.log('  포르투나(Fortune):')
        if (data.chart.fortuna) {
          console.log(`    별자리: ${data.chart.fortuna.sign}`)
          console.log(`    별자리 내 각도: ${data.chart.fortuna.degreeInSign.toFixed(2)}도`)
          console.log(`    전체 경도: ${data.chart.fortuna.degree.toFixed(2)}도`)
          console.log(`    하우스: ${data.chart.fortuna.house}`)
        }
        console.log('  상승점(Ascendant):')
        if (data.chart.houses?.angles?.ascendant !== undefined) {
          const asc = data.chart.houses.angles.ascendant
          const ascSignIndex = Math.floor(asc / 30)
          const ascDegreeInSign = asc % 30
          const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
          console.log(`    별자리: ${signs[ascSignIndex]}`)
          console.log(`    별자리 내 각도: ${ascDegreeInSign.toFixed(2)}도`)
          console.log(`    전체 경도: ${asc.toFixed(2)}도`)
        }
      }
      
      console.log('제미나이 Markdown 해석 결과:')
      console.log(data.interpretation)
      console.log('='.repeat(60) + '\n')
      
      if (data.interpretation && typeof data.interpretation === 'string') {
        setInterpretation(data.interpretation)
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
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm sm:text-base">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full py-8 sm:py-12" style={{ position: 'relative', zIndex: 1 }}>
      <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 md:px-6 pb-20 sm:pb-24" style={{ position: 'relative', zIndex: 1 }}>
        {/* 인앱 브라우저 안내 메시지 */}
        {inAppBrowserWarning && (
          <div className="mb-4 sm:mb-6 p-4 sm:p-5 bg-yellow-900/50 border-2 border-yellow-600 rounded-lg shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm sm:text-base font-semibold text-yellow-200 mb-2">
                  {inAppBrowserWarning.appName} 인앱 브라우저 감지
                </h3>
                <p className="text-xs sm:text-sm text-yellow-100 leading-relaxed mb-3">
                  {inAppBrowserWarning.message}
                </p>
                <button
                  onClick={() => setInAppBrowserWarning(null)}
                  className="text-xs sm:text-sm text-yellow-300 hover:text-yellow-200 underline"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        <PageTitle />

        {/* 로그인하지 않은 경우: 로그인 버튼만 표시 */}
        {!user ? (
          <div className="mb-6 sm:mb-8">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 md:p-8 shadow-xl border border-slate-700 mb-4 sm:mb-6">
              <p className="text-center text-slate-300 mb-4 sm:mb-6 text-base sm:text-lg px-2">
                로그인 후 생년월일시간을 입력하고 운세를 확인하실 수 있습니다
              </p>
              <SocialLoginButtons />
            </div>
          </div>
        ) : (
          <>
            <UserInfo user={user} onLogout={logout} />
            
            <div className="mb-6 sm:mb-8">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 md:p-8 shadow-xl border border-slate-700 mb-4 sm:mb-6">
                <p className="text-center text-slate-300 mb-4 sm:mb-6 text-base sm:text-lg px-2">
                  아래 메뉴에서 원하는 운세를 선택해주세요
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Link
                    to="/lifetime"
                    className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 text-center transition-colors"
                  >
                    <div className="text-2xl mb-2">✨</div>
                    <div className="font-semibold">인생 종합운</div>
                  </Link>
                  <Link
                    to="/compatibility"
                    className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 text-center transition-colors"
                  >
                    <div className="text-2xl mb-2">💕</div>
                    <div className="font-semibold">궁합</div>
                  </Link>
                  <Link
                    to="/yearly"
                    className="bg-slate-700 hover:bg-slate-600 rounded-lg p-4 text-center transition-colors"
                  >
                    <div className="text-2xl mb-2">⭐</div>
                    <div className="font-semibold">1년 운세</div>
                  </Link>
                </div>
              </div>
            </div>

            {/* 오늘의 운세 */}
            <div className="mb-6 sm:mb-8">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 md:p-8 shadow-xl border border-slate-700">
                <h2 className="text-xl sm:text-2xl font-bold text-center mb-4 sm:mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                  오늘의 운세 확인하기
                </h2>
                <FortuneForm onSubmit={handleSubmit} loading={loading} reportType="daily" />
                {error && (
                  <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
                    {error}
                  </div>
                )}
                {interpretation && (
                  <FortuneResult title="오늘의 운세" interpretation={interpretation} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Home
