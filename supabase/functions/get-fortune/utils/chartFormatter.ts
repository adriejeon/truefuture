/**
 * 차트 데이터 포맷팅 유틸리티
 * Gemini에게 전달할 차트 정보를 보기 좋게 포맷팅합니다.
 */

import type {
  ChartData,
  Aspect,
  ProfectionData,
  SolarReturnOverlay,
  FirdariaResult,
  InteractionResult,
  ProgressionResult,
} from "../types.ts";
import {
  getSignFromLongitude,
  getSignRuler,
  normalizeDegrees,
  type CareerAnalysisResult,
  type WealthAnalysisResult,
  type PrimaryDirectionHit,
  type ProgressedEventItem,
  type ProfectionTimelineItem,
  analyzeHealthPotential,
} from "./astrologyCalculator.ts";
import { SIGNS } from "./astrologyCalculator.ts";
import {
  analyzeNatalFixedStars,
  formatNatalFixedStarsForPrompt,
} from "./advancedAstrology.ts";

/** 12별자리 성향 키워드 (내부 사용: 풍부한 해석용) */
const SIGN_KEYWORDS: Record<string, string> = {
  Aries: "직설적, 도전적, 급함, 리더십",
  Taurus: "안정지향, 감각적, 고집, 신중함",
  Gemini: "다재다능, 호기심, 언변, 변덕",
  Cancer: "감성적, 보호본능, 방어적, 가정적",
  Leo: "드라마틱, 자신감, 중심, 관대함",
  Virgo: "분석적, 헌신적, 완벽주의, 비판적",
  Libra: "사교적, 조화, 우유부단, 세련됨",
  Scorpio: "강렬함, 통찰력, 집착, 비밀스러움",
  Sagittarius: "자유분방, 철학적, 낙천적, 직설적",
  Capricorn: "야망, 책임감, 보수적, 현실적, 상하관계 뚜렷, 야욕",
  Aquarius: "독창적, 독립적, 이성적, 반골기질, 평화주의",
  Pisces: "몽상가, 예술적, 희생적, 흐릿한경계, 본인만의 감수성",
};

/** signName이 "Virgo 12.5°"처럼 들어올 수 있으므로 앞 단어만 파싱하거나 포함 여부 확인 */
function getSignCharacter(signName: string): string {
  const key = Object.keys(SIGN_KEYWORDS).find((k) => signName.includes(k));
  return key ? SIGN_KEYWORDS[key] : "";
}

/** LOVE 토픽 시 generatePredictionPrompt에 전달되는 연애/결혼 분석 데이터 */
export type LoveAnalysisData = {
  lotOfMarriage: { sign: string; longitude: number };
  loveQualities: {
    score: number;
    statusDescription: string;
    interpretation: string;
  };
  spouseCandidate: {
    bestSpouseCandidate: string;
    scores: Record<string, number>;
  };
  loveTiming: { activatedFactors: string[] };
  profectionSign: string;
};

/**
 * 각도를 별자리와 도수로 표시하는 헬퍼 함수
 */
export function getSignDisplay(longitude: number): string {
  const SIGNS_LOCAL = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
  ];
  const normalized = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  const degreeInSign = normalized % 30;
  return `${SIGNS_LOCAL[signIndex]} ${degreeInSign.toFixed(1)}°`;
}

/**
 * DAILY: 타임로드 역행 시 프롬프트에 넣을 경고 정보
 */
export type TimeLordRetrogradeAlert = {
  planet: string;
  isRetrograde: boolean;
} | null;

/** 연주 행성의 트랜짓 상태 (데일리 운세용) */
export type LordOfYearTransitStatus = {
  isRetrograde: boolean;
  isDayChart: boolean;
  sectStatus: "day_sect" | "night_sect" | "neutral";
  isInSect: boolean;
};

/**
 * DAILY 운세를 위한 User Prompt 생성 함수
 * Natal 차트, Transit 차트, 계산된 Aspect 정보를 포맷팅하여 반환합니다.
 * 타임로드가 역행 중이면 [CRITICAL WARNING] 섹션을 추가합니다.
 * 프로펙션/연주 정보와 연주 행성의 트랜짓 상태·각도를 포함할 수 있습니다.
 */
export function generateDailyUserPrompt(
  natalData: ChartData,
  transitData: ChartData,
  aspects: Aspect[],
  transitMoonHouse: number,
  timeLordRetrogradeAlert?: TimeLordRetrogradeAlert,
  profectionData?: ProfectionData | null,
  lordTransitStatus?: LordOfYearTransitStatus | null,
  lordTransitAspects?: Aspect[],
  lordStarConjunctionsText?: string | null
): string {
  // Natal 차트 포맷팅
  const natalPlanets = Object.entries(natalData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${
        planet.sign
      } ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`;
    })
    .join("\n");

  const natalAscendant = natalData.houses.angles.ascendant;
  const natalAscSign = getSignDisplay(natalAscendant);

  // Transit 차트 포맷팅
  const transitPlanets = Object.entries(transitData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${
        planet.sign
      } ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`;
    })
    .join("\n");

  // Aspect 포맷팅 (중요도 순으로 상위 15개만)
  const aspectsList = aspects
    .slice(0, 15)
    .map((aspect, index) => {
      return `  ${index + 1}. ${aspect.description}`;
    })
    .join("\n");

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

Part of Fortune: ${
    natalData.fortuna.sign
  } ${natalData.fortuna.degreeInSign.toFixed(1)}° (House ${
    natalData.fortuna.house
  })

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
${
  profectionData
    ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Annual Profection - 연주]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
연주(Annual Profection)란: 만 나이에 따라 1년 동안 특정 하우스·별자리가 활성화되고, 그 별자리의 지배 행성(연주의 주인, Lord of the Year)이 그 해의 길흉을 주관합니다. 오늘의 하루도 이 연주 행성의 영향 아래 있습니다.

나이: ${profectionData.age}세 (만 나이)
활성화된 하우스 (Profection House): ${profectionData.profectionHouse}번째 하우스
프로펙션 별자리 (Profection Sign): ${profectionData.profectionSign}
올해의 주인 (Lord of the Year): ${profectionData.lordOfTheYear}

💡 해석 힌트: 올해는 ${profectionData.profectionHouse}번째 하우스의 주제가 인생의 중심이 되며, ${profectionData.lordOfTheYear}가 1년의 길흉을 주관합니다. 오늘의 운세 해석 시 연주 행성의 트랜짓 상태와 다른 행성과의 각도를 반드시 반영하세요.`
    : ""
}
${
  lordTransitStatus || (lordTransitAspects && lordTransitAspects.length > 0)
    ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[연주 행성의 트랜짓 상태 및 각도]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
현재 트랜짓 차트에서 연주 행성(올해의 주인)의 상태:
${lordTransitStatus ? `- 역행 여부: ${lordTransitStatus.isRetrograde ? "역행 중 (Retrograde)" : "순행 중"}
- 현재 하늘: ${lordTransitStatus.isDayChart ? "낮 차트 (Day Chart, 태양이 7~12하우스)" : "밤 차트 (Night Chart, 태양이 1~6하우스)"}
- 연주 행성의 섹트: ${lordTransitStatus.sectStatus === "day_sect" ? "낮의 섹트 (Sun/Jupiter/Saturn)" : lordTransitStatus.sectStatus === "night_sect" ? "밤의 섹트 (Moon/Venus/Mars)" : "중성 (Mercury)"}
- 섹트 적합 여부: ${lordTransitStatus.isInSect ? "섹트 적합 (연주 행성이 현재 차트에 유리함)" : "섹트 부적합 (연주 행성이 현재 차트에 다소 불리함)"}` : ""}
${lordTransitAspects && lordTransitAspects.length > 0 ? `
연주 행성이 오늘 트랜짓 차트에서 다른 행성들과 맺는 각도 (해석 시 이 각도들의 영향을 반드시 반영하세요):
${lordTransitAspects.map((a, i) => `  ${i + 1}. ${a.description}`).join("\n")}` : ""}
`
    : ""
}
${lordStarConjunctionsText ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${lordStarConjunctionsText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Calculated Aspects - 주요 각도 관계]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${aspectsList || "  (오늘은 주요 Aspect가 형성되지 않았습니다)"}
${
  timeLordRetrogradeAlert?.isRetrograde
    ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CRITICAL WARNING] 타임로드 역행 — 핵심 변곡점
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
현재 회원님의 1년을 관장하는 행성인 ${timeLordRetrogradeAlert.planet}이(가) 역행하고 있습니다.
오늘은 돌발적인 변화나 과거의 문제가 다시 불거질 수 있는 중요한 변곡점입니다.
직업·금전·연애·건강 등 인생의 흐름이 바뀌거나 대형 이벤트가 발생할 확률이 높은 시기이므로, 해석 시 이를 반드시 강조하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : ""
}

위 데이터를 기반으로 오늘의 운세를 분석해 주세요.
`.trim();
}

/**
 * YEARLY 운세를 위한 User Prompt 생성 함수
 * Natal 차트, Solar Return 차트, Profection 정보, Overlay 정보를 포맷팅하여 반환합니다.
 */
export function generateYearlyUserPrompt(
  natalData: ChartData,
  solarReturnData: ChartData,
  profectionData: ProfectionData,
  solarReturnOverlay: SolarReturnOverlay
): string {
  // Natal 차트 포맷팅
  const natalPlanets = Object.entries(natalData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${
        planet.sign
      } ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`;
    })
    .join("\n");

  const natalAscendant = natalData.houses.angles.ascendant;
  const natalAscSign = getSignDisplay(natalAscendant);

  // Solar Return 차트 포맷팅
  const solarReturnPlanets = Object.entries(solarReturnData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${
        planet.sign
      } ${planet.degreeInSign.toFixed(1)}° (SR House ${planet.house})`;
    })
    .join("\n");

  const solarReturnAscendant = solarReturnData.houses.angles.ascendant;
  const solarReturnAscSign = getSignDisplay(solarReturnAscendant);

  // Profection 정보 포맷팅
  const profectionInfo = `
나이: ${profectionData.age}세 (만 나이)
활성화된 하우스 (Profection House): ${profectionData.profectionHouse}번째 하우스
프로펙션 별자리 (Profection Sign): ${profectionData.profectionSign}
올해의 주인 (Lord of the Year): ${profectionData.lordOfTheYear}

💡 해석 힌트: 올해는 ${profectionData.profectionHouse}번째 하우스의 주제가 인생의 중심이 되며, ${profectionData.lordOfTheYear}가 1년의 길흉을 주관합니다.
  `.trim();

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
  `.trim();

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

Part of Fortune: ${
    natalData.fortuna.sign
  } ${natalData.fortuna.degreeInSign.toFixed(1)}° (House ${
    natalData.fortuna.house
  })

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
`.trim();
}

/**
 * LIFETIME 운세를 위한 User Prompt 생성 함수
 * Natal 차트 정보를 상세하게 포맷팅하여 반환합니다.
 */
export function generateLifetimeUserPrompt(natalData: ChartData): string {
  // 현재 날짜 정보
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 생년월일에서 연도, 월, 일 추출
  const birthDate = new Date(natalData.date);
  const birthYear = birthDate.getFullYear();
  const birthMonth = birthDate.getMonth() + 1;
  const birthDay = birthDate.getDate();

  // Natal 차트 포맷팅
  const natalPlanets = Object.entries(natalData.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${
        planet.sign
      } ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`;
    })
    .join("\n");

  const natalAscendant = natalData.houses.angles.ascendant;
  const natalAscSign = getSignDisplay(natalAscendant);

  const natalMC = natalData.houses.angles.midheaven;
  const natalMCSign = getSignDisplay(natalMC);

  // 최종 User Prompt 생성
  return `
인생 종합운(사주) 분석을 위한 데이터입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 내담자 기본 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
출생 연월일: ${birthYear}년 ${birthMonth}월 ${birthDay}일
출생 시간: ${natalData.date}
출생 위치: 위도 ${natalData.location.lat}, 경도 ${natalData.location.lng}
현재 시점: ${currentYear}년 ${currentMonth}월

⚠️ 중요: 출생년도(${birthYear}년)를 기준으로 정확한 만 나이를 계산하여 시점을 표현하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🌌 Natal Chart - 출생 차트]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
상승점(Ascendant): ${natalAscSign}
중천(Midheaven/MC): ${natalMCSign}

행성 위치:
${natalPlanets}

Part of Fortune: ${
    natalData.fortuna.sign
  } ${natalData.fortuna.degreeInSign.toFixed(1)}° (House ${
    natalData.fortuna.house
  })

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 데이터를 기반으로 인생 종합운을 분석해 주세요.
`.trim();
}

/**
 * COMPATIBILITY 운세를 위한 User Prompt 생성 함수
 * 두 사람의 Natal 차트를 비교하여 궁합을 분석합니다.
 */
export function generateCompatibilityUserPrompt(
  natalData1: ChartData,
  natalData2: ChartData
): string {
  // 현재 날짜 정보
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 사용자 1 정보
  const birthDate1 = new Date(natalData1.date);
  const birthYear1 = birthDate1.getFullYear();
  const birthMonth1 = birthDate1.getMonth() + 1;
  const birthDay1 = birthDate1.getDate();

  const natalPlanets1 = Object.entries(natalData1.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${
        planet.sign
      } ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`;
    })
    .join("\n");

  const natalAscendant1 = natalData1.houses.angles.ascendant;
  const natalAscSign1 = getSignDisplay(natalAscendant1);

  // 사용자 2 정보
  const birthDate2 = new Date(natalData2.date);
  const birthYear2 = birthDate2.getFullYear();
  const birthMonth2 = birthDate2.getMonth() + 1;
  const birthDay2 = birthDate2.getDate();

  const natalPlanets2 = Object.entries(natalData2.planets)
    .map(([name, planet]) => {
      return `  - ${name.toUpperCase()}: ${
        planet.sign
      } ${planet.degreeInSign.toFixed(1)}° (House ${planet.house})`;
    })
    .join("\n");

  const natalAscendant2 = natalData2.houses.angles.ascendant;
  const natalAscSign2 = getSignDisplay(natalAscendant2);

  // 네이탈 항성 회합 (세차 보정) — 두 사용자 모두
  const stars1 = analyzeNatalFixedStars(natalData1, natalData1.date);
  const stars2 = analyzeNatalFixedStars(natalData2, natalData2.date);
  const block1 = formatNatalFixedStarsForPrompt(stars1);
  const block2 = formatNatalFixedStarsForPrompt(stars2);

  const deepSoulSection =
    stars1.length > 0 || stars2.length > 0
      ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DEEP SOUL CHARACTER ANALYSIS — Fixed Star Influences]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**User1 (내담자님) 타고난 항성 기질:**
${block1}

**User2 (상대방) 타고난 항성 기질:**
${block2}

**해석 지침:** 두 사람의 항성적 기질이 서로 조화를 이루는지, 아니면 둘 다 Royal Star(Regulus 등)나 강한 항성이 겹쳐서 부딪힐 수 있는지 Synastry 해석에 반드시 포함하세요. "User1은 [Star]의 영향을 받아 [Character]한 성향이 있고, User2는 [Star]의 영향으로 [Character]합니다." 형식으로 입체적으로 분석하세요.
`
      : "";

  // 최종 User Prompt 생성
  return `
궁합 분석을 위한 데이터입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 내담자님(User 1) 기본 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
출생 연월일: ${birthYear1}년 ${birthMonth1}월 ${birthDay1}일
출생 시간: ${natalData1.date}
출생 위치: 위도 ${natalData1.location.lat}, 경도 ${natalData1.location.lng}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🌌 내담자님 Natal Chart]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
상승점(Ascendant): ${natalAscSign1}

행성 위치:
${natalPlanets1}

Part of Fortune: ${
    natalData1.fortuna.sign
  } ${natalData1.fortuna.degreeInSign.toFixed(1)}° (House ${
    natalData1.fortuna.house
  })

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 상대방(User 2) 기본 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
출생 연월일: ${birthYear2}년 ${birthMonth2}월 ${birthDay2}일
출생 시간: ${natalData2.date}
출생 위치: 위도 ${natalData2.location.lat}, 경도 ${natalData2.location.lng}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🌌 상대방 Natal Chart]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
상승점(Ascendant): ${natalAscSign2}

행성 위치:
${natalPlanets2}

Part of Fortune: ${
    natalData2.fortuna.sign
  } ${natalData2.fortuna.degreeInSign.toFixed(1)}° (House ${
    natalData2.fortuna.house
  })

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📅 분석 시점]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
현재 시점: ${currentYear}년 ${currentMonth}월
${deepSoulSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 두 사람의 차트 데이터를 기반으로 궁합을 분석해 주세요.
`.trim();
}

/**
 * 자유 질문(Consultation)용 Prediction Prompt 생성.
 * [📋 내담자 기본 정보], [🌌 Natal Chart], [Analysis Data], [TIMING FILTER], [Category Significators] 순으로 구성합니다.
 *
 * @param chartData - Natal Chart 데이터 (planets, houses 등)
 * @param birthDate - 출생일시 ISO 문자열 (예: 1991-10-23T09:20:00, KST)
 * @param location - 출생지 위도/경도
 * @param firdariaResult - 피르다리 결과
 * @param interactionResult - 메이저·서브 로드 상호작용 (null 가능)
 * @param progressionResult - Progressed Moon 결과
 * @param directionResult - Primary Directions (Placidus/Naibod) 히트 목록 (향후 10년)
 * @param graphKnowledge - Neo4j에서 조회한 점성학 지식 (선택 또는 빈 문자열 허용)
 * @param careerAnalysis - WORK 토픽일 때 analyzeCareerPotential 결과 (null이면 생략)
 * @param wealthAnalysis - MONEY 토픽일 때 analyzeWealthPotential 결과 (null이면 생략)
 * @param loveAnalysis - LOVE 토픽일 때 연애/결혼 분석 결과 (null이면 생략)
 * @param consultationTopic - 질문 카테고리 (EXAM | MOVE | LOVE | MONEY | WORK | OTHER) — 타이밍 필터 및 지표성 블록에 사용
 * @param profectionData - 프로펙션 데이터 (profectionHouse, profectionSign, lordOfTheYear)
 * @param progressionTimeline - 10년 Progressed Moon 이벤트 타임라인
 * @param profectionTimeline - 10년 Profection 타임라인
 */
export function generatePredictionPrompt(
  chartData: ChartData,
  birthDate: string,
  location: { lat: number; lng: number },
  firdariaResult: FirdariaResult,
  interactionResult: InteractionResult | null,
  progressionResult: ProgressionResult,
  directionResult: PrimaryDirectionHit[],
  graphKnowledge: string = "",
  careerAnalysis: CareerAnalysisResult | null = null,
  wealthAnalysis: WealthAnalysisResult | null = null,
  loveAnalysis: LoveAnalysisData | null = null,
  consultationTopic: string = "OTHER",
  profectionData?: ProfectionData,
  progressionTimeline?: ProgressedEventItem[],
  profectionTimeline?: ProfectionTimelineItem[],
  solarReturnChartData?: ChartData,
  solarReturnOverlay?: SolarReturnOverlay
): string {
  const sections: string[] = [];

  // --- [📋 내담자 기본 정보] ---
  const birthKst = formatBirthDateKst(birthDate);
  const nowKst = formatCurrentDateKst();
  sections.push(`[📋 내담자 기본 정보]
- 출생 연월일: ${birthKst}
- 출생지 위도/경도: ${location.lat}, ${location.lng}
- 현재 시점: ${nowKst}`);

  // --- [🌌 Natal Chart] ---
  const ascLong = chartData.houses?.angles?.ascendant ?? 0;
  const ascParts = getSignDisplay(ascLong).split(" ");
  const ascDisplay =
    ascParts.length >= 2
      ? `${ascParts[0]} (${ascParts[1]})`
      : getSignDisplay(ascLong);
  const ascCharacter = getSignCharacter(ascParts[0] ?? getSignDisplay(ascLong));
  const planetLines = formatNatalPlanets(chartData, { getSignCharacter });
  const seventhRuler = getSeventhHouseRuler(ascLong);
  sections.push(`[🌌 Natal Chart]
- Ascendant: ${ascDisplay}${ascCharacter ? ` (Character: ${ascCharacter})` : ""}
${planetLines}
- 7th House Ruler: ${seventhRuler}`);

  // --- [NATAL CHART HIGHLIGHTS] — 타고난 항성(네이탈 Fixed Star) 그릇
  const natalStars = analyzeNatalFixedStars(chartData, birthDate);
  if (natalStars.length > 0) {
    const natalStarBlock = formatNatalFixedStarsForPrompt(natalStars);
    sections.push(`[NATAL CHART HIGHLIGHTS — 타고난 그릇 (Fixed Star Influences)]
${natalStarBlock}

**해석 가이드:** 상담 주제가 무엇이든, 내담자의 "타고난 그릇(Natal Star)"과 "현재 들어온 운(Transit Star, 단기 이벤트에 제공됨)"을 연결해서 답변하세요. 예: "회원님은 원래 [항성]의 기질을 타고나셨는데(Natal), 마침 이번에 [항성] 운이 들어왔으니(Transit), ..."`);
  }

  // --- [Analysis Data] ---
  const analysisParts: string[] = [];
  analysisParts.push("[Timing Analysis]");
  const majorLabel = firdariaResult.majorLord;
  const subLabel = firdariaResult.subLord ?? "—";
  analysisParts.push(
    `1. Main Period (Firdaria): ${majorLabel} Major / ${subLabel} Sub`
  );

  if (interactionResult) {
    const relationship: string[] = [];
    if (interactionResult.aspect) {
      relationship.push(interactionResult.aspect);
    }
    const houseMatch = interactionResult.houseContext.match(/Major\((\d+H)\)/);
    if (houseMatch) {
      const h = houseMatch[1].replace("H", "");
      const ord =
        [
          "1st",
          "2nd",
          "3rd",
          "4th",
          "5th",
          "6th",
          "7th",
          "8th",
          "9th",
          "10th",
          "11th",
          "12th",
        ][parseInt(h, 10) - 1] ?? `${h}th`;
      relationship.push(`in ${ord} House`);
    }
    if (relationship.length > 0) {
      analysisParts.push(`   - Relationship: ${relationship.join(" ")}.`);
    }
    if (interactionResult.reception) {
      analysisParts.push(`   - Note: Reception exists (Helpful).`);
    }
  } else {
    analysisParts.push(`   - (No Major/Sub interaction; node period or N/A.)`);
  }

  analysisParts.push("");
  analysisParts.push("2. Psychological Trend (Progression):");
  analysisParts.push(
    `   - Current Progressed Moon: ${
      progressionResult.progMoonSign
    } (${ordinalHouse(progressionResult.progMoonHouse)} House)`
  );
  analysisParts.push("   - Interaction with Natal (Internal/Fate):");
  if (progressionResult.natalAspects.length > 0) {
    progressionResult.natalAspects.forEach((a) =>
      analysisParts.push(`     * ${a}`)
    );
  } else {
    analysisParts.push("     * None");
  }
  analysisParts.push(
    "   - Interaction with Progressed Planets (Current Environment):"
  );
  if (progressionResult.progressedAspects.length > 0) {
    progressionResult.progressedAspects.forEach((a) =>
      analysisParts.push(`     * ${a}`)
    );
  } else {
    analysisParts.push("     * None");
  }

  analysisParts.push("");
  analysisParts.push("3. Major Events (Primary Directions - Placidus/Naibod):");
  analysisParts.push(
    "   * Note: Shows Direct and Converse hits to Angles/Luminaries within next 10 years."
  );
  if (directionResult.length > 0) {
    directionResult.forEach((hit) => {
      const match = hit.name.match(/^(.+?) -> (.+)$/);
      const promName = match ? match[1] : hit.name;
      const significator = match ? match[2] : "—";
      const typeLabel = hit.type === "Converse" ? " (Converse)" : "";
      analysisParts.push(`   - ${hit.eventDate} (Age ${hit.age}): ${hit.name}${typeLabel}`);
      analysisParts.push(
        `     * Interpretation: "${significator}의 영역(직업/가정/본신)에 ${promName}의 사건이 발생합니다."`
      );
    });
  } else {
    analysisParts.push("   - No major direction events in the next 10 years.");
  }

  if (profectionData) {
    analysisParts.push("");
    analysisParts.push("4. Annual Profection:");
    analysisParts.push(
      `   - Current Age: ${profectionData.age} (Profection House: ${ordinalHouse(profectionData.profectionHouse)})`
    );
    analysisParts.push(
      `   - Profection Sign: ${profectionData.profectionSign}`
    );
    analysisParts.push(
      `   - Lord of the Year: ${profectionData.lordOfTheYear ?? "—"}`
    );
    analysisParts.push(
      `   * Note: This year's focus is on the ${ordinalHouse(profectionData.profectionHouse)} house themes, ruled by ${profectionData.lordOfTheYear ?? "the sign ruler"}.`
    );
  }

  const catUpper = (consultationTopic || "").trim().toUpperCase();
  if (catUpper === "EXAM" || catUpper === "MOVE") {
    const asc = chartData.houses?.angles?.ascendant ?? 0;
    const nextNum = profectionData ? "5" : "4";
    analysisParts.push("");
    analysisParts.push(`${nextNum}. Category-Specific House Rulers (for timing focus):`);
    if (catUpper === "EXAM") {
      analysisParts.push(`   - Ruler of 3rd House (기초학습): ${getHouseRuler(asc, 3)}`);
      analysisParts.push(`   - Ruler of 9th House (고등학문/대학): ${getHouseRuler(asc, 9)}`);
      analysisParts.push(`   - Ruler of 10th House (직업/공무원·취업 시험): ${getHouseRuler(asc, 10)}`);
      analysisParts.push("   - Mercury (학업/자격증), Sun (직업성 시험 시 가중).");
    } else {
      analysisParts.push(`   - Ruler of 4th House (거주지/부동산): ${getHouseRuler(asc, 4)}`);
      analysisParts.push(`   - Ruler of 7th House (이동/계약): ${getHouseRuler(asc, 7)}`);
      analysisParts.push("   - Key angle: IC (Imum Coeli, relocation).");
    }
  }

  sections.push(`[Analysis Data]
${analysisParts.join("\n")}`);

  // --- [Solar Return Chart & Overlay] 추운(timing)용 ---
  if (solarReturnChartData && solarReturnOverlay) {
    const srAscDisplay = getSignDisplay(solarReturnChartData.houses.angles.ascendant);
    const srPlanets = Object.entries(solarReturnChartData.planets)
      .map(([name, planet]) => {
        return `  - ${name.toUpperCase()}: ${planet.sign} ${planet.degreeInSign.toFixed(1)}° (SR House ${planet.house})`;
      })
      .join("\n");

    const srOverlayInfo = `Solar Return Ascendant는 Natal 차트의 ${solarReturnOverlay.solarReturnAscendantInNatalHouse}번째 하우스에 위치합니다.

Solar Return 행성들의 Natal 차트 하우스 위치:
  - SR Sun은 Natal ${solarReturnOverlay.planetsInNatalHouses.sun}번째 하우스
  - SR Moon은 Natal ${solarReturnOverlay.planetsInNatalHouses.moon}번째 하우스
  - SR Mercury는 Natal ${solarReturnOverlay.planetsInNatalHouses.mercury}번째 하우스
  - SR Venus는 Natal ${solarReturnOverlay.planetsInNatalHouses.venus}번째 하우스
  - SR Mars는 Natal ${solarReturnOverlay.planetsInNatalHouses.mars}번째 하우스
  - SR Jupiter는 Natal ${solarReturnOverlay.planetsInNatalHouses.jupiter}번째 하우스
  - SR Saturn은 Natal ${solarReturnOverlay.planetsInNatalHouses.saturn}번째 하우스

💡 해석 힌트: SR 행성이 Natal 차트의 어느 하우스에 들어오는지에 따라 올해 그 영역에서 해당 행성의 영향력이 강하게 나타납니다. 질문과 관련된 하우스에 어떤 SR 행성이 들어왔는지 확인하세요.`;

    sections.push(`[☀️ Solar Return Chart - 올해 솔라 리턴 차트]
Solar Return 시간: ${solarReturnChartData.date}
위치: 위도 ${solarReturnChartData.location.lat}, 경도 ${solarReturnChartData.location.lng}

Solar Return Ascendant: ${srAscDisplay}

행성 위치:
${srPlanets}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Solar Return Overlay - SR 행성의 Natal 하우스 위치]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${srOverlayInfo}`);
  }

  // --- [TIMING FILTER] 카테고리별 시기 예측용 지표성 및 강제 규칙 ---
  const significators = getCategorySignificators(chartData, consultationTopic, {
    loveAnalysis,
    wealthAnalysis,
    careerAnalysis,
  });
  sections.push(
    `[CRITICAL INSTRUCTION FOR TIMING ANALYSIS]\n${significators.timingFilterInstruction}`
  );
  if (significators.houseLordsBlock) {
    sections.push(
      `[Category-Specific Significators (House Lords)]\n${significators.houseLordsBlock}`
    );
  }

  // --- [TIMELINE ANALYSIS (Next 10 Years)] 지표성 필터링 후 연도별 병합 ---
  const timelineSection = buildTimelineAnalysisSection(
    significators.primary,
    directionResult,
    progressionTimeline ?? [],
    profectionTimeline ?? [],
    consultationTopic
  );
  if (timelineSection) {
    sections.push(`[TIMELINE ANALYSIS (Next 10 Years)]\n${timelineSection}`);
    sections.push(
      `[INSTRUCTION FOR 10-YEAR TIMING]\nYou are analyzing a **10-year timeline**. DO NOT limit your answer to the current year (e.g. 2026). Scan the timeline above. If the strongest indicator for this question appears in a later year (e.g. 2029), explicitly state that "The most important timing is **that year**." Explain WHY based on the combination of Primary Directions, Secondary Progressions, and Annual Profections. Mark **(STRONG)** entries as especially significant when multiple techniques align.`
    );
  }

  // --- [🏛️ Career] / [💰 Wealth] (consultationTopic WORK / MONEY 시에만) ---
  if (careerAnalysis && careerAnalysis.candidates.length > 0) {
    const best = careerAnalysis.candidates.reduce((a, b) =>
      a.score >= b.score ? a : b
    );
    const reasonParts = formatScoreBreakdown(best.breakdown);
    const meaningReason =
      reasonParts.length > 0
        ? reasonParts.join(", ") + " 때문에"
        : "점수 구조상";
    const bestSignCharacter = getSignCharacter(best.sign);
    sections.push(`[🏛️ Career Potential Analysis (Method: POF & MC)]
- Best Career Planet: ${best.planetName} (Score: ${best.score})${bestSignCharacter ? `\n- Sign Character (Best Planet): "${bestSignCharacter}"` : ""}
- Key Candidates:
${careerAnalysis.candidates
  .map((c) => {
    const ord = ordinalHouse(c.house);
    const reason = formatScoreBreakdown(c.breakdown);
    return `  * ${c.planetName}: ${c.score} points. (Located in ${ord} House, ${
      c.sign
    })
  * Reason: ${reason.length > 0 ? reason.join(", ") : "—"}
  * Recommended Fields: ${c.keywords}`;
  })
  .join("\n")}
- Meaning: "직업적으로 가장 강력한 행성은 ${
      best.planetName
    }입니다. ${meaningReason} 해당 분야(${
      best.keywords
    })에서 구조적 강점이 있습니다."`);
  }

  if (wealthAnalysis) {
    const occList =
      wealthAnalysis.occupants.length > 0
        ? wealthAnalysis.occupants
            .map(
              (o) =>
                `${o.planetName} (${o.type}; ${
                  o.type === "Benefic"
                    ? "easy wealth / favorable"
                    : "challenges or delayed gain"
                })`
            )
            .join(", ")
        : "(no planets in Acquisition House)";
    const rulerStatus = formatScoreBreakdown(wealthAnalysis.ruler.breakdown);
    const rulerStatusText =
      rulerStatus.length > 0 ? rulerStatus.join(", ") : "—";
    const rulerPlanetKey = wealthAnalysis.ruler.planetName.toLowerCase();
    const rulerSign =
      (chartData.planets as Record<string, { sign?: string }>)?.[rulerPlanetKey]
        ?.sign ?? "";
    const rulerSignCharacter = getSignCharacter(rulerSign);
    const meaningOccupants =
      wealthAnalysis.occupants.length > 0
        ? wealthAnalysis.occupants.map((o) => o.planetName).join(", ") + "가"
        : "행성이 없고";
    sections.push(`[💰 Wealth Potential Analysis (Method: 11th from POF)]
- Acquisition House: ${wealthAnalysis.acquisitionSign}
- Planets in House: ${occList}
- Ruler Condition: ${wealthAnalysis.ruler.planetName} (Score: ${
      wealthAnalysis.ruler.score
    })
  * Status: ${rulerStatusText}${rulerSignCharacter ? `\n- Ruler Sign Character: "${rulerSignCharacter}"` : ""}
- Meaning: "재물 획득의 장소(11th from POF)에 ${meaningOccupants} 있고, 주인인 ${
      wealthAnalysis.ruler.planetName
    }가 ${wealthAnalysis.ruler.score}점으로 ${
      wealthAnalysis.ruler.score >= 0 ? "강합니다" : "약합니다"
    }. 따라서 해석 시 이 구조를 반영하세요."`);
  }

  // --- [💘 Love & Marriage] (consultationTopic LOVE 시에만) ---
  if (loveAnalysis) {
    const venus = chartData.planets?.venus;
    const house = venus?.house ?? 0;
    const sign = venus?.sign ?? "—";
    const ord = ordinalHouse(house);
    const combust =
      loveAnalysis.loveQualities.statusDescription.includes("Combust");
    const dignity = loveAnalysis.loveQualities.statusDescription.includes(
      "Stable"
    )
      ? "Stable/Happy"
      : loveAnalysis.loveQualities.statusDescription.includes("Challenging")
      ? "Challenging"
      : "Moderate";
    const interpText =
      loveAnalysis.loveQualities.score >= 5
        ? "연애 기회가 많고 안정적임"
        : loveAnalysis.loveQualities.score <= 0
        ? "비밀 연애·지연 주의"
        : "연애는 있으나 변동 가능";
    const best = loveAnalysis.spouseCandidate.bestSpouseCandidate;
    const totalScore = loveAnalysis.spouseCandidate.scores[best] ?? 0;
    const connectedParts: string[] = [];
    if (totalScore >= 30)
      connectedParts.push("first application of Luminary (Moon/Sun)");
    if (totalScore >= 10) connectedParts.push("Aspects Venus and/or 7th Ruler");
    if (totalScore >= 5) connectedParts.push("Aspects Lot of Marriage Ruler");
    const logicText =
      connectedParts.length > 0
        ? `This planet is connected to ${connectedParts.join("; ")}.`
        : "This planet scored highest among significator connections.";
    const SPOUSE_CANDIDATE_KEYWORDS: Record<string, string> = {
      Sun: "Leadership, authority, possibly public figure or senior role",
      Moon: "Nurturing, emotional, domestic or care-related work",
      Mercury: "Communicative, intellectual, trade or media",
      Venus: "Artistic, diplomatic, beauty or luxury-related",
      Mars: "Active, direct, perhaps uniformed or athletic job",
      Jupiter: "Expansive, legal/educational, religious or high status",
      Saturn: "Structured, responsible, government or long-term commitment",
    };
    const candidateKeywords = SPOUSE_CANDIDATE_KEYWORDS[best] ?? "—";
    const dirFactors = loveAnalysis.loveTiming.activatedFactors.filter((s) =>
      s.startsWith("Direction:")
    );
    const progFactors = loveAnalysis.loveTiming.activatedFactors.filter((s) =>
      s.startsWith("Progression:")
    );
    const venusSign = venus?.sign ?? "";
    const lotSign = loveAnalysis.lotOfMarriage.sign;
    const ascLong = chartData.houses?.angles?.ascendant ?? 0;
    const seventhSign = getSignFromLongitude(
      normalizeDegrees(ascLong + 180)
    ).sign;
    const matchesLotVenus =
      loveAnalysis.profectionSign === venusSign ||
      loveAnalysis.profectionSign === lotSign ||
      loveAnalysis.profectionSign === seventhSign
        ? "Yes"
        : "No";
    const directionLines =
      dirFactors.length > 0
        ? dirFactors.map((s) => s.replace("Direction: ", "")).join("; ")
        : "None";
    const progressionLines =
      progFactors.length > 0
        ? progFactors.map((s) => s.replace("Progression: ", "")).join("; ")
        : "None";
    const conclusion =
      loveAnalysis.loveTiming.activatedFactors.length >= 2
        ? "If multiple triggers are active, marriage probability is VERY HIGH."
        : "Review single triggers for timing emphasis.";
    sections.push(`[💘 Love & Marriage Analysis (Deep Scan)]

1. Venus Condition (Love Style):
   - Score: ${
     loveAnalysis.loveQualities.score
   } / Placement: ${ord} House (${sign})
   - Sign Character: "${getSignCharacter(sign)}"
   - Status: ${combust ? "Combust" : "Not combust"}, ${dignity}
   - Interpretation: "금성이 ${ord}에 있고 점수가 ${
      loveAnalysis.loveQualities.score
    }점이므로, ${interpText}."

2. Spouse Candidate (Who is it?):
   - 💍 Most Likely Planet: ${best} (Score: ${totalScore})
   - Logic: ${logicText}
   - Character: ${candidateKeywords}

3. Timing Triggers (When?):
   - Profection: ${
     loveAnalysis.profectionSign
   } (Matches Lot/Venus/7th? ${matchesLotVenus})
   - Firdaria: ${firdariaResult.majorLord} Major / ${
      firdariaResult.subLord ?? "—"
    } Sub Period.
   - Direction Events: ${directionLines}
   - Progression Events: ${progressionLines}
   - Conclusion: "${conclusion}"

Instruction: 제미나이에게 "이 데이터를 바탕으로 내담자의 연애 스타일, 미래 배우자의 특징(성격/직업), 그리고 결혼이 유력한 시기를 구체적으로 서술하라"고 지시해.`);
  }

  // --- [🏥 Health Analysis] (consultationTopic HEALTH 시) ---
  if (
    consultationTopic === "HEALTH" ||
    consultationTopic.toUpperCase() === "HEALTH"
  ) {
    const healthAnalysis = analyzeHealthPotential(chartData);
    const moonIssueList =
      healthAnalysis.moonHealth.issues.length > 0
        ? healthAnalysis.moonHealth.issues
            .map((i) => `${i.issue} (${i.severity})`)
            .join("; ")
        : "None";
    const mentalList =
      healthAnalysis.mentalHealth.factors.length > 0
        ? healthAnalysis.mentalHealth.factors.join("; ")
        : "None";
    const physicalList =
      healthAnalysis.physicalHealth.factors.length > 0
        ? healthAnalysis.physicalHealth.factors.join("; ")
        : "None";
    const congenitalList =
      healthAnalysis.congenitalIssues.factors.length > 0
        ? healthAnalysis.congenitalIssues.factors.join("; ")
        : "None";
    const affectedBodyParts =
      healthAnalysis.congenitalIssues.bodyParts.length > 0
        ? healthAnalysis.congenitalIssues.bodyParts.join(", ")
        : "—";

    sections.push(`[🏥 Health Analysis (Deep Scan)]

1. Moon Health (달의 상태):
   - Afflicted: ${healthAnalysis.moonHealth.isAfflicted ? "Yes" : "No"}
   - Issues: ${moonIssueList}
   - Interpretation: "${healthAnalysis.moonHealth.description}"

2. Mental Health (정신 건강):
   - Risk Level: ${healthAnalysis.mentalHealth.riskLevel}
   - Factors: ${mentalList}
   - Interpretation: "${healthAnalysis.mentalHealth.description}"

3. Physical Health (신체 건강):
   - Risk Level: ${healthAnalysis.physicalHealth.riskLevel}
   - Malefics in 6th House: ${
     healthAnalysis.physicalHealth.maleficsIn6th.length > 0
       ? healthAnalysis.physicalHealth.maleficsIn6th.join(", ")
       : "None"
   }
   - Factors: ${physicalList}
   - Interpretation: "${healthAnalysis.physicalHealth.description}"

4. Congenital Issues (선천적 건강 문제):
   - Risk Present: ${healthAnalysis.congenitalIssues.hasRisk ? "Yes" : "No"}
   - Factors: ${congenitalList}
   - Affected Body Parts (흉성 위치 사인 기반): ${affectedBodyParts}
   - Interpretation: "${healthAnalysis.congenitalIssues.description}"

5. Overall Score: ${healthAnalysis.overallScore} / 10
   - Summary: "${healthAnalysis.summary}"

**Interpretation Instruction:**
- 달이 흉성에게 공격받으면 전반적 건강과 회복력이 약함.
- 12하우스 연관(달/토성)은 정신 건강(우울/불안) 위험을 시사함.
- 6하우스 흉성(화성/토성)은 신체적 질병이나 수술 위험을 나타냄.
- 어센던트가 흉성에게 공격받고 리젝션 관계면 선천적 문제 가능.
- 흉성(프로미터)이 위치한 사인의 신체 부위가 취약할 수 있음 (예: Aries → 머리/얼굴, Scorpio → 생식기).
- 내담자의 질문에 맞춰 현재 건강 상태, 회복 시기, 치료 방법, 정신 건강 관리를 구체적으로 조언하세요.`);
  }

  sections.push(`[📚 Knowledge Base (from Neo4j)]
${(graphKnowledge ?? "").trim() || "(없음)"}`);

  sections.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🛑 IMPORTANT INSTRUCTION FOR AI - READ CAREFULLY]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are "TrueFuture", a wise, intuitive, and empathetic astrologer.
Your mission is to answer the user's inquiry based on the astrological data provided above (\`[Analysis Data]\`, \`[Deep Scan]\`, etc.), acting as your **hidden reasoning engine**.

**🚫 Negative Constraints (Review strict compliance):**
1.  **NO Data Recitation:** Do NOT say "Because Jupiter is in the 11th house..." or "According to the Primary Direction...". The user does not know astrology.
2.  **NO Technical Jargon:** Avoid terms like "Firdaria", "Profection", "Sect", "Acquisition House" in your final output unless absolutely necessary for credibility. Translate them into life context (e.g., "Jupiter in 11th" -> "Help from friends or networks").
3.  **NO Robotic Templates:** Do not start every sentence with "Based on the chart...". Be conversational.

**✅ Positive Guidelines (Follow these):**
1.  **Use "Invisible Reasoning":**
    - Look at the \`[Analysis Data]\`.
    - If \`Score\` is high (+), be optimistic and encourage action.
    - If \`Score\` is low (-) or blocked by Saturn/Mars, be cautious and advise patience/preparation.
    - Use the provided \`Sign Character\` keywords to describe the user's nature (e.g., "Since your Venus is in Virgo (Devoted), you tend to care for details in love...").
2.  **Focus on the User's Intent:**
    - **Topic: LOVE** -> Focus on "When" (Timing) and "Who" (Future Spouse Character) and "How" (Your Style).
    - **Topic: WORK** -> Focus on "Talent" (What fits me) and "Success Timing".
    - **Topic: MONEY** -> Focus on "Source" (Where money comes from) and "Volume" (Big or stable).
3.  **Structure:**
    - **Conclusion:** Direct answer (Yes/No/Time).
    - **Insight:** Why? (Synthesized interpretation of character + timing).
    - **Action Tip:** Practical advice based on the analysis.

**Tone & Manner:**
- **Language Protocol:** STRICTLY match the language of the user's input query.
  - **If Input is Korean:** Use **Korean** (Natural conversational tone, 해요체).
  - **If Input is English:** Use **English** (Warm, professional, empathetic tone).
  - **If Mixed:** Prioritize the language used for the core question.
- **Vibe:** Professional counselor, warm, insightful.

**Input Query:** "{User's Specific Question will be here}"
**Now, provide your counseling session.**`);

  return sections.join("\n\n");
}

/** 출생일시 문자열을 KST 기준 "YYYY년 MM월 DD일 HH시 mm분"으로 포맷 (입력이 이미 KST라고 가정) */
function formatBirthDateKst(birthDate: string): string {
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return birthDate;
  const [, y, m, d, h, min] = match;
  return `${y}년 ${parseInt(m!, 10)}월 ${parseInt(d!, 10)}일 ${parseInt(
    h!,
    10
  )}시 ${parseInt(min!, 10)}분`;
}

/** 현재 시점을 KST 기준 "YYYY년 MM월 DD일"로 포맷 */
function formatCurrentDateKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  return `${y}년 ${m}월 ${d}일`;
}

/** chartData.planets에서 Sun, Moon, Venus, Mars, Jupiter, Saturn을 "Sun: Scorpio (11th House)" 형식으로. getSignCharacter 주입 시 Sun/Moon에 (Character: ...) 추가 */
function formatNatalPlanets(
  chartData: ChartData,
  options?: { getSignCharacter?: (sign: string) => string }
): string {
  const order = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
  ] as const;
  const planets = chartData.planets ?? {};
  const getSignChar = options?.getSignCharacter;
  const lines: string[] = [];
  for (const key of order) {
    const p = planets[key];
    if (!p) continue;
    const houseOrd = ordinalHouse(p.house);
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    const charSuffix =
      getSignChar && (key === "sun" || key === "moon")
        ? ` (Character: ${getSignChar(p.sign)})`
        : "";
    lines.push(`- ${name}: ${p.sign} (${houseOrd} House)${charSuffix}`);
  }
  return lines.join("\n");
}

/** Whole Sign 기준 7하우스 쿠스프의 별자리 주인(행성) 반환 */
function getSeventhHouseRuler(ascendantLongitude: number): string {
  const seventhCuspLong = (ascendantLongitude + 180) % 360;
  const seventhSign = getSignFromLongitude(seventhCuspLong).sign;
  return getSignRuler(seventhSign);
}

/** Whole Sign 기준 N하우스 쿠스프의 별자리 주인(행성) 반환 */
function getHouseRuler(ascendantLongitude: number, houseNum: number): string {
  const cuspLong = (ascendantLongitude + (houseNum - 1) * 30 + 360) % 360;
  const sign = getSignFromLongitude(cuspLong).sign;
  return getSignRuler(sign);
}

/** POF(Part of Fortune) 기준 11번째 하우스 별자리의 룰러 반환 */
function getRulerOf11thFromPof(chartData: ChartData): string {
  const pofLon = chartData.fortuna?.degree ?? 0;
  const pofSign = chartData.fortuna?.sign ?? getSignFromLongitude(pofLon).sign;
  const idx = SIGNS.indexOf(pofSign);
  if (idx < 0) return "Jupiter";
  const eleventhSign = SIGNS[(idx + 10) % 12];
  return getSignRuler(eleventhSign);
}

/** POF(Part of Fortune) 별자리의 룰러 반환 */
function getRulerOfPof(chartData: ChartData): string {
  const pofSign = chartData.fortuna?.sign ?? getSignFromLongitude(chartData.fortuna?.degree ?? 0).sign;
  return getSignRuler(pofSign);
}

/** POF 기준 10번째·11번째 하우스에 위치한 행성 이름 목록 (1순위: 10th, 2순위: 11th) */
function getPlanetsInPof10th11th(
  chartData: ChartData,
  careerAnalysis?: CareerAnalysisResult | null
): { pof10: string[]; pof11: string[] } {
  if (careerAnalysis?.candidates?.length) {
    const pof10 = careerAnalysis.candidates
      .filter((c) => c.role === "POF 10th")
      .map((c) => c.planetName);
    const pof11 = careerAnalysis.candidates
      .filter((c) => c.role === "POF 11th")
      .map((c) => c.planetName);
    return { pof10, pof11 };
  }
  const pofLon = chartData.fortuna?.degree ?? 0;
  const planets = chartData.planets ?? {};
  const PLANET_NAMES: Record<string, string> = {
    sun: "Sun",
    moon: "Moon",
    mercury: "Mercury",
    venus: "Venus",
    mars: "Mars",
    jupiter: "Jupiter",
    saturn: "Saturn",
  };
  const pof10: string[] = [];
  const pof11: string[] = [];
  for (const [key, data] of Object.entries(planets)) {
    if (data?.degree == null) continue;
    const lon = (data.degree ?? 0) as number;
    const diff = normalizeDegrees(lon - pofLon);
    const houseFromPof = Math.floor(diff / 30) + 1;
    const name = PLANET_NAMES[key] ?? key;
    if (houseFromPof === 10) pof10.push(name);
    else if (houseFromPof === 11) pof11.push(name);
  }
  return { pof10, pof11 };
}

/** 카테고리별 시기 예측용 지표성(Significator) 결과 */
export interface CategorySignificatorsResult {
  primary: string[];
  secondary?: string[];
  houseLordsBlock?: string;
  timingFilterInstruction: string;
}

/** 카테고리별 '집중해야 할 지표(Focus Targets)' 목록 및 타이밍 필터 문구 반환 */
export function getCategorySignificators(
  chartData: ChartData,
  category: string,
  options?: {
    loveAnalysis?: LoveAnalysisData | null;
    wealthAnalysis?: WealthAnalysisResult | null;
    careerAnalysis?: CareerAnalysisResult | null;
  }
): CategorySignificatorsResult {
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const cat = (category || "OTHER").trim().toUpperCase();
  const primarySet = new Set<string>();
  const secondarySet = new Set<string>();
  let houseLordsBlock: string | undefined;

  const addPrimary = (...names: string[]) =>
    names.forEach((n) => n && primarySet.add(n));
  const addSecondary = (...names: string[]) =>
    names.forEach((n) => n && secondarySet.add(n));

  if (cat === "LOVE" && options?.loveAnalysis) {
    const lord7 = getHouseRuler(asc, 7);
    const lotRuler = getSignRuler(options.loveAnalysis.lotOfMarriage.sign);
    addPrimary("Venus", lord7, "Moon", lotRuler);
    return {
      primary: [...primarySet],
      timingFilterInstruction: buildTimingFilterInstruction("LOVE", {
        primary: [...primarySet],
        secondary: undefined,
      }),
    };
  }

  if (cat === "MONEY") {
    const lord2 = getHouseRuler(asc, 2);
    const lord8 = getHouseRuler(asc, 8);
    const pofRuler = getRulerOfPof(chartData);
    addPrimary("Jupiter", lord2, pofRuler, lord8);
    return {
      primary: [...primarySet],
      timingFilterInstruction: buildTimingFilterInstruction("MONEY", {
        primary: [...primarySet],
        secondary: undefined,
      }),
    };
  }

  if (cat === "WORK") {
    const lord10 = getHouseRuler(asc, 10);
    const lord6 = getHouseRuler(asc, 6);
    addPrimary("Sun", "Mars", "MC", lord10, lord6);
    return {
      primary: [...primarySet],
      timingFilterInstruction: buildTimingFilterInstruction("WORK", {
        primary: [...primarySet],
        secondary: undefined,
      }),
    };
  }

  if (cat === "EXAM") {
    const lord3 = getHouseRuler(asc, 3);
    const lord9 = getHouseRuler(asc, 9);
    const lord10 = getHouseRuler(asc, 10);
    addPrimary("Mercury", lord3, lord9, lord10, "Sun");
    addSecondary(lord10, "Sun");
    houseLordsBlock = [
      `Ruler of 3rd House (기초학습): ${lord3}`,
      `Ruler of 9th House (고등학문/대학): ${lord9}`,
      `Ruler of 10th House (직업/공무원·취업 시험): ${lord10}`,
      "Mercury (학업/자격증), Sun (직업성 시험 시 가중).",
    ].join("\n");
    return {
      primary: [...primarySet],
      secondary: [...secondarySet],
      houseLordsBlock,
      timingFilterInstruction: buildTimingFilterInstruction("EXAM", {
        primary: ["Mercury", lord3, lord9],
        secondary: [lord10, "Sun"],
      }),
    };
  }

  if (cat === "MOVE") {
    const lord4 = getHouseRuler(asc, 4);
    const lord7 = getHouseRuler(asc, 7);
    addPrimary("Moon", lord4, lord7);
    houseLordsBlock = [
      `Ruler of 4th House (거주지/부동산): ${lord4}`,
      `Ruler of 7th House (이동/계약/타인과의 관계): ${lord7}`,
      "Key angle for relocation: IC (Imum Coeli).",
    ].join("\n");
    return {
      primary: [...primarySet],
      houseLordsBlock,
      timingFilterInstruction: buildTimingFilterInstruction("MOVE", {
        primary: [lord4, lord7],
        secondary: undefined,
      }),
    };
  }

  if (cat === "HEALTH") {
    const lord6 = getHouseRuler(asc, 6);
    const lord12 = getHouseRuler(asc, 12);
    addPrimary("Moon", "Ascendant", lord6, lord12, "Saturn", "Mars");
    houseLordsBlock = [
      `Ruler of 6th House (질병/치료): ${lord6}`,
      `Ruler of 12th House (정신 건강/은둔): ${lord12}`,
      "Moon (건강 전반), Ascendant (체질), Saturn (만성 질환), Mars (급성 질환/사고).",
    ].join("\n");
    return {
      primary: [...primarySet],
      houseLordsBlock,
      timingFilterInstruction: buildTimingFilterInstruction("HEALTH", {
        primary: ["Moon", lord6, lord12],
        secondary: ["Saturn", "Mars"],
      }),
    };
  }

  if (cat === "OTHER" || cat === "GENERAL" || !cat) {
    const lord1 = getHouseRuler(asc, 1);
    addPrimary(lord1, "Moon", "Sun");
    return {
      primary: [...primarySet],
      timingFilterInstruction: buildTimingFilterInstruction("OTHER", {
        primary: [...primarySet],
        secondary: undefined,
      }),
    };
  }

  const lord1 = getHouseRuler(asc, 1);
  addPrimary(lord1, "Moon", "Sun");
  return {
    primary: [...primarySet],
    timingFilterInstruction: buildTimingFilterInstruction("OTHER", {
      primary: [...primarySet],
      secondary: undefined,
    }),
  };
}

/**
 * 10년 타임라인 데이터를 지표성(Significators)으로 필터링하여 연도별(Chronological) 텍스트로 병합.
 */
function buildTimelineAnalysisSection(
  significators: string[],
  directionResult: PrimaryDirectionHit[],
  progressionTimeline: ProgressedEventItem[],
  profectionTimeline: ProfectionTimelineItem[],
  category: string
): string {
  const sigSet = new Set(significators.map((s) => s.toLowerCase()));
  const yearsToLines: Record<number, string[]> = {};

  const addYear = (year: number) => {
    if (!yearsToLines[year]) yearsToLines[year] = [];
  };

  // Primary Directions: promissor 또는 target이 지표성에 해당하면 포함
  for (const hit of directionResult) {
    const [prom, target] = hit.pair.split(" -> ");
    if (!prom || !target) continue;
    const promMatch = sigSet.has(prom.toLowerCase());
    const targetMatch = sigSet.has(target.toLowerCase());
    if (!promMatch && !targetMatch) continue;
    const year = hit.year ?? parseInt(String(hit.eventDate ?? "").split(".")[0], 10);
    if (!year || isNaN(year)) continue;
    addYear(year);
    yearsToLines[year].push(
      `Primary Direction(${hit.pair}) **(STRONG)**`
    );
  }

  // Progression: 이벤트 문자열에 지표성 행성명이 포함되면 포함
  for (const item of progressionTimeline) {
    const matched = item.events.filter((ev) =>
      significators.some((sig) =>
        ev.includes(sig) || ev.toLowerCase().includes(`natal ${sig.toLowerCase()}`)
      )
    );
    if (matched.length === 0) continue;
    addYear(item.year);
    yearsToLines[item.year].push(...matched);
  }

  // Profection: Lord가 지표성에 해당하면 포함
  for (const item of profectionTimeline) {
    if (!sigSet.has(item.lord.toLowerCase())) continue;
    addYear(item.year);
    yearsToLines[item.year].push(`Profection Lord(${item.lord})`);
  }

  const years = Object.keys(yearsToLines)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length === 0) return "";

  return years
    .map((y) => `${y}: ${yearsToLines[y].join(", ")}`)
    .join("\n");
}

/** 카테고리별 [CRITICAL INSTRUCTION FOR TIMING ANALYSIS] 문구 생성 */
function buildTimingFilterInstruction(
  category: string,
  sig: { primary: string[]; secondary?: string[] }
): string {
  const primaryList = sig.primary.join(", ");
  const secondaryList =
    sig.secondary && sig.secondary.length > 0
      ? ` (Secondary: ${sig.secondary.join(", ")})`
      : "";

  const baseInstruction = `[CRITICAL INSTRUCTION FOR TIMING ANALYSIS]
Current Category: **${category.toUpperCase()}**

**Significators for this question:**
- ${primaryList}${secondaryList}

**Your Task: Synthesize timing from ALL 4 techniques**

You must analyze timing by integrating data from all 4 predictive techniques provided in [Analysis Data]:

1. **Firdaria (Main Period):**
   - Check if the Major Lord or Sub Lord is one of the significators above.
   - If yes, this period is favorable for the question. Note the period and interpret accordingly.

2. **Secondary Progression (Progressed Moon):**
   - Check if the Progressed Moon aspects (conjunction, trine, sextile, square, opposition) any of the significators (in Natal or Progressed positions).
   - Favorable aspects (trine, sextile, conjunction with benefics) = positive timing.
   - Challenging aspects (square, opposition, conjunction with malefics) = difficult timing but still activation.

3. **Primary Directions:**
   - Check if any of the significators direct to key angles (Asc, MC, IC, Dsc) or luminaries (Sun, Moon).
   - Each direction hit provides a **specific date/age** when the significator is activated. Prioritize these for precise timing.

4. **Annual Profection:**
   - Check if the Profection Sign or Lord of the Year is one of the significators.
   - Or check if the Profection House matches the relevant houses for this category (e.g., 3rd/9th/10th for EXAM, 4th/7th for MOVE, 7th for LOVE, 2nd/5th/11th for MONEY, 10th/6th for WORK).
   - If yes, the current profection year is favorable.

**Scoring & Synthesis:**
- **Best timing:** When multiple techniques activate the same significators simultaneously (e.g., Firdaria Lord = significator AND Primary Direction of that significator AND Profection to relevant house).
- **Good timing:** When 2+ techniques activate significators, or when 1 technique strongly activates (e.g., exact Primary Direction hit).
- **Moderate timing:** When only 1 technique activates, or when activation is weak (e.g., challenging aspect in Progression).
- **Poor timing:** When none of the significators are activated, or when significators are in very difficult condition (malefic aspects, weak dignity, cadent houses).

**Output Requirements:**
1. Identify the most favorable period(s) by synthesizing all 4 techniques.
2. Provide specific dates/ages for timing (from Primary Directions) and contextualize with the broader periods (Firdaria, Profection year).
3. Score each identified period (0-100) based on how many techniques activate the significators and whether the activation is positive or challenging.
4. Explain your reasoning: which techniques support this timing, which significators are activated, and what the condition of those significators is.`;

  if (category === "EXAM") {
    return baseInstruction + `

**Additional Guidance for EXAM:**
- If the question involves career-related exams (civil service, professional licensing), emphasize Ruler of 10th House and Sun.
- If it's academic exams (university, certifications), emphasize Mercury, Ruler of 3rd, and Ruler of 9th.`;
  }

  if (category === "MOVE") {
    return baseInstruction + `

**Additional Guidance for MOVE:**
- Prioritize Primary Direction hits **to IC (Imum Coeli)** as these are the strongest indicators for relocation.
- Ruler of 4th (home/real estate) and Ruler of 7th (contracts/relocation) are key.`;
  }

  if (category === "HEALTH") {
    return baseInstruction + `

**Additional Guidance for HEALTH:**
- Moon is the primary indicator for overall vitality and recovery.
- Saturn aspects indicate chronic conditions or slow recovery; Mars aspects indicate acute issues, inflammation, or surgery.
- Ruler of 6th (illness/treatment) and Ruler of 12th (mental health/hospitalization) are key.
- Challenging transits or progressions to Ascendant may indicate physical vulnerability periods.`;
  }

  if (category === "LOVE") {
    return baseInstruction + `

**Additional Guidance for LOVE:**
- Venus and Ruler of 7th House are primary indicators for relationships.
- Ruler of Lot of Marriage indicates marriage potential specifically.
- Moon aspects in Progression are especially important for emotional readiness and relationship timing.`;
  }

  if (category === "MONEY" || category === "WORK") {
    return baseInstruction + `

**Additional Guidance for ${category}:**
- Jupiter and benefic aspects generally indicate favorable periods for ${category === "MONEY" ? "wealth acquisition" : "career advancement"}.
- Check if the Lord of the Year (Profection) or Firdaria Lord has good essential dignity and favorable house placement.`;
  }

  return baseInstruction;
}

function ordinalHouse(house: number): string {
  const ordinals = [
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
    "7th",
    "8th",
    "9th",
    "10th",
    "11th",
    "12th",
  ];
  return ordinals[house - 1] ?? `${house}th`;
}

/** Sect/Dignity/Bonification/Maltreatment 점수를 읽기 쉬운 이유 문구로 변환 */
function formatScoreBreakdown(breakdown: {
  sect: number;
  essentialDignity: number;
  bonification: number;
  maltreatment: number;
}): string[] {
  const parts: string[] = [];
  if (breakdown.sect > 0) parts.push("Gained Sect");
  if (breakdown.essentialDignity > 0)
    parts.push("Essential Dignity (Domicile/Exaltation)");
  if (breakdown.bonification > 0) parts.push("Bonified by Ruler");
  if (breakdown.maltreatment < 0)
    parts.push(
      breakdown.maltreatment === -2
        ? "Maltreated by Malefic (mitigated by Sect)"
        : "Maltreated by Malefic"
    );
  return parts;
}
