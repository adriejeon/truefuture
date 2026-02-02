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
} from "./astrologyCalculator.ts";

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
 * DAILY 운세를 위한 User Prompt 생성 함수
 * Natal 차트, Transit 차트, 계산된 Aspect 정보를 포맷팅하여 반환합니다.
 */
export function generateDailyUserPrompt(
  natalData: ChartData,
  transitData: ChartData,
  aspects: Aspect[],
  transitMoonHouse: number
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Calculated Aspects - 주요 각도 관계]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${aspectsList || "  (오늘은 주요 Aspect가 형성되지 않았습니다)"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 두 사람의 차트 데이터를 기반으로 궁합을 분석해 주세요.
`.trim();
}

/**
 * 자유 질문(Consultation)용 Prediction Prompt 생성.
 * [📋 내담자 기본 정보], [🌌 Natal Chart], [Analysis Data] 순으로 구성합니다.
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
  loveAnalysis: LoveAnalysisData | null = null
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
  const planetLines = formatNatalPlanets(chartData);
  const seventhRuler = getSeventhHouseRuler(ascLong);
  sections.push(`[🌌 Natal Chart]
- Ascendant: ${ascDisplay}
${planetLines}
- 7th House Ruler: ${seventhRuler}`);

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
    "   * Note: Shows Direct hits to Angles/Luminaries within next 10 years."
  );
  if (directionResult.length > 0) {
    directionResult.forEach((hit) => {
      const match = hit.name.match(/^(.+?) -> (.+)$/);
      const promName = match ? match[1] : hit.name;
      const significator = match ? match[2] : "—";
      analysisParts.push(`   - ${hit.eventDate} (Age ${hit.age}): ${hit.name}`);
      analysisParts.push(
        `     * Interpretation: "${significator}의 영역(직업/가정/본신)에 ${promName}의 사건이 발생합니다."`
      );
    });
  } else {
    analysisParts.push("   - No major direction events in the next 10 years.");
  }

  sections.push(`[Analysis Data]
${analysisParts.join("\n")}`);

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
    sections.push(`[🏛️ Career Potential Analysis (Method: POF & MC)]
- Best Career Planet: ${best.planetName} (Score: ${best.score})
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
  * Status: ${rulerStatusText}
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

  sections.push(`[📚 Knowledge Base (from Neo4j)]
${(graphKnowledge ?? "").trim() || "(없음)"}
Instruction: 이 섹션은 DB에서 가져온 검증된 점성학 지식입니다. 해석 시 이 키워드와 의미를 우선적으로 참고하세요.`);

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

/** chartData.planets에서 Sun, Moon, Venus, Mars, Jupiter, Saturn을 "Sun: Scorpio (11th House)" 형식으로 */
function formatNatalPlanets(chartData: ChartData): string {
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
  const lines: string[] = [];
  for (const key of order) {
    const p = planets[key];
    if (!p) continue;
    const houseOrd = ordinalHouse(p.house);
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    lines.push(`- ${name}: ${p.sign} (${houseOrd} House)`);
  }
  return lines.join("\n");
}

/** Whole Sign 기준 7하우스 쿠스프의 별자리 주인(행성) 반환 */
function getSeventhHouseRuler(ascendantLongitude: number): string {
  const seventhCuspLong = (ascendantLongitude + 180) % 360;
  const seventhSign = getSignFromLongitude(seventhCuspLong).sign;
  return getSignRuler(seventhSign);
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
