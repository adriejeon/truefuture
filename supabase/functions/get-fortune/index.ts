// Supabase Edge Function for True Future - 점성술 서비스
// Gemini API 호출을 서버 사이드에서 처리하여 CORS 및 지역 차단 문제 해결

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// astronomy-engine npm 패키지 import (Deno는 npm: 프로토콜 지원)
import { MakeTime, Body, GeoVector, Ecliptic } from "npm:astronomy-engine@2.1.19"

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

function calculateAscendant(date: Date, lat: number, lng: number): number {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60
  const timeAngle = (hour / 24) * 360
  const latCorrection = lat * 0.5
  const lngCorrection = lng
  
  let ascendant = timeAngle + lngCorrection + latCorrection
  
  return normalizeDegrees(ascendant)
}

function calculateFortuna(ascendant: number, moonLon: number, sunLon: number): number {
  let fortuna = ascendant + moonLon - sunLon
  return normalizeDegrees(fortuna)
}

function getPlanetLongitude(body: any, time: any): number {
  const vector = GeoVector(body, time, true)
  const ecliptic = Ecliptic(vector)
  const longitude = ecliptic.elon * (180 / Math.PI)
  
  return normalizeDegrees(longitude)
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

    const time = MakeTime(date)
    const ascendant = calculateAscendant(date, lat, lng)
    const ascendantSignInfo = getSignFromLongitude(ascendant)

    const planetsData: any = {}

    for (const [planetName, body] of Object.entries(PLANETS)) {
      const longitude = getPlanetLongitude(body, time)
      const signInfo = getSignFromLongitude(longitude)
      const house = getWholeSignHouse(longitude, ascendant)

      planetsData[planetName] = {
        sign: signInfo.sign,
        degree: longitude,
        degreeInSign: signInfo.degreeInSign,
        house: house,
      }
    }

    const moonLon = planetsData.moon.degree
    const sunLon = planetsData.sun.degree
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

    return result
  } catch (error: any) {
    return {
      error: true,
      message: error.message || 'Unknown error occurred during chart calculation.',
      details: error.toString(),
    }
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

function getReportTypeDescription(reportType: string): string {
  const descriptions: any = {
    daily: '일일 운세',
    weekly: '주간 운세',
    monthly: '월간 운세',
    yearly: '연간 운세',
    synastry: '합궁(시너스트리) 분석',
    general: '일반 운세',
  }

  return descriptions[reportType.toLowerCase()] || `${reportType} 운세`
}

function buildUserPrompt(chartData: any, reportType: string): string {
  const reportTypeDesc = getReportTypeDescription(reportType)
  const compressedData = compressChartData(chartData)

  return `${reportTypeDesc} 분석:

${compressedData}

응답 형식 (JSON만, 마크다운 없음):
{"s":"요약150자이내","a":["행동1","행동2","행동3"],"k":["키워드1","키워드2"]}`
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

function parseGeminiResponse(apiResponse: any): any {
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

  let jsonText = text.trim()
  
  jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '')
  jsonText = jsonText.replace(/\n?```\s*$/i, '')
  jsonText = jsonText.trim()

  try {
    return JSON.parse(jsonText)
  } catch (parseError) {
    try {
      let fixedJson = jsonText
      
      const openQuotes = (fixedJson.match(/"/g) || []).length
      if (openQuotes % 2 !== 0) {
        const lastQuoteIndex = fixedJson.lastIndexOf('"')
        if (lastQuoteIndex !== -1) {
          fixedJson = fixedJson.substring(0, lastQuoteIndex + 1)
        }
      }
      
      const openBraces = (fixedJson.match(/{/g) || []).length
      const closeBraces = (fixedJson.match(/}/g) || []).length
      if (openBraces > closeBraces) {
        const openBrackets = (fixedJson.match(/\[/g) || []).length
        const closeBrackets = (fixedJson.match(/\]/g) || []).length
        if (openBrackets > closeBrackets) {
          fixedJson += ']'
        }
        fixedJson += '}'
      }
      
      const repaired = JSON.parse(fixedJson)
      console.warn('Warning: Repaired incomplete JSON response')
      return repaired
    } catch (repairError) {
      console.error('Failed to repair JSON:', repairError)
      return {
        s: jsonText.substring(0, 150) || '응답 생성 중 오류 발생',
        a: ['다시 시도해주세요'],
        k: ['오류']
      }
    }
  }
}

async function getInterpretation(chartData: any, reportType: string, apiKey: string): Promise<any> {
  try {
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY environment variable.')
    }

    const systemInstruction = {
      parts: [
        {
          text: `점성술 분석가. JSON만 출력. s(요약):공백포함150자이내 핵심만. a(행동):명사형 짧은 문장 3개. k(키워드):2-3개.`,
        },
      ],
    }

    const userPrompt = buildUserPrompt(chartData, reportType)

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
    const interpretation = parseGeminiResponse(apiResponse)

    return {
      success: true,
      reportType: reportType,
      interpretation: interpretation,
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
    const { birthDate, lat, lng, reportType = 'daily' } = requestData

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

    // 1단계: 점성술 차트 계산
    const chartData = await calculateChart(birthDateTime, lat, lng)

    if (chartData.error) {
      return new Response(
        JSON.stringify({ 
          error: `Chart calculation failed: ${chartData.message}` 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
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

    const interpretation = await getInterpretation(chartData, reportType, apiKey)

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
        reportType: reportType,
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
