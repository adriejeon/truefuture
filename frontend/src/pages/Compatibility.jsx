import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import BirthInputForm from '../components/BirthInputForm'
import BottomNavigation from '../components/BottomNavigation'
import UserInfo from '../components/UserInfo'
import FortuneResult from '../components/FortuneResult'
import SocialLoginButtons from '../components/SocialLoginButtons'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import { loadSharedFortune, formatBirthDate } from '../utils/sharedFortune'

function Compatibility() {
  const { user, loadingAuth, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [interpretation, setInterpretation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // 두 사람의 데이터를 각각 관리
  const [myData, setMyData] = useState(null)
  const [partnerData, setPartnerData] = useState(null)
  const [shareId, setShareId] = useState(null)
  const [isSharedFortune, setIsSharedFortune] = useState(false)
  const [sharedUserInfo, setSharedUserInfo] = useState(null)

  // 나의 정보 변경 핸들러
  const handleMyDataChange = useCallback((data) => {
    setMyData(data)
  }, [])

  // 상대방 정보 변경 핸들러
  const handlePartnerDataChange = useCallback((data) => {
    setPartnerData(data)
  }, [])

  // URL에 공유 ID가 있는 경우 운세 조회
  useEffect(() => {
    const sharedId = searchParams.get('id')
    
    if (sharedId) {
      console.log('🔗 공유된 궁합 ID 발견:', sharedId)
      loadShared(sharedId)
    }
  }, [searchParams])

  // 공유된 운세 조회 함수
  const loadShared = async (id) => {
    setLoading(true)
    setError('')
    
    try {
      const data = await loadSharedFortune(id)
      
      console.log('✅ 공유된 궁합 조회 성공:', data)
      
      setInterpretation(data.interpretation)
      setIsSharedFortune(true)
      setShareId(id)
      setSharedUserInfo(data.userInfo)
    } catch (err) {
      console.error('❌ 공유된 궁합 조회 실패:', err)
      setError(err.message || '운세를 불러오는 중 오류가 발생했습니다.')
      setSearchParams({})
    } finally {
      setLoading(false)
    }
  }

  // 로그인 필요 액션 처리
  const handleRequireLogin = () => {
    alert('로그인이 필요합니다.')
    navigate('/')
  }

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
    
    // 공유 링크로 들어온 경우 로그인 필요
    if (isSharedFortune && !user) {
      handleRequireLogin()
      return
    }
    
    // 두 사람의 데이터가 모두 입력되었는지 확인
    const user1 = convertToApiFormat(myData)
    const user2 = convertToApiFormat(partnerData)

    if (!user1) {
      setError('나의 정보를 모두 입력해주세요.')
      return
    }

    if (!user2) {
      setError('상대방 정보를 모두 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')
    setInterpretation('')
    setShareId(null)

    try {
      const requestBody = {
        fortuneType: 'compatibility',
        reportType: 'compatibility',
        user1,
        user2
      }

      // 디버깅: 전송하는 데이터 로그
      console.log('\n' + '='.repeat(60))
      console.log('📤 API 요청 전송 데이터 (궁합)')
      console.log('='.repeat(60))
      console.log('사용자1 (나):', `생년월일시 ${user1.birthDate}, 위치 위도 ${user1.lat}, 경도 ${user1.lng}`)
      console.log('사용자2 (상대방):', `생년월일시 ${user2.birthDate}, 위치 위도 ${user2.lat}, 경도 ${user2.lng}`)
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
      
      // share_id 저장
      console.log('🔍 [Compatibility] API 응답 전체:', data)
      console.log('🔍 [Compatibility] API 응답 data.share_id:', data.share_id, '타입:', typeof data.share_id)
      if (data.share_id && data.share_id !== 'undefined' && data.share_id !== null && data.share_id !== 'null') {
        console.log('🔗 Share ID 저장:', data.share_id)
        setShareId(data.share_id)
      } else {
        console.warn('⚠️ [Compatibility] share_id가 응답에 없거나 유효하지 않습니다.')
        console.warn('  - data.share_id 값:', data.share_id)
        console.warn('  - data.share_id 타입:', typeof data.share_id)
        console.warn('  - 전체 응답:', JSON.stringify(data, null, 2))
        setShareId(null) // 명시적으로 null 설정
      }
      
      // 1. 사용자1 Natal Chart (출생 차트)
      if (data.chart) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('🌟 [사용자1 Natal Chart - 출생 차트]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`출생 시간: ${data.chart.date}`)
        console.log(`출생 위치: 위도 ${data.chart.location?.lat}, 경도 ${data.chart.location?.lng}`)
        
        // 상승점
        if (data.chart.houses?.angles?.ascendant !== undefined) {
          const asc = data.chart.houses.angles.ascendant
          const ascSignIndex = Math.floor(asc / 30)
          const ascDegreeInSign = asc % 30
          const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
          console.log(`\n상승점(Ascendant): ${signs[ascSignIndex]} ${ascDegreeInSign.toFixed(1)}°`)
        }
        
        // 행성 위치
        console.log('\n행성 위치:')
        if (data.chart.planets) {
          const planetNames = {
            sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus',
            mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
          }
          Object.entries(data.chart.planets).forEach(([name, planet]) => {
            const displayName = planetNames[name] || name
            console.log(`  - ${displayName.toUpperCase().padEnd(8)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(1).padStart(5)}° (House ${planet.house})`)
          })
        }
        
        // 포르투나
        if (data.chart.fortuna) {
          console.log(`\nPart of Fortune: ${data.chart.fortuna.sign} ${data.chart.fortuna.degreeInSign.toFixed(1)}° (House ${data.chart.fortuna.house})`)
        }
      }
      
      // 2. 사용자2 Natal Chart (출생 차트)
      if (data.chart2) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('🌟 [사용자2 Natal Chart - 출생 차트]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`출생 시간: ${data.chart2.date}`)
        console.log(`출생 위치: 위도 ${data.chart2.location?.lat}, 경도 ${data.chart2.location?.lng}`)
        
        // 상승점
        if (data.chart2.houses?.angles?.ascendant !== undefined) {
          const asc = data.chart2.houses.angles.ascendant
          const ascSignIndex = Math.floor(asc / 30)
          const ascDegreeInSign = asc % 30
          const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
          console.log(`\n상승점(Ascendant): ${signs[ascSignIndex]} ${ascDegreeInSign.toFixed(1)}°`)
        }
        
        // 행성 위치
        console.log('\n행성 위치:')
        if (data.chart2.planets) {
          const planetNames = {
            sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus',
            mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
          }
          Object.entries(data.chart2.planets).forEach(([name, planet]) => {
            const displayName = planetNames[name] || name
            console.log(`  - ${displayName.toUpperCase().padEnd(8)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(1).padStart(5)}° (House ${planet.house})`)
          })
        }
        
        // 포르투나
        if (data.chart2.fortuna) {
          console.log(`\nPart of Fortune: ${data.chart2.fortuna.sign} ${data.chart2.fortuna.degreeInSign.toFixed(1)}° (House ${data.chart2.fortuna.house})`)
        }
      }
      
      // 3. 제미나이에게 전달한 프롬프트 (디버깅용)
      if (data.userPrompt) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('📝 [제미나이에게 전달한 User Prompt]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(data.userPrompt)
      }
      
      if (data.systemInstruction) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('📋 [제미나이에게 전달한 System Instruction]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(data.systemInstruction)
      }
      
      // 4. 제미나이 해석 결과
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✨ [제미나이 해석 결과]')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(data.interpretation)
      console.log('\n' + '='.repeat(60) + '\n')
      
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

  // 공유 링크 확인 (URL에 id 파라미터가 있는지)
  const sharedId = searchParams.get('id')

  if (!user) {
    // 공유 링크로 들어온 경우 (id 파라미터가 있음)
    if (sharedId) {
      // 로딩 중이거나 결과가 있는 경우 표시
      if (loading) {
        return (
          <div className="w-full flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <p className="text-slate-400 text-sm sm:text-base">공유된 운세를 불러오는 중...</p>
            </div>
          </div>
        )
      }
      
      if (isSharedFortune && interpretation) {
        return (
          <div className="w-full py-8 sm:py-12" style={{ position: 'relative', zIndex: 1 }}>
            <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 md:px-6 pb-20 sm:pb-24" style={{ position: 'relative', zIndex: 1 }}>
              <PageTitle />
              
              {/* 공유된 운세 정보 표시 */}
              <div className="mb-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
                <div className="flex items-start gap-3 mb-4">
                  <div className="text-2xl">🔮</div>
                  <div className="flex-1">
                    <p className="text-purple-200 text-sm sm:text-base mb-2">
                      친구가 공유한 <strong>궁합</strong>입니다.
                    </p>
                    {sharedUserInfo && sharedUserInfo.user1 && sharedUserInfo.user2 && (
                      <div className="text-xs sm:text-sm text-slate-300 space-y-3 mt-3">
                        <div className="bg-blue-900/30 px-4 sm:px-6 py-3 rounded">
                          <p className="text-blue-300 font-semibold mb-2">💙 첫 번째 사람</p>
                          <p>📅 {formatBirthDate(sharedUserInfo.user1.birthDate)}</p>
                        </div>
                        <div className="bg-pink-900/30 px-4 sm:px-6 py-3 rounded">
                          <p className="text-pink-300 font-semibold mb-2">💗 두 번째 사람</p>
                          <p>📅 {formatBirthDate(sharedUserInfo.user2.birthDate)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 운세 결과 */}
              <FortuneResult 
                title="궁합" 
                interpretation={interpretation} 
                shareId={shareId}
                isShared={true}
              />
              
              {/* 로그인 유도 */}
              <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
                <p className="text-center text-slate-300 mb-4 text-sm sm:text-base">
                  나도 내 궁합을 확인하고 싶다면?
                </p>
                <SocialLoginButtons />
              </div>
            </div>
          </div>
        )
      }
    }
    
    // 공유 링크가 아니거나 로딩 실패한 경우에만 홈으로 리다이렉트
    if (!sharedId && !loadingAuth) {
      navigate('/')
      return null
    }
    
    return null
  }

  return (
    <div className="w-full py-8 sm:py-12" style={{ position: 'relative', zIndex: 1 }}>
      <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 md:px-6 pb-20 sm:pb-24" style={{ position: 'relative', zIndex: 1 }}>
        <PageTitle />
        <UserInfo user={user} onLogout={logout} />
        
        {/* 궁합 폼 컨테이너 */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
          {/* 나의 정보 */}
          <BirthInputForm 
            title="💙 나의 정보"
            storageKey="birth_info_me"
            onDataChange={handleMyDataChange}
          />

          {/* VS 구분선 */}
          <div className="flex items-center justify-center py-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
            <div className="px-4 sm:px-6">
              <span className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                VS
              </span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
          </div>

          {/* 상대방 정보 */}
          <BirthInputForm 
            title="💗 상대방 정보"
            storageKey="birth_info_partner"
            onDataChange={handlePartnerDataChange}
          />

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 text-sm sm:text-base bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative touch-manipulation flex items-center justify-center gap-2 sm:gap-3"
            style={{ zIndex: 1, position: 'relative' }}
          >
            {loading ? (
              <>
                {/* 로딩 스피너 */}
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
                <span>궁합을 분석하는 중...</span>
              </>
            ) : (
              <span>💕 궁합 확인하기</span>
            )}
          </button>
        </form>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}
        {interpretation && (
          <FortuneResult 
            title="궁합" 
            interpretation={interpretation} 
            shareId={shareId}
          />
        )}
      </div>
      {user && <BottomNavigation activeTab="compatibility" />}
    </div>
  )
}

export default Compatibility
