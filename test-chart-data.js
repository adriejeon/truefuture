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
  await calculateChart(testDate, testLat, testLng)
}

main().catch(console.error)
