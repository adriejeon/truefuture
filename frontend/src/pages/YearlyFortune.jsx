import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import BirthInputForm from '../components/BirthInputForm'
import BottomNavigation from '../components/BottomNavigation'
import UserInfo from '../components/UserInfo'
import FortuneResult from '../components/FortuneResult'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

function YearlyFortune() {
  const { user, loadingAuth, logout } = useAuth()
  const navigate = useNavigate()
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [myData, setMyData] = useState(null)

  // 나의 정보 변경 핸들러
  const handleMyDataChange = useCallback((data) => {
    setMyData(data)
  }, [])

  // 데이터를 API 형식으로 변환하는 함수
  const convertToApiFormat = (data) => {
    if (!data || !data.birthDate || !data.birthTime || !data.cityData?.lat || !data.cityData?.lng) {
      return null
    }

    // YYYY.MM.DD HH:mm 형식을 ISO 형식으로 변환
    const dateStr = data.birthDate.replace(/\./g, '-')
    const birthDateTime = `${dateStr}T${data.birthTime}:00`

    return {
      birthDate: birthDateTime,
      lat: data.cityData.lat,
      lng: data.cityData.lng
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const formData = convertToApiFormat(myData)

    if (!formData) {
      setError('모든 정보를 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')
    setInterpretation('')

    try {
      const requestBody = {
        ...formData,
        fortuneType: 'yearly',
        reportType: 'yearly' // 하위 호환성 유지
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

  if (!user) {
    navigate('/')
    return null
  }

  return (
    <div className="w-full py-8 sm:py-12" style={{ position: 'relative', zIndex: 1 }}>
      <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 md:px-6 pb-20 sm:pb-24" style={{ position: 'relative', zIndex: 1 }}>
        <PageTitle />
        <UserInfo user={user} onLogout={logout} />
        
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
          <BirthInputForm 
            title="⭐ 1년 운세"
            storageKey="birth_info_me"
            onDataChange={handleMyDataChange}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 text-sm sm:text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative touch-manipulation flex items-center justify-center gap-2 sm:gap-3"
            style={{ zIndex: 1, position: 'relative' }}
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>1년을 분석하는 중...</span>
              </>
            ) : (
              <span>진짜미래 확인하기</span>
            )}
          </button>
        </form>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}
        {interpretation && (
          <FortuneResult title="1년 운세" interpretation={interpretation} />
        )}
      </div>
      {user && <BottomNavigation activeTab="yearly" />}
    </div>
  )
}

export default YearlyFortune
