// Supabase Edge Function for True Future - 점성술 서비스
// Gemini API 호출을 서버 사이드에서 처리하여 CORS 및 지역 차단 문제 해결

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 타입 및 프롬프트 import
import { FortuneType, UserData, CompatibilityData, ChartData } from './types.ts'
import { getSystemInstruction, generateDailyUserPrompt } from './geminiPrompts.ts'

// 점성술 계산 유틸리티 import
import {
  calculateChart,
  calculateAspects,
  getTransitMoonHouseInNatalChart,
  getSignFromLongitude,
  PLANET_NAMES,
} from './utils/astrologyCalculator.ts'

// ========== CORS 헤더 설정 ==========
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function buildUserPrompt(
  chartData: any, 
  fortuneType: FortuneType, 
  compatibilityChartData?: any,
  transitChartData?: any,
  aspects?: any[],
  transitMoonHouse?: number
): string {
  // DAILY 운세의 경우 새로운 상세 프롬프트 사용
  if (fortuneType === FortuneType.DAILY && transitChartData && aspects && transitMoonHouse !== undefined) {
    return generateDailyUserPrompt(
      chartData as ChartData,
      transitChartData as ChartData,
      aspects,
      transitMoonHouse
    )
  }
  
  // 기존 방식 (LIFETIME, YEARLY, COMPATIBILITY)
  const reportTypeDesc = getReportTypeDescription(fortuneType)
  const compressedData = compressChartData(chartData)
  
  let prompt = `${reportTypeDesc} 분석:\n\n${compressedData}`
  
  // 궁합의 경우 두 번째 차트 데이터 추가
  if (fortuneType === FortuneType.COMPATIBILITY && compatibilityChartData) {
    const compressedData2 = compressChartData(compatibilityChartData)
    prompt += `\n\n두 번째 사람:\n${compressedData2}`
  }
  
  return prompt
}

async function callGeminiAPI(modelName: string, apiKey: string, requestBody: any): Promise<any> {
  const endpoint = `${GEMINI_API_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`

  console.log('📤 Gemini API 호출 시작')

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('\n' + '='.repeat(60))
      console.error('❌ Gemini API 요청 실패')
      console.error('='.repeat(60))
      console.error('상태 코드:', response.status)
      console.error('상태 텍스트:', response.statusText)
      console.error('에러 응답:', errorText)
      console.error('='.repeat(60) + '\n')
      
      // API 키 관련 에러인지 확인
      if (response.status === 401 || response.status === 403) {
        throw new Error('Gemini API 인증 실패: API 키가 유효하지 않거나 만료되었습니다.')
      }
      
      throw new Error(
        `Gemini API 요청 실패 (${response.status}): ${response.statusText}. ${errorText.substring(0, 200)}`
      )
    }

    const apiResponse = await response.json()

    if (apiResponse.error) {
      console.error('\n' + '='.repeat(60))
      console.error('❌ Gemini API 에러 응답')
      console.error('='.repeat(60))
      console.error('에러:', JSON.stringify(apiResponse.error, null, 2))
      console.error('='.repeat(60) + '\n')
      
      throw new Error(
        `Gemini API error: ${apiResponse.error.message || JSON.stringify(apiResponse.error)}`
      )
    }

    console.log('✅ Gemini API 호출 성공')
    return apiResponse
  } catch (error: any) {
    console.error('\n' + '='.repeat(60))
    console.error('❌ Gemini API 호출 중 예외 발생')
    console.error('='.repeat(60))
    console.error('에러:', error.message)
    console.error('스택:', error.stack)
    console.error('='.repeat(60) + '\n')
    throw error
  }
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
  compatibilityChartData?: any,
  transitChartData?: any,
  aspects?: any[],
  transitMoonHouse?: number
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

    const userPrompt = buildUserPrompt(
      chartData, 
      fortuneType, 
      compatibilityChartData,
      transitChartData,
      aspects,
      transitMoonHouse
    )

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
    const interpretationText = parseGeminiResponse(apiResponse)

    return {
      success: true,
      fortuneType: fortuneType,
      interpretation: interpretationText,
      userPrompt: userPrompt, // 제미나이에게 전달한 User Prompt
      systemInstruction: systemInstructionText, // 제미나이에게 전달한 System Instruction
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
      let chartData1: ChartData
      let chartData2: ChartData
      try {
        chartData1 = await calculateChart(birthDateTime1, { lat: user1.lat, lng: user1.lng })
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
        chartData2 = await calculateChart(birthDateTime2, { lat: user2.lat, lng: user2.lng })
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


    // 1단계: Natal 차트 계산
    let chartData: ChartData
    try {
      chartData = await calculateChart(birthDateTime, { lat, lng })
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

    // DAILY 운세의 경우: Transit 차트 및 Aspect 계산
    let transitChartData: ChartData | undefined
    let aspects: any[] | undefined
    let transitMoonHouse: number | undefined

    if (fortuneType === FortuneType.DAILY) {
      try {
        // 현재 시간의 Transit 차트 계산
        const now = new Date()
        transitChartData = await calculateChart(now, { lat, lng })

        // Aspect 계산
        aspects = calculateAspects(chartData, transitChartData)

        // Transit Moon이 Natal 차트의 몇 번째 하우스에 있는지 계산
        transitMoonHouse = getTransitMoonHouseInNatalChart(chartData, transitChartData)

      } catch (transitError: any) {
        console.error('⚠️ Transit 차트 계산 실패 (기본 모드로 진행):', transitError)
        // Transit 계산 실패 시에도 기본 운세는 제공
      }
    }

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

    const interpretation = await getInterpretation(
      chartData, 
      fortuneType, 
      apiKey, 
      undefined, 
      transitChartData, 
      aspects, 
      transitMoonHouse
    )

    if (!interpretation.success || interpretation.error) {
      console.error('\n' + '='.repeat(60))
      console.error('❌ AI 해석 실패')
      console.error('='.repeat(60))
      console.error('에러 메시지:', interpretation.message)
      console.error('에러 상세:', interpretation.details)
      console.error('='.repeat(60) + '\n')
      
      return new Response(
        JSON.stringify({ 
          error: `AI 해석 실패: ${interpretation.message || 'Unknown error'}`,
          details: interpretation.details,
          errorType: 'AI_INTERPRETATION_FAILED'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 성공 응답 반환
    const responseData: any = {
      success: true,
      chart: chartData,
      interpretation: interpretation.interpretation,
      fortuneType: fortuneType,
    }

    // DAILY 운세의 경우 추가 정보 포함
    if (fortuneType === FortuneType.DAILY && transitChartData) {
      responseData.transitChart = transitChartData
      responseData.aspects = aspects
      responseData.transitMoonHouse = transitMoonHouse
    }

    // 제미나이에게 전달한 프롬프트 정보 포함 (디버깅용)
    if (interpretation.userPrompt) {
      responseData.userPrompt = interpretation.userPrompt
    }
    if (interpretation.systemInstruction) {
      responseData.systemInstruction = interpretation.systemInstruction
    }


    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error: any) {
    console.error('\n' + '='.repeat(60))
    console.error('❌ Edge Function 에러 발생')
    console.error('='.repeat(60))
    console.error('에러 메시지:', error.message)
    console.error('에러 스택:', error.stack)
    console.error('에러 타입:', error.name)
    console.error('='.repeat(60) + '\n')
    
    return new Response(
      JSON.stringify({ 
        error: `서버 오류: ${error.message || '알 수 없는 오류가 발생했습니다.'}`,
        errorType: error.name || 'UNKNOWN_ERROR',
        details: process.env.DENO_ENV === 'development' ? error.stack : undefined
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
