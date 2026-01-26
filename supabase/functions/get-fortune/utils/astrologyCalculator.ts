/**
 * 🌟 점성술 계산 유틸리티 모듈
 * astronomy-engine을 사용하여 차트 계산 및 Aspect 분석을 수행합니다.
 */

import { MakeTime, Body, GeoVector, Ecliptic, SiderealTime, SearchSunLongitude } from "npm:astronomy-engine@2.1.19"
import type { ChartData, Location, PlanetPosition, Aspect, ProfectionData, SolarReturnOverlay } from '../types.ts'

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
 * @param date - 계산할 날짜/시간 (UTC)
 * @param location - 위치 정보 (위도, 경도)
 * @param timezoneOffsetHours - 하우스 계산용 Timezone Offset (시간 단위, 예: 서울 = +9)
 * @returns 계산된 차트 데이터
 */
export async function calculateChart(
  date: Date, 
  location: Location,
  timezoneOffsetHours: number = 0
): Promise<ChartData> {
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

    // 행성 계산용: UTC 그대로 사용 (정확함)
    const time = MakeTime(date)
    
    // 하우스 계산용: 현지 시간으로 변환
    // 하우스 시스템은 "그 장소의 그 시간"을 기준으로 계산되므로,
    // UTC 시간에 Timezone Offset을 더해서 현지 시간 기준으로 만들어줌
    const localDateForHouses = new Date(date.getTime() + (timezoneOffsetHours * 60 * 60 * 1000))
    const localTimeForHouses = MakeTime(localDateForHouses)
    
    if (timezoneOffsetHours !== 0) {
      console.log(`🏠 하우스 계산용 시간 변환: UTC ${date.toISOString()} + ${timezoneOffsetHours}h = Local ${localDateForHouses.toISOString()}`)
    }
    
    // 상승점 계산 (현지 시간 기준)
    const ascendant = calculateAscendant(localDateForHouses, lat, lng, localTimeForHouses)
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

// ========== Solar Return & Profection 계산 함수 ==========

/**
 * 별자리의 지배 행성(Ruler) 반환
 */
export function getSignRuler(sign: string): string {
  const rulers: Record<string, string> = {
    'Aries': 'Mars',
    'Taurus': 'Venus',
    'Gemini': 'Mercury',
    'Cancer': 'Moon',
    'Leo': 'Sun',
    'Virgo': 'Mercury',
    'Libra': 'Venus',
    'Scorpio': 'Mars',      // 고전 점성술: Mars (현대: Pluto)
    'Sagittarius': 'Jupiter',
    'Capricorn': 'Saturn',
    'Aquarius': 'Saturn',   // 고전 점성술: Saturn (현대: Uranus)
    'Pisces': 'Jupiter',    // 고전 점성술: Jupiter (현대: Neptune)
  }
  
  return rulers[sign] || 'Unknown'
}

/**
 * Solar Return 날짜/시간 계산
 * 태양이 Natal 태양과 정확히 같은 황경에 위치하는 시점을 찾습니다.
 * 
 * @param birthDate - 사용자의 출생 날짜
 * @param targetYear - 계산할 연도 (현재 년도 또는 특정 년도)
 * @param natalSunLongitude - Natal 태양의 황경
 * @returns Solar Return 날짜/시간 (UTC)
 */
export function calculateSolarReturnDateTime(
  birthDate: Date,
  targetYear: number,
  natalSunLongitude: number
): Date {
  try {
    // 대략적인 생일 날짜 계산 (targetYear의 생일)
    const birthMonth = birthDate.getUTCMonth()
    const birthDay = birthDate.getUTCDate()
    
    // 검색 시작일: targetYear의 생일 2일 전
    const searchStartDate = new Date(Date.UTC(targetYear, birthMonth, birthDay - 2))
    
    // 검색 종료일: targetYear의 생일 2일 후
    const searchEndDate = new Date(Date.UTC(targetYear, birthMonth, birthDay + 2))
    
    const startTime = MakeTime(searchStartDate)
    const endTime = MakeTime(searchEndDate)
    
    // astronomy-engine의 SearchSunLongitude를 사용하여 정확한 시점 찾기
    const solarReturnTime = SearchSunLongitude(natalSunLongitude, startTime, 5)
    
    if (!solarReturnTime) {
      throw new Error('Solar Return time not found in the search window')
    }
    
    // AstroTime을 순수 UTC Date로 변환
    // astronomy-engine의 AstroTime.date는 JavaScript Date 객체이지만,
    // 생성 시 로컬 타임존이 적용될 수 있으므로 명시적으로 UTC로 파싱
    const astroDate = solarReturnTime.date
    
    // Date 객체를 UTC 기준으로 재구성
    // getUTC* 메서드를 사용하여 UTC 값을 가져온 후 Date.UTC로 순수 UTC Date 생성
    const solarReturnDate = new Date(Date.UTC(
      astroDate.getUTCFullYear(),
      astroDate.getUTCMonth(),
      astroDate.getUTCDate(),
      astroDate.getUTCHours(),
      astroDate.getUTCMinutes(),
      astroDate.getUTCSeconds(),
      astroDate.getUTCMilliseconds()
    ))
    
    console.log(`✅ Solar Return 계산 완료 (UTC): ${solarReturnDate.toISOString()}`)
    
    return solarReturnDate
  } catch (error: any) {
    console.error('❌ Solar Return 계산 실패:', error)
    throw new Error(`Solar Return calculation failed: ${error.message}`)
  }
}

/**
 * 현재 적용 중인 Solar Return 연도 결정
 * 현재 날짜가 올해 생일 이전이면 작년 Solar Return, 이후면 올해 Solar Return
 * 
 * @param birthDate - 사용자의 출생 날짜
 * @param now - 현재 날짜
 * @returns Solar Return 연도
 */
export function getActiveSolarReturnYear(birthDate: Date, now: Date): number {
  const currentYear = now.getUTCFullYear()
  const birthMonth = birthDate.getUTCMonth()
  const birthDay = birthDate.getUTCDate()
  
  // 올해의 생일
  const birthdayThisYear = new Date(Date.UTC(currentYear, birthMonth, birthDay))
  
  // 현재가 올해 생일 이전이면 작년의 Solar Return 사용
  if (now < birthdayThisYear) {
    return currentYear - 1
  }
  
  // 생일 이후면 올해의 Solar Return 사용
  return currentYear
}

/**
 * Annual Profection 계산
 * 
 * @param birthDate - 사용자의 출생 날짜
 * @param targetDate - 계산 기준 날짜 (보통 Solar Return 날짜)
 * @param natalAscSign - Natal 차트의 상승궁 별자리
 * @param isSolarReturn - Solar Return 차트 계산 여부 (true면 단순 연도 차이 사용)
 * @returns Profection 데이터
 */
export function calculateProfection(
  birthDate: Date,
  targetDate: Date,
  natalAscSign: string,
  isSolarReturn: boolean = true
): ProfectionData {
  try {
    let age: number
    
    if (isSolarReturn) {
      // Solar Return의 경우: 단순 연도 차이 (생일 도달 여부와 무관)
      // targetDate가 Solar Return 시점이므로, 그 해에 도달하는 나이를 사용
      age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear()
      console.log(`📅 Profection 계산 (Solar Return 모드): targetYear ${targetDate.getUTCFullYear()} - birthYear ${birthDate.getUTCFullYear()} = ${age}세`)
    } else {
      // 일반 만 나이 계산 (생일이 지났는지 체크)
      age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear()
      
      const birthdayThisYear = new Date(
        Date.UTC(
          targetDate.getUTCFullYear(),
          birthDate.getUTCMonth(),
          birthDate.getUTCDate()
        )
      )
      
      if (targetDate < birthdayThisYear) {
        age -= 1
      }
      console.log(`📅 Profection 계산 (일반 모드): 만 나이 ${age}세`)
    }
    
    // Profection House 계산 (Age를 12로 나눈 나머지 + 1)
    const profectionHouse = (age % 12) + 1
    
    // Profection Sign 계산 (Natal Asc Sign에서 profectionHouse - 1만큼 이동)
    const natalAscIndex = SIGNS.indexOf(natalAscSign)
    if (natalAscIndex === -1) {
      throw new Error(`Invalid natal ascendant sign: ${natalAscSign}`)
    }
    
    const profectionSignIndex = (natalAscIndex + (profectionHouse - 1)) % 12
    const profectionSign = SIGNS[profectionSignIndex]
    
    // Lord of the Year (Profection Sign의 지배 행성)
    const lordOfTheYear = getSignRuler(profectionSign)
    
    console.log(`✅ Profection 계산 완료: Age ${age}, House ${profectionHouse}, Sign ${profectionSign}, Lord ${lordOfTheYear}`)
    
    return {
      age,
      profectionHouse,
      profectionSign,
      lordOfTheYear,
    }
  } catch (error: any) {
    console.error('❌ Profection 계산 실패:', error)
    throw new Error(`Profection calculation failed: ${error.message}`)
  }
}

/**
 * Solar Return 차트의 행성들이 Natal 차트의 어느 하우스에 위치하는지 계산 (Overlay)
 * 
 * @param natalChart - Natal 차트
 * @param solarReturnChart - Solar Return 차트
 * @returns Solar Return Overlay 정보
 */
export function getSolarReturnOverlays(
  natalChart: ChartData,
  solarReturnChart: ChartData
): SolarReturnOverlay {
  try {
    const natalAscendant = natalChart.houses.angles.ascendant
    
    // SR Ascendant가 Natal 차트의 몇 번째 하우스에 있는지
    const solarReturnAscendant = solarReturnChart.houses.angles.ascendant
    const solarReturnAscendantInNatalHouse = getWholeSignHouse(solarReturnAscendant, natalAscendant)
    
    // SR 행성들이 Natal 차트의 몇 번째 하우스에 있는지
    const planetsInNatalHouses: any = {}
    
    for (const [planetKey, planetData] of Object.entries(solarReturnChart.planets)) {
      const planetLongitude = planetData.degree
      const natalHouse = getWholeSignHouse(planetLongitude, natalAscendant)
      planetsInNatalHouses[planetKey] = natalHouse
    }
    
    console.log(`✅ Solar Return Overlay 계산 완료`)
    
    return {
      solarReturnAscendantInNatalHouse,
      planetsInNatalHouses,
    }
  } catch (error: any) {
    console.error('❌ Solar Return Overlay 계산 실패:', error)
    throw new Error(`Solar Return Overlay calculation failed: ${error.message}`)
  }
}
