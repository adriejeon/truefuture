import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import SocialLoginButtons from '../components/SocialLoginButtons'
import PageTitle from '../components/PageTitle'
import BirthInputForm from '../components/BirthInputForm'
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
  const [fromCache, setFromCache] = useState(false)
  const [fortuneDate, setFortuneDate] = useState('')
  const [loadingCache, setLoadingCache] = useState(false)
  const [myData, setMyData] = useState(null)
  
  // 로컬스토리지 확인 로직이 한 번만 실행되도록 보장하는 플래그
  const hasCheckedStorage = useRef(false)

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

  // 한국 시간대 기준 현재 시간 가져오기
  const getKoreaTime = () => {
    const now = new Date()
    // UTC 시간에 9시간(9 * 60 * 60 * 1000 밀리초)을 더함
    const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000))
    return koreaTime
  }

  // 오늘 날짜 (YYYY-MM-DD) 가져오기 - 한국 시간대 기준
  const getTodayDate = () => {
    const koreaTime = getKoreaTime()
    // YYYY-MM-DD 형식으로 변환
    const year = koreaTime.getUTCFullYear()
    const month = String(koreaTime.getUTCMonth() + 1).padStart(2, '0')
    const day = String(koreaTime.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 현재 시간이 00:01 ~ 23:59 사이인지 확인
  const isWithinDailyFortuneTime = () => {
    const koreaTime = getKoreaTime()
    const hour = koreaTime.getUTCHours()
    const minute = koreaTime.getUTCMinutes()
    
    // 00:00 ~ 00:00 사이는 운세 뽑기 불가
    if (hour === 0 && minute < 1) {
      return false
    }
    
    return true // 00:01 ~ 23:59
  }

  // 로컬스토리지에서 오늘의 운세 확인
  const getTodayFortuneFromStorage = () => {
    try {
      const stored = localStorage.getItem('daily_fortune')
      
      if (!stored) {
        return null
      }

      const fortuneData = JSON.parse(stored)
      const todayDate = getTodayDate()

      // 저장된 운세의 날짜가 오늘인지 확인
      if (fortuneData.date === todayDate) {
        return fortuneData
      } else {
        // 다른 날짜의 운세이므로 삭제
        localStorage.removeItem('daily_fortune')
        return null
      }
    } catch (err) {
      console.error('로컬스토리지 읽기 에러:', err)
      return null
    }
  }

  // 로컬스토리지에 오늘의 운세 저장
  const saveTodayFortuneToStorage = (fortuneData) => {
    try {
      const todayDate = getTodayDate()

      const dataToSave = {
        date: todayDate,
        interpretation: fortuneData.interpretation,
        chart: fortuneData.chart,
        transitChart: fortuneData.transitChart,
        aspects: fortuneData.aspects,
        transitMoonHouse: fortuneData.transitMoonHouse,
        createdAt: new Date().toISOString(),
      }

      localStorage.setItem('daily_fortune', JSON.stringify(dataToSave))
      
      console.log('\n' + '='.repeat(60))
      console.log('💾 로컬스토리지 저장 완료')
      console.log('='.repeat(60))
      console.log('저장된 날짜:', todayDate)
      console.log('저장된 해석 길이:', fortuneData.interpretation?.length || 0, '글자')
      console.log('='.repeat(60) + '\n')
    } catch (err) {
      console.error('❌ 로컬스토리지 저장 에러:', err)
    }
  }

  // 페이지 로드 시 로컬스토리지에서 오늘의 운세 확인
  useEffect(() => {
    // 인증 상태가 로딩 중이면 대기 (새로고침 시 세션 복구 중 데이터 삭제 방지)
    if (loadingAuth) {
      return
    }

    // 이미 로컬스토리지 확인을 완료했다면 중복 실행 방지
    if (hasCheckedStorage.current) {
      return
    }

    // 로딩이 완료되었는데도 유저가 없으면 로그아웃 상태로 간주하여 로컬스토리지 초기화
    if (!user) {
      hasCheckedStorage.current = true // 플래그 설정하여 이후 실행 방지
      localStorage.removeItem('daily_fortune')
      setInterpretation('')
      setFromCache(false)
      setFortuneDate('')
      return
    }

    // 로그인된 사용자: 로컬스토리지에서 오늘의 운세 확인 (한 번만 실행)
    hasCheckedStorage.current = true // 플래그 설정하여 중복 실행 방지
    
    console.log('\n🔄 [useEffect 실행] 로컬스토리지 확인 중...')
    
    setLoadingCache(true)
    const storedFortune = getTodayFortuneFromStorage()
    
    if (storedFortune) {
      console.log('✅ 오늘의 운세 발견! (날짜: ' + storedFortune.date + ')')
      setInterpretation(storedFortune.interpretation)
      setFromCache(true)
      setFortuneDate(storedFortune.date)
    } else {
      console.log('💫 오늘의 운세가 아직 없습니다.')
      setInterpretation('')
      setFromCache(false)
      setFortuneDate('')
    }
    
    setLoadingCache(false)
  }, [user, loadingAuth])

  // 사용자 변경 시 플래그 리셋 (로그아웃 후 다른 계정으로 로그인하는 경우 대비)
  useEffect(() => {
    if (!loadingAuth && !user) {
      hasCheckedStorage.current = false
    }
  }, [user, loadingAuth])

  const handleSubmit = async (e) => {
    e.preventDefault()

    // 로그인 체크
    if (!user) {
      setError('로그인이 필요합니다. 먼저 로그인해주세요.')
      return
    }

    // 데이터 변환
    const formData = convertToApiFormat(myData)
    if (!formData) {
      setError('모든 정보를 입력해주세요.')
      return
    }

    // 00:01 ~ 23:59 사이인지 확인
    if (!isWithinDailyFortuneTime()) {
      setError('오늘의 운세는 00시 1분부터 확인하실 수 있습니다.')
      return
    }

    // 이미 오늘의 운세를 뽑았는지 확인 (로컬스토리지)
    const existingFortune = getTodayFortuneFromStorage()
    if (existingFortune) {
      console.log('⚠️ [운세 요청 차단] 이미 오늘의 운세를 확인했습니다.')
      setError('오늘의 운세를 이미 확인하셨습니다. 내일 00시 1분 이후에 새로운 운세를 확인하실 수 있습니다.')
      setInterpretation(existingFortune.interpretation)
      setFromCache(true)
      setFortuneDate(existingFortune.date)
      return
    }

    console.log('🚀 [새 운세 요청] 오늘의 운세 생성 시작')

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

      console.log('📥 Edge Function 응답:', { data, error: functionError })

      if (functionError) {
        console.error('❌ Edge Function 에러:', functionError)
        throw new Error(functionError.message || `서버 오류가 발생했습니다. (${functionError.name || 'Unknown'})`)
      }

      if (!data) {
        console.error('❌ 응답 데이터 없음')
        throw new Error('서버로부터 응답을 받지 못했습니다.')
      }

      if (data.error) {
        console.error('❌ 서버 에러:', data.error)
        throw new Error(data.error || '서버 오류가 발생했습니다.')
      }

      // AI 해석 실패 체크
      if (data.interpretation && typeof data.interpretation === 'object' && data.interpretation.error) {
        console.error('❌ AI 해석 실패:', data.interpretation)
        throw new Error(data.interpretation.message || 'AI 해석 중 오류가 발생했습니다.')
      }

      // 디버깅: 받은 응답 로그
      console.log('\n' + '='.repeat(60))
      console.log('📥 API 응답 받은 데이터')
      console.log('='.repeat(60))
      
      // 1. Natal Chart (출생 차트)
      if (data.chart) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('🌟 [Natal Chart - 출생 차트]')
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
      
      // 2. Transit Chart (현재 하늘)
      if (data.transitChart) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('🌠 [Transit Chart - 현재 하늘]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`현재 시간: ${data.transitChart.date}`)
        
        console.log('\n행성 위치:')
        if (data.transitChart.planets) {
          const planetNames = {
            sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus',
            mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
          }
          Object.entries(data.transitChart.planets).forEach(([name, planet]) => {
            const displayName = planetNames[name] || name
            console.log(`  - ${displayName.toUpperCase().padEnd(8)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(1).padStart(5)}° (House ${planet.house})`)
          })
        }
      }
      
      // 3. Transit Moon House
      if (data.transitMoonHouse !== undefined) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('🌙 [Transit Moon House]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`Transit Moon은 Natal 차트의 ${data.transitMoonHouse}번째 하우스에 위치합니다.`)
      }
      
      // 4. Calculated Aspects (각도 관계)
      if (data.aspects && Array.isArray(data.aspects) && data.aspects.length > 0) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('🔮 [Calculated Aspects - 주요 각도 관계]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        data.aspects.forEach((aspect, index) => {
          console.log(`  ${index + 1}. ${aspect.description}`)
        })
        console.log(`\n총 ${data.aspects.length}개의 Aspect 발견`)
      } else if (data.aspects && Array.isArray(data.aspects) && data.aspects.length === 0) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('🔮 [Calculated Aspects - 주요 각도 관계]')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('  (오늘은 주요 Aspect가 형성되지 않았습니다)')
      }
      
      // 5. 제미나이에게 전달한 프롬프트 (디버깅용)
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
      
      // 6. 제미나이 해석 결과
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✨ [제미나이 해석 결과]')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(data.interpretation)
      console.log('\n' + '='.repeat(60) + '\n')
      
      if (data.interpretation && typeof data.interpretation === 'string') {
        const todayDate = getTodayDate()
        
        // 오늘의 운세를 로컬스토리지에 저장
        saveTodayFortuneToStorage({
          interpretation: data.interpretation,
          chart: data.chart,
          transitChart: data.transitChart,
          aspects: data.aspects,
          transitMoonHouse: data.transitMoonHouse,
        })
        
        // 저장 후 상태 업데이트
        setInterpretation(data.interpretation)
        setFromCache(false) // 새로 뽑은 운세
        setFortuneDate(todayDate)
        
        console.log('✅ [운세 완료] 해석 결과 표시 및 로컬스토리지 저장 완료')
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
            {/* 로딩 중 */}
            {loadingCache && (
              <div className="mb-6 sm:mb-8 text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3"></div>
                <p className="text-slate-400 text-sm">오늘의 운세 확인 중...</p>
              </div>
            )}

            {/* 이미 오늘의 운세를 뽑은 경우 */}
            {!loadingCache && interpretation && fromCache && (
              <div className="mb-6 sm:mb-8">
                <div className="p-4 bg-blue-900/30 border border-blue-600/50 rounded-lg mb-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">✨</div>
                    <div className="flex-1">
                      <p className="text-blue-200 text-sm sm:text-base mb-2">
                        <strong>{fortuneDate}</strong> 오늘의 운세를 이미 확인하셨습니다.
                      </p>
                      <p className="text-blue-300/80 text-xs sm:text-sm">
                        내일 00시 1분 이후에 새로운 운세를 확인하실 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
                <FortuneResult title="오늘의 운세" interpretation={interpretation} />
              </div>
            )}

            {/* 아직 오늘의 운세를 뽑지 않은 경우 */}
            {!loadingCache && !interpretation && (
              <>
                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
                  <BirthInputForm 
                    title="🌅 오늘의 운세"
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
                        <span>미래를 계산하는 중...</span>
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
              </>
            )}

            {/* 새로 운세를 뽑은 경우 (캐시 아님) */}
            {!loadingCache && interpretation && !fromCache && (
              <FortuneResult title="오늘의 운세" interpretation={interpretation} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Home
