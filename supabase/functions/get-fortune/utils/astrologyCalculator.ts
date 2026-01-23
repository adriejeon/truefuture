/**
 * 🌟 점성술 계산 유틸리티 모듈
 * astronomy-engine을 사용하여 차트 계산 및 Aspect 분석을 수행합니다.
 */

import { MakeTime, Body, GeoVector, Ecliptic, SiderealTime } from "npm:astronomy-engine@2.1.19"
import type { ChartData, Location, PlanetPosition, Aspect } from '../types.ts'

// ========== 상수 정의 ==========
export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

export const PLANETS = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
}

export const PLANET_NAMES: Record<string, string> = {
  sun: 'Sun',
  moon: 'Moon',
  mercury: 'Mercury',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
}

// Aspect 타입 정의
export const ASPECT_TYPES = {
  CONJUNCTION: { name: 'Conjunction', angle: 0, orb: 8 },
  OPPOSITION: { name: 'Opposition', angle: 180, orb: 8 },
  SQUARE: { name: 'Square', angle: 90, orb: 6 },
  TRINE: { name: 'Trine', angle: 120, orb: 6 },
  SEXTILE: { name: 'Sextile', angle: 60, orb: 4 },
}

// ========== 유틸리티 함수 ==========

/**
 * 각도를 0-360 범위로 정규화
 */
export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/**
 * 황도 경도로부터 별자리와 별자리 내 각도를 계산
 */
export function getSignFromLongitude(longitude: number): { sign: string; degreeInSign: number } {
  const normalized = normalizeDegrees(longitude)
  const signIndex = Math.floor(normalized / 30)
  const degreeInSign = normalized % 30

  return {
    sign: SIGNS[signIndex],
    degreeInSign: degreeInSign,
  }
}

/**
 * Whole Sign House System을 사용하여 하우스 계산
 */
export function getWholeSignHouse(longitude: number, ascendantLon: number): number {
  const normalized = normalizeDegrees(longitude)
  const ascNormalized = normalizeDegrees(ascendantLon)
  
  const ascSignIndex = Math.floor(ascNormalized / 30)
  const planetSignIndex = Math.floor(normalized / 30)
  
  let house = planetSignIndex - ascSignIndex + 1
  
  if (house < 1) house += 12
  if (house > 12) house -= 12
  
  return house
}

/**
 * 상승점(Ascendant) 계산
 */
export function calculateAscendant(date: Date, lat: number, lng: number, time: any): number {
  // 1. 그리니치 항성시(GMST) 계산
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

/**
 * Part of Fortune 계산
 */
export function calculateFortuna(ascendant: number, moonLon: number, sunLon: number): number {
  let fortuna = ascendant + moonLon - sunLon
  return normalizeDegrees(fortuna)
}

/**
 * 행성의 황도 경도 계산
 */
export function getPlanetLongitude(body: any, time: any): number {
  try {
    const vector = GeoVector(body, time, true)
    const ecliptic = Ecliptic(vector)
    const longitude = ecliptic.elon
    
    return normalizeDegrees(longitude)
  } catch (error: any) {
    console.error(`Error calculating planet longitude for ${body}:`, error)
    throw new Error(`Failed to calculate planet longitude: ${error.message}`)
  }
}

// ========== 주요 계산 함수 ==========

/**
 * 점성술 차트 계산
 * @param date - 계산할 날짜/시간
 * @param location - 위치 정보 (위도, 경도)
 * @returns 계산된 차트 데이터
 */
export async function calculateChart(date: Date, location: Location): Promise<ChartData> {
  try {
    const { lat, lng } = location

    // 입력 검증
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
    
    // 상승점 계산
    const ascendant = calculateAscendant(date, lat, lng, time)
    const ascendantSignInfo = getSignFromLongitude(ascendant)

    // 행성 위치 계산
    const planetsData: any = {}

    for (const [planetName, body] of Object.entries(PLANETS)) {
      try {
        const longitude = getPlanetLongitude(body, time)
        const signInfo = getSignFromLongitude(longitude)
        const house = getWholeSignHouse(longitude, ascendant)

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

    const moonLon = planetsData.moon.degree
    const sunLon = planetsData.sun.degree
    
    const fortunaLon = calculateFortuna(ascendant, moonLon, sunLon)
    const fortunaSignInfo = getSignFromLongitude(fortunaLon)
    const fortunaHouse = getWholeSignHouse(fortunaLon, ascendant)

    const midheaven = normalizeDegrees(ascendant + 90)

    const result: ChartData = {
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
    console.error('❌ 차트 계산 중 에러 발생:', error)
    throw new Error(`Chart calculation failed: ${error.message || 'Unknown error occurred'}`)
  }
}

/**
 * 두 각도 간의 최소 각도 차이를 계산 (0-180도 범위)
 */
export function calculateAngleDifference(angle1: number, angle2: number): number {
  const diff = Math.abs(normalizeDegrees(angle1) - normalizeDegrees(angle2))
  return diff > 180 ? 360 - diff : diff
}

/**
 * Natal 차트와 Transit 차트 간의 Aspect 계산
 * @param natalChart - 출생 차트
 * @param transitChart - 현재 하늘(Transit) 차트
 * @returns Aspect 배열
 */
export function calculateAspects(natalChart: ChartData, transitChart: ChartData): Aspect[] {
  const aspects: Aspect[] = []

  // Transit 행성들을 순회
  for (const [transitPlanetKey, transitPlanet] of Object.entries(transitChart.planets)) {
    const transitPlanetName = PLANET_NAMES[transitPlanetKey]
    const transitDegree = transitPlanet.degree

    // Natal 행성들과 비교
    for (const [natalPlanetKey, natalPlanet] of Object.entries(natalChart.planets)) {
      const natalPlanetName = PLANET_NAMES[natalPlanetKey]
      const natalDegree = natalPlanet.degree

      // 각도 차이 계산
      const angleDiff = calculateAngleDifference(transitDegree, natalDegree)

      // 각 Aspect 타입과 비교
      for (const [aspectKey, aspectType] of Object.entries(ASPECT_TYPES)) {
        const expectedAngle = aspectType.angle
        const orb = aspectType.orb
        const actualOrb = Math.abs(angleDiff - expectedAngle)

        // Orb 범위 내에 있는지 확인
        if (actualOrb <= orb) {
          const aspect: Aspect = {
            type: aspectType.name,
            orb: actualOrb,
            transitPlanet: transitPlanetName,
            natalPlanet: natalPlanetName,
            description: `Transit ${transitPlanetName} ${aspectType.name} Natal ${natalPlanetName} (orb ${actualOrb.toFixed(1)}°)`
          }
          
          aspects.push(aspect)
        }
      }
    }
  }

  // Orb가 작은 순서로 정렬 (더 정확한 Aspect가 우선)
  aspects.sort((a, b) => a.orb - b.orb)

  return aspects
}

/**
 * Transit 달이 Natal 차트의 몇 번째 하우스에 있는지 계산
 */
export function getTransitMoonHouseInNatalChart(natalChart: ChartData, transitChart: ChartData): number {
  const transitMoonLongitude = transitChart.planets.moon.degree
  const natalAscendant = natalChart.houses.angles.ascendant
  
  return getWholeSignHouse(transitMoonLongitude, natalAscendant)
}
