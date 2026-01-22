import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import FortuneForm from '../components/FortuneForm'
import BottomNavigation from '../components/BottomNavigation'
import UserInfo from '../components/UserInfo'
import FortuneResult from '../components/FortuneResult'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

function LifetimeFortune() {
  const { user, loadingAuth, logout } = useAuth()
  const navigate = useNavigate()
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (formData) => {
    setLoading(true)
    setError('')
    setInterpretation('')

    try {
      const requestBody = {
        ...formData,
        fortuneType: 'lifetime',
        reportType: 'lifetime' // 하위 호환성 유지
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
        <FortuneForm onSubmit={handleSubmit} loading={loading} reportType="lifetime" />
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}
        {interpretation && (
          <FortuneResult title="인생 종합운" interpretation={interpretation} />
        )}
      </div>
      {user && <BottomNavigation activeTab="lifetime" />}
    </div>
  )
}

export default LifetimeFortune
