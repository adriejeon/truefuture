import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import FortuneForm from '../components/FortuneForm'
import BottomNavigation from '../components/BottomNavigation'
import UserInfo from '../components/UserInfo'
import FortuneResult from '../components/FortuneResult'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

function Compatibility() {
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
      // 궁합은 2명의 데이터가 필요하지만, 현재는 1명만 입력받고 있음
      // TODO: 궁합 폼을 2명 입력으로 수정 필요
      const requestBody = {
        fortuneType: 'compatibility',
        reportType: 'compatibility', // 하위 호환성 유지
        // 임시로 같은 데이터를 user1, user2로 전달 (나중에 수정 필요)
        user1: {
          birthDate: formData.birthDate,
          lat: formData.lat,
          lng: formData.lng
        },
        user2: {
          birthDate: formData.birthDate,
          lat: formData.lat,
          lng: formData.lng
        }
      }

      // 디버깅: 전송하는 데이터 로그
      console.log('\n' + '='.repeat(60))
      console.log('📤 API 요청 전송 데이터 (궁합)')
      console.log('='.repeat(60))
      console.log('사용자1:', `생년월일시 ${formData.birthDate}, 위치 위도 ${formData.lat}, 경도 ${formData.lng}`)
      console.log('사용자2:', `생년월일시 ${formData.birthDate}, 위치 위도 ${formData.lat}, 경도 ${formData.lng}`)
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
      console.log('📥 API 응답 받은 데이터 (궁합)')
      console.log('='.repeat(60))
      
      if (data.chart) {
        console.log('사용자1 계산된 차트 데이터:')
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
        if (data.chart.fortuna) {
          console.log(`  포르투나: ${data.chart.fortuna.sign} ${data.chart.fortuna.degreeInSign.toFixed(2)}도 (하우스 ${data.chart.fortuna.house})`)
        }
        if (data.chart.houses?.angles?.ascendant !== undefined) {
          const asc = data.chart.houses.angles.ascendant
          const ascSignIndex = Math.floor(asc / 30)
          const ascDegreeInSign = asc % 30
          const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
          console.log(`  상승점: ${signs[ascSignIndex]} ${ascDegreeInSign.toFixed(2)}도`)
        }
      }
      
      if (data.chart2) {
        console.log('사용자2 계산된 차트 데이터:')
        console.log('  행성 7개 위치:')
        if (data.chart2.planets) {
          const planetNames = {
            sun: '태양(Sun)', moon: '달(Moon)', mercury: '수성(Mercury)', venus: '금성(Venus)',
            mars: '화성(Mars)', jupiter: '목성(Jupiter)', saturn: '토성(Saturn)',
          }
          Object.entries(data.chart2.planets).forEach(([name, planet]) => {
            const displayName = planetNames[name] || name
            console.log(`    ${displayName.padEnd(20)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(2).padStart(6)}도 (하우스 ${planet.house})`)
          })
        }
        if (data.chart2.fortuna) {
          console.log(`  포르투나: ${data.chart2.fortuna.sign} ${data.chart2.fortuna.degreeInSign.toFixed(2)}도 (하우스 ${data.chart2.fortuna.house})`)
        }
        if (data.chart2.houses?.angles?.ascendant !== undefined) {
          const asc = data.chart2.houses.angles.ascendant
          const ascSignIndex = Math.floor(asc / 30)
          const ascDegreeInSign = asc % 30
          const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
          console.log(`  상승점: ${signs[ascSignIndex]} ${ascDegreeInSign.toFixed(2)}도`)
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
        <FortuneForm onSubmit={handleSubmit} loading={loading} reportType="compatibility" />
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}
        {interpretation && (
          <FortuneResult title="궁합" interpretation={interpretation} />
        )}
      </div>
      {user && <BottomNavigation activeTab="compatibility" />}
    </div>
  )
}

export default Compatibility
