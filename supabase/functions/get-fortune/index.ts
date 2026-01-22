// Supabase Edge Function for True Future - 점성술 서비스
// Gemini API 호출을 서버 사이드에서 처리하여 CORS 및 지역 차단 문제 해결

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// astronomy-engine npm 패키지 import (Deno는 npm: 프로토콜 지원)
import { MakeTime, Body, GeoVector, Ecliptic, SiderealTime } from "npm:astronomy-engine@2.1.19"

// 타입 및 프롬프트 import
import { FortuneType, UserData, CompatibilityData } from './types.ts'
import { getSystemInstruction } from './geminiPrompts.ts'

// ========== CORS 헤더 설정 ==========
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ========== 점성술 계산 관련 상수 ==========
const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

const PLANETS = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
}

// ========== 점성술 계산 유틸리티 함수 ==========
function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function getSignFromLongitude(longitude: number): { sign: string; degreeInSign: number } {
  const normalized = normalizeDegrees(longitude)
  const signIndex = Math.floor(normalized / 30)
  const degreeInSign = normalized % 30

  return {
    sign: SIGNS[signIndex],
    degreeInSign: degreeInSign,
  }
}

function getWholeSignHouse(longitude: number, ascendantLon: number): number {
  const normalized = normalizeDegrees(longitude)
  const ascNormalized = normalizeDegrees(ascendantLon)
  
  const ascSignIndex = Math.floor(ascNormalized / 30)
  const planetSignIndex = Math.floor(normalized / 30)
  
  let house = planetSignIndex - ascSignIndex + 1
  
  if (house < 1) house += 12
  if (house > 12) house -= 12
  
  return house
}

function calculateAscendant(date: Date, lat: number, lng: number, time: any): number {
  // 정확한 상승점 계산
  // 1. 그리니치 항성시(GMST) 계산 - astronomy-engine 사용
  const gmst = SiderealTime(time) // 시간 단위로 반환
  
  // 2. 지방 항성시(LST) = GMST + (경도 / 15)
  const lst = gmst + (lng / 15)
  
  // 3. RAMC (Right Ascension of MC) - 도 단위로 변환
  const ramc = normalizeDegrees(lst * 15)
  
  // 4. 황도경사각 (obliquity of the ecliptic) - J2000 기준 약 23.44도
  const obliquity = 23.4392911
  const obliquityRad = obliquity * (Math.PI / 180)
  const latRad = lat * (Math.PI / 180)
  const ramcRad = ramc * (Math.PI / 180)
  
  // 5. 상승점 계산 공식
  // tan(ASC) = cos(RAMC) / (-sin(RAMC) * cos(obliquity) - tan(lat) * sin(obliquity))
  const numerator = Math.cos(ramcRad)
  const denominator = -(Math.sin(ramcRad) * Math.cos(obliquityRad)) - (Math.tan(latRad) * Math.sin(obliquityRad))
  
  let ascendantRad = Math.atan2(numerator, denominator)
  let ascendant = ascendantRad * (180 / Math.PI)
  
  // RAMC가 180-360도 범위일 때 180도 보정 필요
  if (ramc >= 180) {
    ascendant += 180
  }
  
  return normalizeDegrees(ascendant)
}

function calculateFortuna(ascendant: number, moonLon: number, sunLon: number): number {
  let fortuna = ascendant + moonLon - sunLon
  return normalizeDegrees(fortuna)
}

function getPlanetLongitude(body: any, time: any): number {
  try {
    const vector = GeoVector(body, time, true)
    const ecliptic = Ecliptic(vector)
    // 중요: Ecliptic().elon은 이미 도(degrees) 단위입니다!
    // 라디안 변환 (180/π)을 하면 안 됩니다.
    const longitude = ecliptic.elon
    
    return normalizeDegrees(longitude)
  } catch (error: any) {
    console.error(`Error calculating planet longitude for ${body}:`, error)
    throw new Error(`Failed to calculate planet longitude: ${error.message}`)
  }
}

// ========== 점성술 차트 계산 ==========
async function calculateChart(date: Date, lat: number, lng: number): Promise<any> {
  try {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date provided.')
    }

    if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error('Invalid latitude.')
    }

    if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
      throw new Error('Invalid longitude.')
    }

    // 디버깅: 입력 데이터 확인
    console.log('\n' + '='.repeat(60))
    console.log('🔍 calculateChart 함수 시작')
    console.log('='.repeat(60))
    console.log(`입력 날짜 (Date 객체): ${date.toISOString()}`)
    console.log(`입력 날짜 (UTC): ${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`)
    console.log(`위도: ${lat}, 경도: ${lng}`)
    console.log('='.repeat(60) + '\n')

    const time = MakeTime(date)
    
    // 디버깅: MakeTime 결과 확인
    console.log('MakeTime 생성 완료:', time)
    
    const ascendant = calculateAscendant(date, lat, lng, time)
    const ascendantSignInfo = getSignFromLongitude(ascendant)

    const planetsData: any = {}

    // 디버깅: 각 행성 계산 과정 로그
    console.log('\n' + '='.repeat(60))
    console.log('🌟 행성 위치 계산 시작')
    console.log('='.repeat(60))

    for (const [planetName, body] of Object.entries(PLANETS)) {
      try {
        const longitude = getPlanetLongitude(body, time)
        const signInfo = getSignFromLongitude(longitude)
        const house = getWholeSignHouse(longitude, ascendant)

        // 디버깅: 각 행성 계산 결과
        console.log(`${planetName.padEnd(10)}: 경도 ${longitude.toFixed(4)}도 → ${signInfo.sign} ${signInfo.degreeInSign.toFixed(2)}도 (하우스 ${house})`)

        planetsData[planetName] = {
          sign: signInfo.sign,
          degree: longitude,
          degreeInSign: signInfo.degreeInSign,
          house: house,
        }
      } catch (planetError: any) {
        console.error(`❌ ${planetName} 계산 실패:`, planetError)
        throw new Error(`Failed to calculate ${planetName} position: ${planetError.message}`)
      }
    }
    
    console.log('='.repeat(60) + '\n')

    const moonLon = planetsData.moon.degree
    const sunLon = planetsData.sun.degree
    
    // 검증: 태양 위치가 합리적인 범위인지 확인
    const sunSignInfo = planetsData.sun
    const month = date.getUTCMonth() + 1 // 1-12
    const day = date.getUTCDate()
    
    // 10월 23일생의 태양은 Libra 말기 (210-240도) 또는 Scorpio 초기 (210-240도)여야 함
    if (month === 10 && day >= 23) {
      // 10월 23일 이후: 태양은 Scorpio (210-240도) 또는 Libra 말기 (180-210도)
      if (sunSignInfo.sign === 'Leo' || (sunLon >= 120 && sunLon < 180)) {
        console.error(`⚠️ 경고: 10월 ${day}일생인데 태양이 ${sunSignInfo.sign} ${sunSignInfo.degreeInSign.toFixed(2)}도로 계산됨. 예상: Scorpio 초기 또는 Libra 말기`)
      }
    }
    
    // 검증: 계산된 값이 0도 이상 360도 미만인지 확인
    if (sunLon < 0 || sunLon >= 360) {
      throw new Error(`Invalid sun longitude calculated: ${sunLon}`)
    }
    if (moonLon < 0 || moonLon >= 360) {
      throw new Error(`Invalid moon longitude calculated: ${moonLon}`)
    }
    
    const fortunaLon = calculateFortuna(ascendant, moonLon, sunLon)
    const fortunaSignInfo = getSignFromLongitude(fortunaLon)
    const fortunaHouse = getWholeSignHouse(fortunaLon, ascendant)

    const midheaven = normalizeDegrees(ascendant + 90)

    const result = {
      date: date.toISOString(),
      location: { lat, lng },
      houses: {
        system: 'Whole Sign',
        angles: {
          ascendant: ascendant,
          midheaven: midheaven,
        },
      },
      planets: planetsData,
      fortuna: {
        sign: fortunaSignInfo.sign,
        degree: fortunaLon,
        degreeInSign: fortunaSignInfo.degreeInSign,
        house: fortunaHouse,
      },
    }

    // 최종 검증 로그
    console.log('\n' + '='.repeat(60))
    console.log('✅ 차트 계산 완료')
    console.log('='.repeat(60))
    console.log(`태양: ${sunSignInfo.sign} ${sunSignInfo.degreeInSign.toFixed(2)}도 (전체 경도: ${sunLon.toFixed(4)}도)`)
    console.log(`달: ${planetsData.moon.sign} ${planetsData.moon.degreeInSign.toFixed(2)}도 (전체 경도: ${moonLon.toFixed(4)}도)`)
    console.log('='.repeat(60) + '\n')

    return result
  } catch (error: any) {
    // 에러 발생 시 fallback 데이터를 반환하지 않고 에러를 그대로 throw
    console.error('❌ 차트 계산 중 에러 발생:', error)
    console.error('에러 스택:', error.stack)
    throw new Error(`Chart calculation failed: ${error.message || 'Unknown error occurred during chart calculation.'}`)
  }
}

// ========== AI 해석 관련 함수 ==========
const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

function compressChartData(chartData: any): string {
  const parts = []
  
  const planetMap: any = {
    sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus',
    mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
  }
  
  if (chartData.planets) {
    const planetPositions = Object.entries(chartData.planets)
      .filter(([key]) => planetMap[key])
      .map(([key, p]: [string, any]) => {
        const name = planetMap[key]
        const deg = Math.round(p.degreeInSign || 0)
        return `${name}:${p.sign}(${deg}deg)`
      })
    if (planetPositions.length > 0) {
      parts.push(planetPositions.join(','))
    }
  }
  
  if (chartData.houses?.angles?.ascendant !== undefined) {
    const asc = chartData.houses.angles.ascendant
    const ascSign = getSignFromLongitude(asc)
    const ascDeg = Math.round(ascSign.degreeInSign || 0)
    parts.push(`Asc:${ascSign.sign}(${ascDeg}deg)`)
  }
  
  if (chartData.fortuna) {
    const fortDeg = Math.round(chartData.fortuna.degreeInSign || 0)
    parts.push(`Fort:${chartData.fortuna.sign}(${fortDeg}deg)`)
  }
  
  return parts.join(' ')
}

function getReportTypeDescription(fortuneType: FortuneType): string {
  const descriptions: Record<FortuneType, string> = {
    [FortuneType.DAILY]: '일일 운세',
    [FortuneType.LIFETIME]: '인생 종합운(사주)',
    [FortuneType.COMPATIBILITY]: '궁합 분석',
    [FortuneType.YEARLY]: '1년 운세',
  }

  return descriptions[fortuneType] || '일반 운세'
}

function buildUserPrompt(chartData: any, fortuneType: FortuneType, compatibilityChartData?: any): string {
  const reportTypeDesc = getReportTypeDescription(fortuneType)
  const compressedData = compressChartData(chartData)
  
  let prompt = `${reportTypeDesc} 분석:\n\n${compressedData}`
  
  // 궁합의 경우 두 번째 차트 데이터 추가
  if (fortuneType === FortuneType.COMPATIBILITY && compatibilityChartData) {
    const compressedData2 = compressChartData(compatibilityChartData)
    prompt += `\n\n두 번째 사람:\n${compressedData2}`
  }
  
  // 디버깅: 제미나이에 전달되는 내용 로그
  console.log('\n' + '='.repeat(60))
  console.log('📤 제미나이에 전달되는 내용')
  console.log('='.repeat(60))
  console.log('압축된 차트 데이터:')
  console.log(`  ${compressedData}`)
  if (fortuneType === FortuneType.COMPATIBILITY && compatibilityChartData) {
    const compressedData2 = compressChartData(compatibilityChartData)
    console.log('두 번째 사람 압축된 차트 데이터:')
    console.log(`  ${compressedData2}`)
  }
  console.log()
  console.log('전체 프롬프트:')
  console.log(prompt)
  console.log('='.repeat(60) + '\n')
  
  return prompt
}

async function callGeminiAPI(modelName: string, apiKey: string, requestBody: any): Promise<any> {
  const endpoint = `${GEMINI_API_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Gemini API request failed: ${response.status} ${response.statusText}. ${errorText}`
    )
  }

  const apiResponse = await response.json()

  if (apiResponse.error) {
    throw new Error(
      `Gemini API error: ${apiResponse.error.message || JSON.stringify(apiResponse.error)}`
    )
  }

  return apiResponse
}

function parseGeminiResponse(apiResponse: any): string {
  if (!apiResponse || !apiResponse.candidates || !Array.isArray(apiResponse.candidates)) {
    throw new Error('Invalid API response: missing candidates array.')
  }

  if (apiResponse.candidates.length === 0) {
    throw new Error('Invalid API response: no candidates returned.')
  }

  const candidate = apiResponse.candidates[0]
  
  if (candidate.finishReason && candidate.finishReason === 'MAX_TOKENS') {
    console.warn('Warning: Response was truncated due to MAX_TOKENS limit.')
  } else if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`API response finished with reason: ${candidate.finishReason}`)
  }

  const content = candidate.content
  if (!content || !content.parts || !Array.isArray(content.parts) || content.parts.length === 0) {
    throw new Error('Invalid API response: missing content parts.')
  }

  const text = content.parts[0].text
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid API response: missing or invalid text content.')
  }

  // Markdown 텍스트를 그대로 반환 (코드 블록 제거)
  let markdownText = text.trim()
  
  // 혹시 코드 블록으로 감싸져 있다면 제거
  markdownText = markdownText.replace(/^```(?:markdown)?\s*\n?/i, '')
  markdownText = markdownText.replace(/\n?```\s*$/i, '')
  markdownText = markdownText.trim()

  return markdownText
}

async function getInterpretation(
  chartData: any, 
  fortuneType: FortuneType, 
  apiKey: string,
  compatibilityChartData?: any
): Promise<any> {
  try {
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY environment variable.')
    }

    // FortuneType에 따라 적절한 System Instruction 가져오기
    const systemInstructionText = getSystemInstruction(fortuneType)
    
    const systemInstruction = {
      parts: [
        {
          text: systemInstructionText,
        },
      ],
    }

    const userPrompt = buildUserPrompt(chartData, fortuneType, compatibilityChartData)

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: userPrompt,
            },
          ],
        },
      ],
      systemInstruction: systemInstruction,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    }

    const apiResponse = await callGeminiAPI(GEMINI_MODEL, apiKey, requestBody)
    
    // 디버깅: 제미나이 원본 응답 로그
    console.log('\n' + '='.repeat(60))
    console.log('📥 제미나이로부터 받은 원본 응답')
    console.log('='.repeat(60))
    console.log(JSON.stringify(apiResponse, null, 2))
    console.log('='.repeat(60) + '\n')
    
    const interpretationText = parseGeminiResponse(apiResponse)
    
    // 디버깅: 파싱된 제미나이 응답 로그
    console.log('\n' + '='.repeat(60))
    console.log('✅ 제미나이 Markdown 응답')
    console.log('='.repeat(60))
    console.log(interpretationText)
    console.log('='.repeat(60) + '\n')

    return {
      success: true,
      fortuneType: fortuneType,
      interpretation: interpretationText,
    }
  } catch (error: any) {
    return {
      success: false,
      error: true,
      message: error.message || 'Unknown error occurred during AI interpretation.',
      details: error.toString(),
    }
  }
}

// ========== 메인 핸들러 ==========
serve(async (req) => {
  // CORS Preflight 처리
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // POST 요청만 허용
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 요청 본문 파싱
    const requestData = await req.json()
    
    // reportType을 fortuneType으로 매핑 (하위 호환성 유지)
    let fortuneType: FortuneType
    if (requestData.fortuneType) {
      fortuneType = requestData.fortuneType as FortuneType
    } else if (requestData.reportType) {
      // 기존 reportType을 FortuneType으로 변환
      const reportTypeMap: Record<string, FortuneType> = {
        'daily': FortuneType.DAILY,
        'lifetime': FortuneType.LIFETIME,
        'compatibility': FortuneType.COMPATIBILITY,
        'yearly': FortuneType.YEARLY,
      }
      fortuneType = reportTypeMap[requestData.reportType] || FortuneType.DAILY
    } else {
      fortuneType = FortuneType.DAILY
    }

    // 궁합인 경우 2명의 데이터 처리
    if (fortuneType === FortuneType.COMPATIBILITY) {
      const { user1, user2 } = requestData
      
      if (!user1 || !user1.birthDate || typeof user1.lat !== 'number' || typeof user1.lng !== 'number') {
        return new Response(
          JSON.stringify({ error: 'user1 data is required with birthDate, lat, lng' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      if (!user2 || !user2.birthDate || typeof user2.lat !== 'number' || typeof user2.lng !== 'number') {
        return new Response(
          JSON.stringify({ error: 'user2 data is required with birthDate, lat, lng' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // 두 명의 생년월일을 Date 객체로 변환
      let birthDateTime1: Date
      let birthDateTime2: Date
      try {
        birthDateTime1 = new Date(user1.birthDate)
        birthDateTime2 = new Date(user2.birthDate)
        if (isNaN(birthDateTime1.getTime()) || isNaN(birthDateTime2.getTime())) {
          throw new Error('Invalid date format')
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid birthDate format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // 두 명의 차트 계산
      let chartData1: any
      let chartData2: any
      try {
        chartData1 = await calculateChart(birthDateTime1, user1.lat, user1.lng)
      } catch (chartError: any) {
        console.error('사용자1 차트 계산 실패:', chartError)
        return new Response(
          JSON.stringify({ 
            error: `Chart calculation failed for user1: ${chartError.message || 'Unknown error'}` 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      try {
        chartData2 = await calculateChart(birthDateTime2, user2.lat, user2.lng)
      } catch (chartError: any) {
        console.error('사용자2 차트 계산 실패:', chartError)
        return new Response(
          JSON.stringify({ 
            error: `Chart calculation failed for user2: ${chartError.message || 'Unknown error'}` 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // 디버깅: 궁합 차트 계산 결과 로그 출력
      console.log('\n' + '='.repeat(60))
      console.log('📊 궁합 차트 계산 결과')
      console.log('='.repeat(60))
      
      // 사용자1 차트
      console.log('사용자1 입력:')
      console.log(`  생년월일시: ${user1.birthDate}`)
      console.log(`  위치: 위도 ${user1.lat}, 경도 ${user1.lng}`)
      console.log('사용자1 행성 위치:')
      if (chartData1.planets) {
        const planetNames: Record<string, string> = {
          sun: '태양(Sun)', moon: '달(Moon)', mercury: '수성(Mercury)', venus: '금성(Venus)',
          mars: '화성(Mars)', jupiter: '목성(Jupiter)', saturn: '토성(Saturn)',
        }
        Object.entries(chartData1.planets).forEach(([name, planet]: [string, any]) => {
          const displayName = planetNames[name] || name
          console.log(`    ${displayName.padEnd(20)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(2).padStart(6)}도 (하우스 ${planet.house})`)
        })
      }
      if (chartData1.fortuna) {
        console.log(`  포르투나: ${chartData1.fortuna.sign} ${chartData1.fortuna.degreeInSign.toFixed(2)}도 (하우스 ${chartData1.fortuna.house})`)
      }
      if (chartData1.houses?.angles?.ascendant !== undefined) {
        const ascSign = getSignFromLongitude(chartData1.houses.angles.ascendant)
        console.log(`  상승점: ${ascSign.sign} ${ascSign.degreeInSign.toFixed(2)}도`)
      }
      
      console.log()
      
      // 사용자2 차트
      console.log('사용자2 입력:')
      console.log(`  생년월일시: ${user2.birthDate}`)
      console.log(`  위치: 위도 ${user2.lat}, 경도 ${user2.lng}`)
      console.log('사용자2 행성 위치:')
      if (chartData2.planets) {
        const planetNames: Record<string, string> = {
          sun: '태양(Sun)', moon: '달(Moon)', mercury: '수성(Mercury)', venus: '금성(Venus)',
          mars: '화성(Mars)', jupiter: '목성(Jupiter)', saturn: '토성(Saturn)',
        }
        Object.entries(chartData2.planets).forEach(([name, planet]: [string, any]) => {
          const displayName = planetNames[name] || name
          console.log(`    ${displayName.padEnd(20)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(2).padStart(6)}도 (하우스 ${planet.house})`)
        })
      }
      if (chartData2.fortuna) {
        console.log(`  포르투나: ${chartData2.fortuna.sign} ${chartData2.fortuna.degreeInSign.toFixed(2)}도 (하우스 ${chartData2.fortuna.house})`)
      }
      if (chartData2.houses?.angles?.ascendant !== undefined) {
        const ascSign = getSignFromLongitude(chartData2.houses.angles.ascendant)
        console.log(`  상승점: ${ascSign.sign} ${ascSign.degreeInSign.toFixed(2)}도`)
      }
      console.log('='.repeat(60) + '\n')

      // AI 해석 요청 (궁합)
      const apiKey = Deno.env.get('GEMINI_API_KEY')
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const interpretation = await getInterpretation(chartData1, fortuneType, apiKey, chartData2)

      if (!interpretation.success || interpretation.error) {
        return new Response(
          JSON.stringify({ 
            error: `AI interpretation failed: ${interpretation.message || 'Unknown error'}` 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // 성공 응답 반환
      return new Response(
        JSON.stringify({
          success: true,
          chart: chartData1,
          chart2: chartData2,
          interpretation: interpretation.interpretation,
          fortuneType: fortuneType,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 일반 운세 (1명의 데이터)
    const { birthDate, lat, lng } = requestData

    // 필수 필드 검증
    if (!birthDate) {
      return new Response(
        JSON.stringify({ error: 'birthDate is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(
        JSON.stringify({ error: 'lat and lng must be numbers' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 생년월일을 Date 객체로 변환
    let birthDateTime: Date
    try {
      // ISO 형식 문자열을 Date 객체로 변환
      // 주의: new Date()는 로컬 시간대로 해석할 수 있으므로, UTC로 명시적으로 처리
      birthDateTime = new Date(birthDate)
      if (isNaN(birthDateTime.getTime())) {
        throw new Error('Invalid date format')
      }
      
      // 디버깅: 변환된 날짜 확인
      console.log('\n' + '='.repeat(60))
      console.log('📅 날짜 변환 확인')
      console.log('='.repeat(60))
      console.log(`원본 birthDate 문자열: ${birthDate}`)
      console.log(`변환된 Date 객체: ${birthDateTime.toISOString()}`)
      console.log(`UTC 시간: ${birthDateTime.getUTCFullYear()}-${String(birthDateTime.getUTCMonth() + 1).padStart(2, '0')}-${String(birthDateTime.getUTCDate()).padStart(2, '0')} ${String(birthDateTime.getUTCHours()).padStart(2, '0')}:${String(birthDateTime.getUTCMinutes()).padStart(2, '0')}:${String(birthDateTime.getUTCSeconds()).padStart(2, '0')}`)
      console.log('='.repeat(60) + '\n')
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid birthDate format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 1단계: 점성술 차트 계산
    let chartData: any
    try {
      chartData = await calculateChart(birthDateTime, lat, lng)
    } catch (chartError: any) {
      console.error('차트 계산 실패:', chartError)
      return new Response(
        JSON.stringify({ 
          error: `Chart calculation failed: ${chartError.message || 'Unknown error'}` 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 디버깅: 계산된 차트 데이터 로그 출력
    console.log('\n' + '='.repeat(60))
    console.log('📊 차트 계산 결과')
    console.log('='.repeat(60))
    console.log('입력 데이터:')
    console.log(`  생년월일시: ${birthDate}`)
    console.log(`  위치: 위도 ${lat}, 경도 ${lng}`)
    console.log()
    console.log('행성 7개 위치:')
    if (chartData.planets) {
      const planetNames: Record<string, string> = {
        sun: '태양(Sun)',
        moon: '달(Moon)',
        mercury: '수성(Mercury)',
        venus: '금성(Venus)',
        mars: '화성(Mars)',
        jupiter: '목성(Jupiter)',
        saturn: '토성(Saturn)',
      }
      Object.entries(chartData.planets).forEach(([name, planet]: [string, any]) => {
        const displayName = planetNames[name] || name
        console.log(`  ${displayName.padEnd(20)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(2).padStart(6)}도 (하우스 ${planet.house})`)
      })
    }
    console.log()
    console.log('포르투나(Fortune) 위치:')
    if (chartData.fortuna) {
      console.log(`  별자리: ${chartData.fortuna.sign}`)
      console.log(`  별자리 내 각도: ${chartData.fortuna.degreeInSign.toFixed(2)}도`)
      console.log(`  전체 경도: ${chartData.fortuna.degree.toFixed(2)}도`)
      console.log(`  하우스: ${chartData.fortuna.house}`)
    }
    console.log()
    console.log('상승점(Ascendant) 위치:')
    if (chartData.houses?.angles?.ascendant !== undefined) {
      const ascSign = getSignFromLongitude(chartData.houses.angles.ascendant)
      console.log(`  별자리: ${ascSign.sign}`)
      console.log(`  별자리 내 각도: ${ascSign.degreeInSign.toFixed(2)}도`)
      console.log(`  전체 경도: ${chartData.houses.angles.ascendant.toFixed(2)}도`)
    }
    console.log('='.repeat(60) + '\n')

    // 2단계: AI 해석 요청
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const interpretation = await getInterpretation(chartData, fortuneType, apiKey)

    if (!interpretation.success || interpretation.error) {
      return new Response(
        JSON.stringify({ 
          error: `AI interpretation failed: ${interpretation.message || 'Unknown error'}` 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 성공 응답 반환
    return new Response(
      JSON.stringify({
        success: true,
        chart: chartData,
        interpretation: interpretation.interpretation,
        fortuneType: fortuneType,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error: any) {
    console.error('Error in function:', error)
    return new Response(
      JSON.stringify({ 
        error: `Internal server error: ${error.message}` 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
