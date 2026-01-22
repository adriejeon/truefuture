/**
 * 점성술 차트 데이터 구조 확인 스크립트
 * 
 * 사용법: node test-chart-data.js
 * 
 * 이 스크립트는 차트 계산 결과와 제미나이에 전달되는 데이터 형식을 확인합니다.
 */

// 테스트용 날짜와 위치 (서울 기준)
const testDate = new Date('1990-01-15T10:30:00Z') // UTC 시간
const testLat = 37.5665  // 서울 위도
const testLng = 126.9780  // 서울 경도

// astronomy-engine import (Node.js 환경)
import { MakeTime, Body, GeoVector, Ecliptic } from 'astronomy-engine'

// 별자리 이름 배열
const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

// 행성 매핑
const PLANETS = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360
}

function getSignFromLongitude(longitude) {
  const normalized = normalizeDegrees(longitude)
  const signIndex = Math.floor(normalized / 30)
  const degreeInSign = normalized % 30

  return {
    sign: SIGNS[signIndex],
    degreeInSign: degreeInSign,
  }
}

function getWholeSignHouse(longitude, ascendantLon) {
  const normalized = normalizeDegrees(longitude)
  const ascNormalized = normalizeDegrees(ascendantLon)
  
  const ascSignIndex = Math.floor(ascNormalized / 30)
  const planetSignIndex = Math.floor(normalized / 30)
  
  let house = planetSignIndex - ascSignIndex + 1
  
  if (house < 1) house += 12
  if (house > 12) house -= 12
  
  return house
}

function calculateAscendant(date, lat, lng) {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60
  const timeAngle = (hour / 24) * 360
  const latCorrection = lat * 0.5
  const lngCorrection = lng
  
  let ascendant = timeAngle + lngCorrection + latCorrection
  
  return normalizeDegrees(ascendant)
}

function calculateFortuna(ascendant, moonLon, sunLon) {
  let fortuna = ascendant + moonLon - sunLon
  return normalizeDegrees(fortuna)
}

function getPlanetLongitude(body, time) {
  const vector = GeoVector(body, time, true)
  const ecliptic = Ecliptic(vector)
  const longitude = ecliptic.elon * (180 / Math.PI)
  
  return normalizeDegrees(longitude)
}

async function calculateChart(date, lat, lng) {
  const time = MakeTime(date)
  const ascendant = calculateAscendant(date, lat, lng)
  const ascendantSignInfo = getSignFromLongitude(ascendant)

  const planetsData = {}

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

  return {
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
}

function compressChartData(chartData) {
  const parts = []
  
  const planetMap = {
    sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus',
    mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
  }
  
  if (chartData.planets) {
    const planetPositions = Object.entries(chartData.planets)
      .filter(([key]) => planetMap[key])
      .map(([key, p]) => {
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

// 메인 실행
async function main() {
  console.log('='.repeat(60))
  console.log('점성술 차트 데이터 구조 확인')
  console.log('='.repeat(60))
  console.log()
  
  console.log('테스트 입력:')
  console.log(`  날짜: ${testDate.toISOString()}`)
  console.log(`  위치: 위도 ${testLat}, 경도 ${testLng} (서울)`)
  console.log()
  
  const chartData = await calculateChart(testDate, testLat, testLng)
  
  console.log('='.repeat(60))
  console.log('1. 계산된 차트 데이터 (전체 구조)')
  console.log('='.repeat(60))
  console.log(JSON.stringify(chartData, null, 2))
  console.log()
  
  console.log('='.repeat(60))
  console.log('2. 행성별 상세 정보')
  console.log('='.repeat(60))
  Object.entries(chartData.planets).forEach(([name, planet]) => {
    console.log(`${name.padEnd(10)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(2).padStart(6)}도 (전체 경도: ${planet.degree.toFixed(2)}도) - 하우스 ${planet.house}`)
  })
  console.log()
  
  console.log('='.repeat(60))
  console.log('3. 포르투나(Fortune) 정보')
  console.log('='.repeat(60))
  console.log(`별자리: ${chartData.fortuna.sign}`)
  console.log(`별자리 내 각도: ${chartData.fortuna.degreeInSign.toFixed(2)}도`)
  console.log(`전체 경도: ${chartData.fortuna.degree.toFixed(2)}도`)
  console.log(`하우스: ${chartData.fortuna.house}`)
  console.log()
  
  console.log('='.repeat(60))
  console.log('4. 상승점(Ascendant) 정보')
  console.log('='.repeat(60))
  const ascSign = getSignFromLongitude(chartData.houses.angles.ascendant)
  console.log(`별자리: ${ascSign.sign}`)
  console.log(`별자리 내 각도: ${ascSign.degreeInSign.toFixed(2)}도`)
  console.log(`전체 경도: ${chartData.houses.angles.ascendant.toFixed(2)}도`)
  console.log()
  
  console.log('='.repeat(60))
  console.log('5. 제미나이에 전달되는 압축된 데이터')
  console.log('='.repeat(60))
  const compressedData = compressChartData(chartData)
  console.log(compressedData)
  console.log()
  
  console.log('='.repeat(60))
  console.log('6. 제미나이 프롬프트 예시 (일일 운세)')
  console.log('='.repeat(60))
  const examplePrompt = `일일 운세 분석:\n\n${compressedData}\n\n응답 형식 (JSON만, 마크다운 없음):\n{"s":"요약150자이내","a":["행동1","행동2","행동3"],"k":["키워드1","키워드2"]}`
  console.log(examplePrompt)
  console.log()
  
  console.log('='.repeat(60))
  console.log('검증 완료!')
  console.log('='.repeat(60))
}

main().catch(console.error)
