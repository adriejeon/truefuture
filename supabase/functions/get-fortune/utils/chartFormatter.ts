/**
 * 차트 데이터 포맷팅 유틸리티
 * Gemini에게 전달할 차트 정보를 보기 좋게 포맷팅합니다.
 */

import type { ChartData, Aspect, ProfectionData, SolarReturnOverlay } from '../types.ts'

/**
 * 각도를 별자리와 도수로 표시하는 헬퍼 함수
 */
export function getSignDisplay(longitude: number): string {
  const SIGNS_LOCAL = [
    'Aries',
    'Taurus',
    'Gemini',
    'Cancer',
    'Leo',
    'Virgo',
    'Libra',
    'Scorpio',
    'Sagittarius',
    'Capricorn',
    'Aquarius',
    'Pisces',
  ]
  const normalized = ((longitude % 360) + 360) % 360
  const signIndex = Math.floor(normalized / 30)
  const degreeInSign = normalized % 30
  return `${SIGNS_LOCAL[signIndex]} ${degreeInSign.toFixed(1)}°`
}

/**
 * DAILY 운세를 위한 User Prompt 생성 함수
 * Natal 차트, Transit 차트, 계산된 Aspect 정보를 포맷팅하여 반환합니다.
 */
export function generateDailyUserPrompt(
  natalData: ChartData,
  transitData: ChartData,
  aspects: Aspect[],
  transitMoonHouse: number,
): string {
  // Natal 차트 포맷팅
  const natalPlanets = Object.entries(natalData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`
    })
    .join('\n')

  const natalAscendant = natalData.houses.angles.ascendant
  const natalAscSign = getSignDisplay(natalAscendant)

  // Transit 차트 포맷팅
  const transitPlanets = Object.entries(transitData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`
    })
    .join('\n')

  // Aspect 포맷팅 (중요도 순으로 상위 15개만)
  const aspectsList = aspects
    .slice(0, 15)
    .map((aspect, index) => {
      return `  ${index + 1}. ${aspect.description}`
    })
    .join('\n')

  // 최종 User Prompt 생성
  return `
오늘의 운세 분석을 위한 데이터입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Natal Chart - 출생 차트]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
출생 시간: ${natalData.date}
출생 위치: 위도 ${natalData.location.lat}, 경도 ${natalData.location.lng}

상승점(Ascendant): ${natalAscSign}

행성 위치:
${natalPlanets}

Part of Fortune: ${natalData.fortuna.sign} ${natalData.fortuna.degreeInSign.toFixed(1)}° (House ${natalData.fortuna.house})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Transit Chart - 현재 하늘]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
현재 시간: ${transitData.date}

행성 위치:
${transitPlanets}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Transit Moon House]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Transit Moon은 Natal 차트의 ${transitMoonHouse}번째 하우스에 위치합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Calculated Aspects - 주요 각도 관계]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${aspectsList || '  (오늘은 주요 Aspect가 형성되지 않았습니다)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 데이터를 기반으로 오늘의 운세를 분석해 주세요.
`.trim()
}

/**
 * YEARLY 운세를 위한 User Prompt 생성 함수
 * Natal 차트, Solar Return 차트, Profection 정보, Overlay 정보를 포맷팅하여 반환합니다.
 */
export function generateYearlyUserPrompt(
  natalData: ChartData,
  solarReturnData: ChartData,
  profectionData: ProfectionData,
  solarReturnOverlay: SolarReturnOverlay,
): string {
  // Natal 차트 포맷팅
  const natalPlanets = Object.entries(natalData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`
    })
    .join('\n')

  const natalAscendant = natalData.houses.angles.ascendant
  const natalAscSign = getSignDisplay(natalAscendant)

  // Solar Return 차트 포맷팅
  const solarReturnPlanets = Object.entries(solarReturnData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (SR House ${planet.house})`
    })
    .join('\n')

  const solarReturnAscendant = solarReturnData.houses.angles.ascendant
  const solarReturnAscSign = getSignDisplay(solarReturnAscendant)

  // Profection 정보 포맷팅
  const profectionInfo = `
나이: ${profectionData.age}세 (만 나이)
활성화된 하우스 (Profection House): ${profectionData.profectionHouse}번째 하우스
프로펙션 별자리 (Profection Sign): ${profectionData.profectionSign}
올해의 주인 (Lord of the Year): ${profectionData.lordOfTheYear}

💡 해석 힌트: 올해는 ${profectionData.profectionHouse}번째 하우스의 주제가 인생의 중심이 되며, ${profectionData.lordOfTheYear}가 1년의 길흉을 주관합니다.
  `.trim()

  // Solar Return Overlay 포맷팅
  const overlayInfo = `
Solar Return Ascendant는 Natal 차트의 ${solarReturnOverlay.solarReturnAscendantInNatalHouse}번째 하우스에 위치합니다.

Solar Return 행성들의 Natal 차트 하우스 위치:
  - SR Sun은 Natal ${solarReturnOverlay.planetsInNatalHouses.sun}번째 하우스
  - SR Moon은 Natal ${solarReturnOverlay.planetsInNatalHouses.moon}번째 하우스
  - SR Mercury는 Natal ${solarReturnOverlay.planetsInNatalHouses.mercury}번째 하우스
  - SR Venus는 Natal ${solarReturnOverlay.planetsInNatalHouses.venus}번째 하우스
  - SR Mars는 Natal ${solarReturnOverlay.planetsInNatalHouses.mars}번째 하우스
  - SR Jupiter는 Natal ${solarReturnOverlay.planetsInNatalHouses.jupiter}번째 하우스
  - SR Saturn은 Natal ${solarReturnOverlay.planetsInNatalHouses.saturn}번째 하우스

💡 해석 힌트: SR 행성이 Natal 차트의 어느 하우스에 들어오는지에 따라 올해 그 영역에서 해당 행성의 영향력이 강하게 나타납니다.
  `.trim()

  // 최종 User Prompt 생성
  return `
1년 운세 분석을 위한 데이터입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Natal Chart - 출생 차트]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
출생 시간: ${natalData.date}
출생 위치: 위도 ${natalData.location.lat}, 경도 ${natalData.location.lng}

상승점(Ascendant): ${natalAscSign}

행성 위치:
${natalPlanets}

Part of Fortune: ${natalData.fortuna.sign} ${natalData.fortuna.degreeInSign.toFixed(1)}° (House ${natalData.fortuna.house})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Solar Return Chart - 솔라 리턴 차트]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Solar Return 시간: ${solarReturnData.date}
위치: 위도 ${solarReturnData.location.lat}, 경도 ${solarReturnData.location.lng}

Solar Return Ascendant: ${solarReturnAscSign}

행성 위치:
${solarReturnPlanets}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Annual Profection - 연주법]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${profectionInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Solar Return Overlay - SR 행성의 Natal 하우스 위치]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${overlayInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 데이터를 기반으로 1년 운세를 분석해 주세요.

**분석 시 중점 사항:**
1. **Profection House와 Lord of the Year**: 올해의 핵심 주제와 주관 행성의 상태를 종합적으로 분석하세요.
2. **Solar Return Ascendant**: SR Asc가 Natal의 어느 하우스에 들어오는지 보고 올해의 전반적인 분위기와 에너지를 파악하세요.
3. **Solar Return Sun**: SR Sun이 Natal의 어느 하우스에 있는지 보고 올해의 핵심 목표와 집중 영역을 도출하세요.
4. **Solar Return Overlay**: SR 행성들이 Natal 하우스에 어떻게 배치되는지 보고 각 생활 영역에서의 변화와 기회를 예측하세요.
5. **Lord of the Year의 상태**: Natal 차트와 SR 차트에서 Lord of the Year가 어떤 상태인지 확인하여 올해의 전반적인 운의 흐름을 판단하세요.
`.trim()
}
