// 프리미엄 상세 리포트 - 차트/시기 데이터 → 프롬프트 빌더
// (get-fortune 계산층 재사용. index.ts 와 로컬 검증 스크립트가 공용으로 import)

import type { ChartData } from "../get-fortune/types.ts";
import { FortuneType } from "../get-fortune/types.ts";
import {
  calculateChart,
  getSignFromLongitude,
  calculateProfection,
  calculateProfectionTimeline,
  calculateSolarReturnDateTime,
  getActiveSolarReturnYear,
  getSolarReturnOverlays,
  calculateFirdaria,
  analyzeLordInteraction,
  calculateSecondaryProgression,
  calculatePrimaryDirections,
  calculateProgressedEventsTimeline,
  analyzeCareerPotential,
  analyzeWealthPotential,
  analyzeHealthPotential,
  calculateLotOfMarriage,
  analyzeLoveQualities,
  identifySpouseCandidate,
  analyzeLoveTiming,
} from "../get-fortune/utils/astrologyCalculator.ts";
import {
  generateLifetimeUserPrompt,
  generatePredictionPrompt,
} from "../get-fortune/utils/chartFormatter.ts";
import {
  analyzeNatalFixedStars,
  formatNatalFixedStarsForPrompt,
} from "../get-fortune/utils/advancedAstrology.ts";
import {
  getNeo4jContext,
  isDayChartFromSun,
} from "../get-fortune/utils/neo4jContext.ts";
import { resolveTimezoneOffsetHours } from "../get-fortune/utils/timezoneUtils.ts";
import { buildKnowledgeContext } from "../get-fortune/utils/knowledgeBase.ts";
import {
  scanShortTermEvents,
  formatShortTermEventsForPrompt,
} from "../get-fortune/utils/predictiveScanner.ts";

const DIGNITY_SECTION_HEADER =
  "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[차트 위계/섹트/헤이즈 해석]\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

// ===== 출생 정보 → 차트 데이터 =====

export interface ProfileSnapshot {
  name: string;
  birth_date: string; // "YYYY-MM-DDTHH:mm:ss" (출생지 로컬 시각)
  birth_time: string | null;
  gender: string | null;
  city_name: string | null;
  lat: number;
  lng: number;
  timezone: string | null;
}

export interface ReportBaseData {
  birthDateTime: Date;
  birthDateStr: string;
  age: number;
  chartData: ChartData;
  genderCode: "M" | "F";
}

/** 스냅샷의 출생지 로컬 시각 → UTC Date + 네이탈 차트 계산 (get-fortune CONSULTATION 흐름과 동일) */
export async function buildBaseData(snapshot: ProfileSnapshot): Promise<ReportBaseData> {
  const birthDateStr = String(snapshot.birth_date || "").substring(0, 19);
  const dateMatch = birthDateStr.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!dateMatch) {
    throw new Error("프로필의 생년월일 형식이 올바르지 않습니다.");
  }
  const [, year, month, day, hour, minute, second] = dateMatch;
  const lat = Number(snapshot.lat);
  const lng = Number(snapshot.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("프로필의 출생지 좌표가 올바르지 않습니다.");
  }

  const tzOpts = { lat, lng, timezone: snapshot.timezone ?? undefined };
  // 출생일 정오 기준으로 타임존 오프셋 조회 (DST 안전)
  const noonApprox = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0),
  );
  const birthCityOffsetHours = await resolveTimezoneOffsetHours(tzOpts, noonApprox);
  const localAsUtcTimestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const birthDateTime = new Date(
    localAsUtcTimestamp - birthCityOffsetHours * 60 * 60 * 1000,
  );
  if (!Number.isFinite(birthDateTime.getTime())) {
    throw new Error("출생 시각 계산에 실패했습니다.");
  }

  const natalTzOffset = await resolveTimezoneOffsetHours(tzOpts, birthDateTime);
  const chartData = await calculateChart(birthDateTime, { lat, lng }, natalTzOffset);

  // 만 나이
  const now = new Date();
  let age = now.getUTCFullYear() - birthDateTime.getUTCFullYear();
  const bMonth = birthDateTime.getUTCMonth();
  const bDay = birthDateTime.getUTCDate();
  if (
    now.getUTCMonth() < bMonth ||
    (now.getUTCMonth() === bMonth && now.getUTCDate() < bDay)
  ) {
    age -= 1;
  }
  age = Math.max(0, age);

  const genderCode: "M" | "F" =
    snapshot.gender === "여자" || snapshot.gender === "F" || snapshot.gender === "female"
      ? "F"
      : "M";

  return { birthDateTime, birthDateStr, age, chartData, genderCode };
}

/** Part 1·2 공용 베이스 프롬프트: 네이탈 상세 + 지표성 + 위계/섹트 + 지식베이스 */
export function buildNatalBasePrompt(base: ReportBaseData, snapshot: ProfileSnapshot): string {
  const { chartData, genderCode, birthDateStr } = base;

  let prompt = generateLifetimeUserPrompt(chartData);

  // 내담자 메타 정보 (이름·성별·출생지 라벨)
  prompt =
    `[내담자 프로필]\n` +
    `- 이름: ${snapshot.name ?? "내담자"}\n` +
    `- 성별: ${snapshot.gender ?? "미상"}\n` +
    `- 출생지: ${snapshot.city_name ?? `위도 ${snapshot.lat}, 경도 ${snapshot.lng}`}\n\n` +
    prompt;

  // 지표성 계산 (연애/직업/재물/건강) — get-fortune LIFETIME 흐름과 동일
  let analysisData = "";
  try {
    const lotOfMarriage = calculateLotOfMarriage(chartData, genderCode);
    const loveQualities = analyzeLoveQualities(chartData);
    const spouseCandidate = identifySpouseCandidate(chartData, genderCode);
    analysisData += "\n\n## 연애/결혼 지표성\n";
    analysisData += `- Lot of Marriage: ${lotOfMarriage.sign} ${Math.round(lotOfMarriage.longitude)}°\n`;
    analysisData += `- Love Quality Score: ${loveQualities.score} (${loveQualities.statusDescription})\n`;
    analysisData += `- Best Spouse Candidate: ${spouseCandidate.bestSpouseCandidate}\n`;
    analysisData += `- Candidate Scores: ${Object.entries(spouseCandidate.scores)
      .filter(([, score]) => (score as number) > 0)
      .map(([planet, score]) => `${planet}(${score})`)
      .join(", ")}\n`;
  } catch (e) {
    console.warn("⚠️ 연애 지표성 계산 실패 (무시):", e);
  }

  try {
    const careerAnalysis = analyzeCareerPotential(chartData);
    const bestCareer =
      careerAnalysis.candidates.length > 0
        ? careerAnalysis.candidates.reduce((a: any, b: any) => (b.score > a.score ? b : a))
        : null;
    analysisData += "\n## 직업 지표성\n";
    analysisData += `- POF Sign: ${careerAnalysis.pofSign}\n`;
    analysisData += `- Best Candidate: ${bestCareer?.planetName ?? "—"} (${bestCareer?.role ?? "—"}, score ${bestCareer?.score ?? 0})\n`;
    analysisData += `- Candidates: ${careerAnalysis.candidates.map((c: any) => `${c.planetName}(${c.role})`).join(", ") || "—"}\n`;
  } catch (e) {
    console.warn("⚠️ 직업 지표성 계산 실패 (무시):", e);
  }

  try {
    const wealthAnalysis = analyzeWealthPotential(chartData);
    analysisData += "\n## 금전 지표성\n";
    analysisData += `- Acquisition Sign: ${wealthAnalysis.acquisitionSign}\n`;
    analysisData += `- Ruler: ${wealthAnalysis.ruler.planetName} (score ${wealthAnalysis.ruler.score})\n`;
    analysisData += `- Occupants: ${wealthAnalysis.occupants.map((o: any) => o.planetName).join(", ") || "—"}\n`;
  } catch (e) {
    console.warn("⚠️ 금전 지표성 계산 실패 (무시):", e);
  }

  try {
    const healthAnalysis = analyzeHealthPotential(chartData);
    analysisData += "\n## 건강 지표성\n";
    analysisData += `- Overall Score: ${healthAnalysis.overallScore}/10\n`;
    analysisData += `- Moon Affliction: ${healthAnalysis.moonHealth.isAfflicted ? "Yes" : "No"}\n`;
    analysisData += `- Mental Health Risk: ${healthAnalysis.mentalHealth.riskLevel}\n`;
    analysisData += `- Physical Health Risk: ${healthAnalysis.physicalHealth.riskLevel}\n`;
    analysisData += `- Congenital Issues: ${healthAnalysis.congenitalIssues.hasRisk ? "Yes" : "No"}${healthAnalysis.congenitalIssues.bodyParts.length > 0 ? ` (취약 부위: ${healthAnalysis.congenitalIssues.bodyParts.join(", ")})` : ""}\n`;
    analysisData += `- Summary: ${healthAnalysis.summary}\n`;
  } catch (e) {
    console.warn("⚠️ 건강 지표성 계산 실패 (무시):", e);
  }

  prompt += analysisData;

  // 위계/섹트/헤이즈 해석 컨텍스트
  try {
    const isDayChart = isDayChartFromSun(chartData?.planets ?? null);
    const neo4jContext = getNeo4jContext(chartData?.planets ?? null, isDayChart);
    if (neo4jContext) {
      prompt += DIGNITY_SECTION_HEADER + neo4jContext;
    }
  } catch (e) {
    console.warn("⚠️ 위계 컨텍스트 생성 실패 (무시):", e);
  }

  // 네이탈 항성 회합 (전 테마)
  try {
    const natalStars = analyzeNatalFixedStars(chartData, birthDateStr);
    if (natalStars.length > 0) {
      prompt += "\n\n" + formatNatalFixedStarsForPrompt(natalStars, { includeHealth: true });
    }
  } catch (e) {
    console.warn("⚠️ 항성 분석 실패 (무시):", e);
  }

  // 해석 지식베이스 (LIFETIME 규칙 전체)
  try {
    const knowledgeContext = buildKnowledgeContext(chartData, FortuneType.LIFETIME);
    if (knowledgeContext) {
      prompt += "\n\n" + knowledgeContext;
    }
  } catch (e) {
    console.warn("⚠️ 지식베이스 주입 실패 (무시):", e);
  }

  return prompt;
}

/** Part 3 전용: 시기 추론 데이터 프롬프트 (피르다리·프로펙션·디렉션·프로그레션·솔라리턴·단기 스캔) */
export async function buildTimingPrompt(
  base: ReportBaseData,
  snapshot: ProfileSnapshot,
): Promise<string> {
  const { chartData, birthDateTime, birthDateStr, age, genderCode } = base;
  const lat = Number(snapshot.lat);
  const lng = Number(snapshot.lng);
  const tzOpts = { lat, lng, timezone: snapshot.timezone ?? undefined };
  const now = new Date();

  // 1. Firdaria
  const firdariaResult = calculateFirdaria(birthDateTime, { lat, lng }, now);
  const isNode =
    firdariaResult.majorLord === "NorthNode" ||
    firdariaResult.majorLord === "SouthNode";
  const interactionResult =
    !isNode && firdariaResult.subLord
      ? analyzeLordInteraction(chartData, firdariaResult.majorLord, firdariaResult.subLord)
      : null;

  // 2. Secondary Progression + 3. Primary Directions
  const progressionResult = calculateSecondaryProgression(chartData, age);
  const directionResult = calculatePrimaryDirections(chartData, age, birthDateTime);

  // 4. Annual Profection + 10년 타임라인
  const natalAscSign = getSignFromLongitude(
    chartData.houses?.angles?.ascendant ?? 0,
  ).sign;
  const profectionData = calculateProfection(birthDateTime, now, natalAscSign, false);
  const progressionTimeline = calculateProgressedEventsTimeline(chartData, age, 10);
  const profectionTimeline = calculateProfectionTimeline(chartData, age, 10);

  // 5. Solar Return (생시 기반)
  let solarReturnChartData: ChartData | undefined;
  let solarReturnOverlay: any | undefined;
  try {
    const solarReturnYear = getActiveSolarReturnYear(birthDateTime, now);
    const natalSunLongitude = chartData.planets.sun.degree;
    const solarReturnDateTime = calculateSolarReturnDateTime(
      birthDateTime,
      solarReturnYear,
      natalSunLongitude,
    );
    const srTzOffset = await resolveTimezoneOffsetHours(tzOpts, solarReturnDateTime);
    solarReturnChartData = await calculateChart(
      solarReturnDateTime,
      { lat, lng },
      srTzOffset,
    );
    solarReturnOverlay = getSolarReturnOverlays(chartData, solarReturnChartData);
  } catch (srErr) {
    console.warn("⚠️ Solar Return 계산 실패 (무시하고 진행):", srErr);
  }

  // 6. 현재 트랜짓 차트
  let transitChart: ChartData | undefined;
  try {
    const transitTzOffset = await resolveTimezoneOffsetHours(tzOpts, now);
    transitChart = await calculateChart(now, { lat, lng }, transitTzOffset);
  } catch (_) {
    // 무시
  }

  // 7. 지표성 분석 (질문 유무와 무관하게 종합 리포트이므로 전 영역 계산)
  let careerAnalysis: any = null;
  let wealthAnalysis: any = null;
  let loveAnalysis: any = null;
  try {
    careerAnalysis = analyzeCareerPotential(chartData);
  } catch (_) { /* 무시 */ }
  try {
    wealthAnalysis = analyzeWealthPotential(chartData);
  } catch (_) { /* 무시 */ }
  try {
    const lotOfMarriage = calculateLotOfMarriage(chartData, genderCode);
    const loveQualities = analyzeLoveQualities(chartData);
    const spouseCandidate = identifySpouseCandidate(chartData, genderCode);
    const loveTiming = analyzeLoveTiming(
      chartData,
      age,
      spouseCandidate.bestSpouseCandidate,
      genderCode,
      {
        firdariaResult,
        progressionResult,
        directionHits: directionResult,
      },
    );
    loveAnalysis = {
      lotOfMarriage,
      loveQualities,
      spouseCandidate,
      loveTiming,
      profectionSign: profectionData.profectionSign,
    };
  } catch (_) { /* 무시 */ }

  let prompt = generatePredictionPrompt(
    chartData,
    birthDateStr,
    { lat, lng },
    firdariaResult,
    interactionResult,
    progressionResult,
    directionResult,
    "",
    careerAnalysis,
    wealthAnalysis,
    loveAnalysis,
    "GENERAL",
    profectionData,
    progressionTimeline,
    profectionTimeline,
    solarReturnChartData,
    solarReturnOverlay,
    transitChart,
  );

  // 8. 향후 6개월 단기 이벤트 스캔
  try {
    const scanResult = scanShortTermEvents(chartData, now, 6);
    prompt += "\n\n" + formatShortTermEventsForPrompt(scanResult);
  } catch (scanErr) {
    console.warn("⚠️ 단기 이벤트 스캔 실패 (무시):", scanErr);
  }

  return prompt;
}

