/**
 * 🌟 점성술 계산 유틸리티 모듈
 * astronomy-engine을 사용하여 차트 계산 및 Aspect 분석을 수행합니다.
 */

// Deno npm 스펙(npm:...) — Edge Function 런타임에서는 정상 동작, IDE는 Node 해석기 사용 시 경고 표시
// @ts-ignore
import { MakeTime, Body, GeoVector, Ecliptic, SiderealTime, SearchSunLongitude, Observer, Horizon, Equator } from "npm:astronomy-engine@2.1.19"
import type { ChartData, Location, PlanetPosition, Aspect, ProfectionData, SolarReturnOverlay, FirdariaResult, InteractionResult, ProgressionResult, DirectionHit } from '../types.ts'

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

// ========== Secondary Progression (진행 달) ==========

const PROGRESSION_ORB = 1
const PROGRESSION_ASPECTS: Array<{ angle: number; label: string }> = [
  { angle: 0, label: 'Conjunct' },
  { angle: 60, label: 'Sextile' },
  { angle: 90, label: 'Square' },
  { angle: 120, label: 'Trine' },
  { angle: 180, label: 'Opposition' },
]

/**
 * Secondary Progression: "A day for a year"
 * 만 30세 → 출생일 + 30일 시점의 달 위치를 Progressed Moon으로 봄.
 *
 * @param natalChart - 출생 차트 (날짜·위치·Natal 행성·Ascendant)
 * @param ageInFullYears - 만 나이 (연수)
 * @returns ProgressionResult (진행 달 별자리, Natal 기준 하우스, Natal 행성과의 주요 각도)
 */
export function calculateProgressedMoon(
  natalChart: ChartData,
  ageInFullYears: number
): ProgressionResult {
  const birthDate = new Date(natalChart.date)
  if (isNaN(birthDate.getTime())) {
    throw new Error('Invalid natalChart.date')
  }
  if (typeof ageInFullYears !== 'number' || ageInFullYears < 0) {
    throw new Error('ageInFullYears must be a non-negative number')
  }

  // Target Time = Birth Time + (Age * 24 hours)
  const progressedDate = new Date(
    birthDate.getTime() + ageInFullYears * 24 * 60 * 60 * 1000
  )
  const time = MakeTime(progressedDate)
  const progMoonLongitude = getPlanetLongitude(Body.Moon, time)
  const signInfo = getSignFromLongitude(progMoonLongitude)
  const natalAscendant = natalChart.houses.angles.ascendant
  const progMoonHouse = getWholeSignHouse(progMoonLongitude, natalAscendant)

  const aspects: string[] = []
  for (const [planetKey, planetData] of Object.entries(natalChart.planets)) {
    const natalPlanetName = PLANET_NAMES[planetKey]
    const natalDegree = planetData.degree
    const angleDiff = calculateAngleDifference(progMoonLongitude, natalDegree)

    for (const { angle, label } of PROGRESSION_ASPECTS) {
      const orb = Math.abs(angleDiff - angle)
      if (orb <= PROGRESSION_ORB) {
        const exact = orb <= 0.5 ? ' (Exact)' : ''
        aspects.push(`${label} Natal ${natalPlanetName}${exact}`)
        break
      }
    }
  }

  return {
    progMoonSign: signInfo.sign,
    progMoonHouse,
    aspects,
  }
}

// ========== Solar Arc Direction (솔라 아크 디렉션) ==========

const SOLAR_ARC_ORB = 1
const SOLAR_ARC_EXACT_ORB = 0.1

/**
 * Solar Arc Direction: 모든 Natal 행성·각도를 태양이 이동한 만큼(Arc)만큼 이동시킨 뒤,
 * Directed 포인트가 Natal 포인트와 Conjunction(0°) 또는 Opposition(180°)을 이루는 "Hit" 목록 반환.
 *
 * @param natalChart - 출생 차트
 * @param ageInFullYears - 만 나이 (연수)
 * @returns DirectionHit[] (Conjunction/Opposition 히트, Orb ±1°, isExact = orb < 0.1°)
 */
export function calculateSolarArcDirections(
  natalChart: ChartData,
  ageInFullYears: number
): DirectionHit[] {
  const birthDate = new Date(natalChart.date)
  if (isNaN(birthDate.getTime())) {
    throw new Error('Invalid natalChart.date')
  }
  if (typeof ageInFullYears !== 'number' || ageInFullYears < 0) {
    throw new Error('ageInFullYears must be a non-negative number')
  }

  // 1. Arc = Progressed Sun Longitude - Natal Sun Longitude
  const natalSunLongitude = natalChart.planets.sun.degree
  const progressedDate = new Date(
    birthDate.getTime() + ageInFullYears * 24 * 60 * 60 * 1000
  )
  const progressedSunLongitude = getPlanetLongitude(Body.Sun, MakeTime(progressedDate))
  let arc = progressedSunLongitude - natalSunLongitude
  arc = normalizeDegrees(arc)

  // 2. Directed: Natal + Arc (행성 7개 + Asc, MC)
  const directedPlanets: Array<{ name: string; longitude: number }> = []
  for (const [key, data] of Object.entries(natalChart.planets)) {
    directedPlanets.push({
      name: `Directed ${PLANET_NAMES[key]}`,
      longitude: normalizeDegrees(data.degree + arc),
    })
  }
  const natalAsc = natalChart.houses.angles.ascendant
  const natalMC = natalChart.houses.angles.midheaven
  directedPlanets.push(
    { name: 'Directed Ascendant', longitude: normalizeDegrees(natalAsc + arc) },
    { name: 'Directed MC', longitude: normalizeDegrees(natalMC + arc) },
  )

  // Natal 포인트 (Hit 대상): 행성 7개 + Asc, MC
  const natalPoints: Array<{ name: string; longitude: number }> = []
  for (const [key, data] of Object.entries(natalChart.planets)) {
    natalPoints.push({ name: `Natal ${PLANET_NAMES[key]}`, longitude: data.degree })
  }
  natalPoints.push(
    { name: 'Natal Ascendant', longitude: natalAsc },
    { name: 'Natal MC', longitude: natalMC },
  )

  // 3. Hit Check: Conjunction (0°) or Opposition (180°), Orb ±1°
  const hits: DirectionHit[] = []
  for (const moving of directedPlanets) {
    for (const target of natalPoints) {
      const angleDiff = calculateAngleDifference(moving.longitude, target.longitude)
      const orbConj = Math.abs(angleDiff - 0)
      const orbOpp = Math.abs(angleDiff - 180)
      if (orbConj <= SOLAR_ARC_ORB) {
        hits.push({
          movingPlanet: moving.name,
          targetPoint: target.name,
          aspect: 'Conjunction',
          isExact: orbConj < SOLAR_ARC_EXACT_ORB,
        })
      } else if (orbOpp <= SOLAR_ARC_ORB) {
        hits.push({
          movingPlanet: moving.name,
          targetPoint: target.name,
          aspect: 'Opposition',
          isExact: orbOpp < SOLAR_ARC_EXACT_ORB,
        })
      }
    }
  }

  return hits
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

// ========== Firdaria (피르다리) 계산 ==========

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/** 낮 차트 피르다리 순서: [행성명, 연수] */
const DAY_FIRDARIA: Array<{ lord: string; years: number }> = [
  { lord: 'Sun', years: 10 },
  { lord: 'Venus', years: 8 },
  { lord: 'Mercury', years: 13 },
  { lord: 'Moon', years: 9 },
  { lord: 'Saturn', years: 11 },
  { lord: 'Jupiter', years: 12 },
  { lord: 'Mars', years: 7 },
  { lord: 'NorthNode', years: 3 },
  { lord: 'SouthNode', years: 2 },
]

/** 밤 차트 피르다리 순서 */
const NIGHT_FIRDARIA: Array<{ lord: string; years: number }> = [
  { lord: 'Moon', years: 9 },
  { lord: 'Saturn', years: 11 },
  { lord: 'Jupiter', years: 12 },
  { lord: 'Mars', years: 7 },
  { lord: 'Sun', years: 10 },
  { lord: 'Venus', years: 8 },
  { lord: 'Mercury', years: 13 },
  { lord: 'NorthNode', years: 3 },
  { lord: 'SouthNode', years: 2 },
]

/** 서브 로드 순서 (노드 제외, 7행성) */
const SUB_LORD_ORDER = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars']

function nextInSubOrder(lord: string): string {
  const i = SUB_LORD_ORDER.indexOf(lord)
  if (i === -1) return SUB_LORD_ORDER[0]
  return SUB_LORD_ORDER[(i + 1) % 7]
}

/**
 * 출생 시각·위치에서 태양의 고도(Altitude)를 계산 (astronomy-engine 사용)
 * 고도 >= 0 이면 낮 차트(Diurnal), < 0 이면 밤 차트(Nocturnal)
 */
function getSunAltitudeAtBirth(birthDate: Date, lat: number, lng: number): number {
  const time = MakeTime(birthDate)
  const observer = new Observer(lat, lng, 0)
  const eq = Equator(Body.Sun, birthDate, observer, true, true)
  const hor = Horizon(birthDate, observer, eq.ra, eq.dec)
  return hor.altitude
}

/**
 * 생일 기준 만 나이 계산 (UTC)
 */
function getAgeInFullYears(birthDate: Date, targetDate: Date): number {
  let age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear()
  const birthMonth = birthDate.getUTCMonth()
  const birthDay = birthDate.getUTCDate()
  const targetMonth = targetDate.getUTCMonth()
  const targetDay = targetDate.getUTCDate()
  if (targetMonth < birthMonth || (targetMonth === birthMonth && targetDay < birthDay)) {
    age -= 1
  }
  return Math.max(0, age)
}

/**
 * Date에 연수(소수 가능)를 더한 새 Date 반환 (UTC, 연평균 365.25일)
 */
function addYearsUTC(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR)
}

/**
 * 피르다리(Firdaria) 계산
 * Sect(낮/밤) → 메이저 로드 → 서브 로드 및 기간을 계산합니다.
 *
 * @param birthDate - 출생일시 (UTC)
 * @param location - 출생 위치 (위도, 경도)
 * @param targetDate - 계산 기준일 (기본값: 현재 시각)
 * @returns FirdariaResult
 */
export function calculateFirdaria(
  birthDate: Date,
  location: Location,
  targetDate: Date = new Date()
): FirdariaResult {
  const { lat, lng } = location

  if (!(birthDate instanceof Date) || isNaN(birthDate.getTime())) {
    throw new Error('Invalid birthDate provided.')
  }
  if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
    throw new Error('Invalid latitude.')
  }
  if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
    throw new Error('Invalid longitude.')
  }

  // 1. Sect: 태양 고도로 낮/밤 차트 판별
  const sunAltitude = getSunAltitudeAtBirth(birthDate, lat, lng)
  const isDayChart = sunAltitude >= 0
  const sequence = isDayChart ? DAY_FIRDARIA : NIGHT_FIRDARIA

  // 2. 만 나이 및 75년 주기 내 위치
  const age = getAgeInFullYears(birthDate, targetDate)
  const ageInCycle = age % 75

  // 3. 메이저 로드 및 해당 기간 시작/종료
  let accumulatedYears = 0
  let majorLord = ''
  let majorPeriodStart = new Date(birthDate.getTime())
  let majorPeriodEnd = new Date(birthDate.getTime())

  for (const { lord, years } of sequence) {
    if (accumulatedYears + years > ageInCycle) {
      majorLord = lord
      majorPeriodStart = addYearsUTC(birthDate, accumulatedYears)
      majorPeriodEnd = addYearsUTC(birthDate, accumulatedYears + years)
      break
    }
    accumulatedYears += years
  }

  // 주기 끝까지 갔을 때 (ageInCycle === 0, 예: 75세·150세) → 새 주기 첫 기간
  if (!majorLord) {
    const cycles = Math.floor(age / 75)
    const first = sequence[0]
    majorLord = first.lord
    majorPeriodStart = addYearsUTC(birthDate, 75 * cycles)
    majorPeriodEnd = addYearsUTC(birthDate, 75 * cycles + first.years)
  }

  const result: FirdariaResult = {
    isDayChart,
    age,
    majorLord,
    subLord: null,
    majorPeriodStart,
    majorPeriodEnd,
  }

  // 4. 서브 로드: 노드 기간이면 null, 아니면 7등분 후 순서대로
  const isNode = majorLord === 'NorthNode' || majorLord === 'SouthNode'
  if (!isNode) {
    const majorDurationMs = majorPeriodEnd.getTime() - majorPeriodStart.getTime()
    const subDurationMs = majorDurationMs / 7
    const elapsedMs = targetDate.getTime() - majorPeriodStart.getTime()
    let subIndex = Math.floor(elapsedMs / subDurationMs)
    if (subIndex < 0) subIndex = 0
    if (subIndex > 6) subIndex = 6

    const subLords: string[] = []
    let cur = majorLord
    for (let i = 0; i < 7; i++) {
      subLords.push(cur)
      cur = nextInSubOrder(cur)
    }
    result.subLord = subLords[subIndex]
    result.subPeriodStart = new Date(majorPeriodStart.getTime() + subIndex * subDurationMs)
    result.subPeriodEnd = new Date(majorPeriodStart.getTime() + (subIndex + 1) * subDurationMs)
  }

  return result
}

// ========== 메이저/서브 로드 상호작용 분석 ==========

/** 행성 표기명 → 차트 키 (natalChart.planets 키) */
const PLANET_NAME_TO_KEY: Record<string, string> = {
  Sun: 'sun',
  Moon: 'moon',
  Mercury: 'mercury',
  Venus: 'venus',
  Mars: 'mars',
  Jupiter: 'jupiter',
  Saturn: 'saturn',
}

const ASPECT_ORB_LORD = 6

/**
 * 메이저 로드와 서브 로드 간의 관계 분석 (Reception, Aspect, House)
 * Gemini 프롬프트에 넣을 수 있는 요약 객체를 반환합니다.
 *
 * @param natalChart - 출생 차트
 * @param majorLordName - 메이저 로드 행성명 (예: "Sun", "Venus")
 * @param subLordName - 서브 로드 행성명 (예: "Mercury")
 * @returns InteractionResult
 */
export function analyzeLordInteraction(
  natalChart: ChartData,
  majorLordName: string,
  subLordName: string
): InteractionResult {
  const majorKey = PLANET_NAME_TO_KEY[majorLordName]
  const subKey = PLANET_NAME_TO_KEY[subLordName]
  const majorData = majorKey ? natalChart.planets[majorKey as keyof typeof natalChart.planets] : undefined
  const subData = subKey ? natalChart.planets[subKey as keyof typeof natalChart.planets] : undefined

  let reception: string | null = null
  let aspect: string | null = null
  let houseContext: string
  let summaryScore = 0

  // 1. Reception (접대/도움): 별자리 주인(Rulership) 기준
  if (majorData && subData) {
    const rulerOfSubSign = getSignRuler(subData.sign)
    const rulerOfMajorSign = getSignRuler(majorData.sign)
    const majorHostsSub = rulerOfSubSign === majorLordName
    const subHostsMajor = rulerOfMajorSign === subLordName
    if (majorHostsSub && subHostsMajor) {
      reception = `Mutual reception (Both helpful)`
      summaryScore += 1
    } else if (majorHostsSub) {
      reception = `${majorLordName} hosts ${subLordName} (Helpful)`
      summaryScore += 1
    } else if (subHostsMajor) {
      reception = `${subLordName} hosts ${majorLordName} (Helpful)`
      summaryScore += 1
    }
  }

  // 2. Aspect (협력/갈등): 황경 차이, Orb ±6도
  if (majorData && subData) {
    const angleDiff = calculateAngleDifference(majorData.degree, subData.degree)
    const aspects: Array<{ angle: number; label: string; tone: string }> = [
      { angle: 0, label: 'Conjunction', tone: 'United' },
      { angle: 60, label: 'Sextile', tone: 'Harmonious' },
      { angle: 90, label: 'Square', tone: 'Tension' },
      { angle: 120, label: 'Trine', tone: 'Harmonious' },
      { angle: 180, label: 'Opposition', tone: 'Tension' },
    ]
    let found = false
    for (const { angle, label, tone } of aspects) {
      if (Math.abs(angleDiff - angle) <= ASPECT_ORB_LORD) {
        const tag =
          angle === 0
            ? 'United (Intense)'
            : tone === 'Harmonious'
              ? 'Cooperative'
              : 'Tension'
        aspect = `${label} (${tag})`
        summaryScore += tone === 'United' || tone === 'Harmonious' ? 1 : -1
        found = true
        break
      }
    }
    if (!found) aspect = 'No Aspect'
  } else {
    aspect = null
  }

  // 3. House Context (활동 무대)
  const majorH = majorData?.house != null ? `${majorData.house}H` : '?'
  const subH = subData?.house != null ? `${subData.house}H` : '?'
  houseContext = `Major(${majorH}) - Sub(${subH})`

  // summaryScore: 긍정이면 +1, 부정이면 -1, 그 외 0으로 단순화
  const score =
    summaryScore > 0 ? 1 : summaryScore < 0 ? -1 : 0

  return {
    majorPlanet: majorLordName,
    subPlanet: subLordName,
    reception,
    aspect,
    houseContext,
    summaryScore: score,
  }
}
