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


// ============================================================
// 10년 시기추운 데이터 (v2 리포트)
// 기준일(리포트 발행일 KST)부터 향후 10년(11개 달력 연도, 첫/마지막 해는 부분 연도)의
// 시기 데이터를 연도별 텍스트 블록으로 만든다.
// 계층: 피르다리아(장기) → 디렉션/프로그레션(중기) → 프로펙션·솔라리턴(연간) → 월 구간(세부)
// ============================================================

import { SIGNS, getSignRuler, getWholeSignHouse } from "../get-fortune/utils/astrologyCalculator.ts";

const PROFECTION_HOUSE_TOPICS: Record<number, string> = {
  1: "자기 자신·방향 설정·몸",
  2: "수입·생계·자원",
  3: "학습·소통·가까운 이동·형제",
  4: "집·가족·거주 환경·기반",
  5: "창작·즐거움·자녀·표현",
  6: "실무·업무 부담·건강 관리",
  7: "관계·계약·파트너",
  8: "공동 자산·부채·큰 변동",
  9: "원거리 이동·학문·해외·신념",
  10: "직업·성취·사회적 지위",
  11: "네트워크·친구·미래 계획·수입 확장",
  12: "정리·휴식·보이지 않는 준비·소모",
};

interface ReportYearLabel {
  year: number;
  /** 부분 연도면 "9월~12월" 같은 커버 범위, 아니면 null */
  partial: string | null;
  /** "만 34~35세" */
  ages: string;
}

export interface TenYearTimingResult {
  baseYmd: string; // 기준일 YYYY-MM-DD (KST)
  startYear: number;
  endYear: number; // startYear + 10
  yearLabels: ReportYearLabel[];
  /** 프롬프트 주입용 연도별 데이터 블록 (전체) */
  buildYearsBlock: (years: number[]) => string;
}

function ymdKst(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().substring(0, 10);
}

function fmtYm(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonthsKeepDay(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export async function buildTenYearTimingData(
  base: ReportBaseData,
  snapshot: ProfileSnapshot,
  baseDate: Date,
): Promise<TenYearTimingResult> {
  const { chartData, birthDateTime } = base;
  const lat = Number(snapshot.lat);
  const lng = Number(snapshot.lng);
  const tzOpts = { lat, lng, timezone: snapshot.timezone ?? undefined };

  const baseYmd = ymdKst(baseDate);
  const baseKst = new Date(baseDate.getTime() + 9 * 3600 * 1000);
  const startYear = baseKst.getUTCFullYear();
  const startMonth = baseKst.getUTCMonth() + 1;
  const endYear = startYear + 10;
  // 마지막 해 커버 범위: 기준월 전달까지 (예: 2026.09 시작 → 2036.08 종료)
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;

  const birthYear = birthDateTime.getUTCFullYear();
  const natalAscSign = SIGNS[
    Math.floor((chartData.houses?.angles?.ascendant ?? 0) / 30) % 12
  ];
  const natalAscIndex = SIGNS.indexOf(natalAscSign);

  // 생일(UTC 기준 월/일) — 프로펙션/솔라리턴 연간 경계
  const birthMonth = birthDateTime.getUTCMonth(); // 0-based
  const birthDay = birthDateTime.getUTCDate();
  const birthdayOf = (y: number) => new Date(Date.UTC(y, birthMonth, birthDay, 12, 0, 0));

  // 만 나이 (해당 시점 기준)
  const ageAt = (d: Date) => {
    let a = d.getUTCFullYear() - birthYear;
    if (
      d.getUTCMonth() < birthMonth ||
      (d.getUTCMonth() === birthMonth && d.getUTCDate() < birthDay)
    ) a -= 1;
    return a;
  };

  // ---- 중기: 프라이머리 디렉션 & 프로그레션 (10년치, 이미 존재하는 계산 재사용) ----
  const currentAge = ageAt(baseDate);
  const directions = calculatePrimaryDirections(chartData, currentAge, birthDateTime);
  const progression = calculateProgressedEventsTimeline(chartData, currentAge, 11);

  // ---- 연간: 프로펙션 연차(생일~생일) 목록 ----
  interface ProfYear {
    age: number;
    from: Date; // 생일
    to: Date; // 다음 생일
    house: number;
    sign: string;
    lord: string;
  }
  const profYears: ProfYear[] = [];
  for (let a = currentAge; a <= currentAge + 11; a++) {
    const house = (a % 12) + 1;
    const signIdx = (natalAscIndex + (house - 1)) % 12;
    profYears.push({
      age: a,
      from: birthdayOf(birthYear + a),
      to: birthdayOf(birthYear + a + 1),
      house,
      sign: SIGNS[signIdx],
      lord: getSignRuler(SIGNS[signIdx]),
    });
  }

  // ---- 연간: 솔라리턴 요약 (프로펙션 연차별 1개) ----
  const srSummaries = new Map<number, string>(); // key: age
  for (const py of profYears) {
    if (py.from.getTime() > new Date(baseDate.getTime() + 10.2 * 365.25 * 86400000).getTime()) continue;
    try {
      const srYear = birthYear + py.age;
      const natalSunLon = chartData.planets.sun.degree;
      const srDateTime = calculateSolarReturnDateTime(birthDateTime, srYear, natalSunLon);
      const srTz = await resolveTimezoneOffsetHours(tzOpts, srDateTime);
      const srChart = await calculateChart(srDateTime, { lat, lng }, srTz);
      const natalAsc = chartData.houses.angles.ascendant;
      const srAscHouse = getWholeSignHouse(srChart.houses.angles.ascendant, natalAsc);
      const pieces: string[] = [
        `SR상승=${SIGNS[Math.floor(srChart.houses.angles.ascendant / 30) % 12]}(네이탈 ${srAscHouse}H)`,
      ];
      for (const key of ["sun", "jupiter", "saturn", "mars"] as const) {
        const p = srChart.planets[key];
        if (p) pieces.push(`SR ${key}→${getWholeSignHouse(p.degree, natalAsc)}H`);
      }
      srSummaries.set(py.age, pieces.join(", "));
    } catch (_) {
      // SR 실패는 생략
    }
  }

  // ---- 장기: 피르다리아 (분기 샘플링으로 기간 수집) ----
  interface FirdItem { major: string; sub: string | null; from: Date; to: Date }
  const firdSeen = new Map<string, FirdItem>();
  for (let y = startYear; y <= endYear; y++) {
    for (const m of [1, 4, 7, 10]) {
      const sample = new Date(Date.UTC(y, m, 15));
      if (sample < baseDate || sample > birthdayOf(startYear + 10)) {
        if (y !== startYear && y !== endYear) continue;
      }
      try {
        const f = calculateFirdaria(birthDateTime, { lat, lng }, sample);
        const key = `${f.majorLord}/${f.subLord ?? "-"}`;
        if (!firdSeen.has(key)) {
          firdSeen.set(key, {
            major: f.majorLord,
            sub: f.subLord,
            from: f.subPeriodStart ?? f.majorPeriodStart,
            to: f.subPeriodEnd ?? f.majorPeriodEnd,
          });
        }
      } catch (_) { /* 무시 */ }
    }
  }

  // ---- 세부: 월 프로펙션 주목 구간 ----
  // 각 프로펙션 연차를 12개 월 구간으로 나누고(생일 일자 앵커),
  // 월 사인이 연 사인과 같거나(첫 달), 월 로드=연주, 또는 월 사인이 앵글 하우스(1·4·7·10)일 때 주목 구간으로 표시.
  function monthlyHighlights(py: ProfYear): string[] {
    const annualIdx = SIGNS.indexOf(py.sign);
    const out: string[] = [];
    for (let m = 0; m < 12; m++) {
      const wFrom = addMonthsKeepDay(py.from, m);
      const wTo = addMonthsKeepDay(py.from, m + 1);
      const signIdx = (annualIdx + m) % 12;
      const sign = SIGNS[signIdx];
      const lord = getSignRuler(sign);
      const houseFromAsc = ((signIdx - natalAscIndex + 12) % 12) + 1;
      const isAngle = houseFromAsc === 1 || houseFromAsc === 4 || houseFromAsc === 7 || houseFromAsc === 10;
      const sameLord = lord === py.lord;
      if (m === 0 || sameLord || isAngle) {
        const fk = new Date(wFrom.getTime() + 9 * 3600 * 1000);
        const tk = new Date(wTo.getTime() + 9 * 3600 * 1000 - 86400000);
        out.push(
          `${fk.getUTCFullYear()}.${fk.getUTCMonth() + 1}.${fk.getUTCDate()}~${tk.getUTCFullYear()}.${tk.getUTCMonth() + 1}.${tk.getUTCDate()}` +
          ` (월테마 ${houseFromAsc}H${sameLord ? ", 연주와 같은 별" : ""}${isAngle ? ", 축 구간" : ""})`,
        );
      }
    }
    return out;
  }

  // ---- 연도 라벨 ----
  const yearLabels: ReportYearLabel[] = [];
  for (let y = startYear; y <= endYear; y++) {
    let partial: string | null = null;
    if (y === startYear) partial = `${startMonth}월~12월`;
    if (y === endYear) partial = `1월~${endMonth}월`;
    const a1 = ageAt(new Date(Date.UTC(y, 0, 15)));
    const a2 = ageAt(new Date(Date.UTC(y, 11, 15)));
    yearLabels.push({
      year: y,
      partial,
      ages: a1 === a2 ? `만 ${a1}세` : `만 ${a1}~${a2}세`,
    });
  }

  // ---- 연도별 블록 조립 ----
  function buildYearsBlock(years: number[]): string {
    const lines: string[] = [];
    lines.push(`[연도별 시기 데이터] (기준일 ${baseYmd}, 커버 범위 ${startYear}.${String(startMonth).padStart(2, "0")} ~ ${endYear}.${String(endMonth).padStart(2, "0")})`);
    lines.push(
      `※ 판단 계층: 장주기(수년 단위 배경) > 중기 지표(디렉션·프로그레션) > 연간 테마(프로펙션·솔라리턴) > 월 구간.` +
      ` 여러 층이 같은 주제를 가리킬 때만 강한 해로 서술하고, 한 층에서만 신호가 있으면 가벼운 흐름으로 다뤄야 함.`,
    );
    for (const y of years) {
      const label = yearLabels.find((l) => l.year === y)!;
      lines.push("");
      lines.push(`■ ${y}년${label.partial ? ` (${label.partial}, 부분 연도)` : ""} — ${label.ages}`);

      // 프로펙션 연차 (해당 달력 연도와 겹치는 것)
      const overlapping = profYears.filter(
        (p) => p.from.getUTCFullYear() === y || p.to.getUTCFullYear() === y,
      );
      for (const p of overlapping) {
        const covers =
          p.from.getUTCFullYear() === y
            ? `${p.from.getUTCMonth() + 1}/${p.from.getUTCDate()}~연말`
            : `연초~${p.to.getUTCMonth() + 1}/${p.to.getUTCDate()}`;
        lines.push(
          `- 연간 테마(${covers}): ${p.house}하우스(${PROFECTION_HOUSE_TOPICS[p.house]}), 사인 ${p.sign}, 연주 ${p.lord}` +
          (srSummaries.has(p.age) ? ` | 그해 리턴: ${srSummaries.get(p.age)}` : ""),
        );
        const hl = monthlyHighlights(p).filter((s) => s.startsWith(`${y}.`));
        if (hl.length > 0) lines.push(`  · 월 주목 구간: ${hl.join(" / ")}`);
      }

      // 장주기 (해당 연도와 겹치는 피르다리아 서브 기간)
      const firdInYear = [...firdSeen.values()].filter(
        (f) => f.from.getUTCFullYear() <= y && f.to.getUTCFullYear() >= y,
      );
      if (firdInYear.length > 0) {
        lines.push(
          `- 장주기 흐름: ` +
          firdInYear
            .map((f) => `${f.major}${f.sub ? `/${f.sub}` : ""} (${fmtYm(f.from)}~${fmtYm(f.to)})`)
            .join(", "),
        );
      }

      // 중기: 디렉션 히트
      const dirHits = directions.filter((d) => d.year === y);
      if (dirHits.length > 0) {
        lines.push(
          `- 대사건 지표(디렉션, 강한 신호): ` +
          dirHits.map((d) => `${d.eventDate} ${d.pair}${d.type === "Converse" ? "(역방향)" : ""}`).join(", "),
        );
      }

      // 중기: 프로그레스드 문
      const prog = progression.find((p) => p.year === y);
      if (prog && prog.events.length > 0) {
        lines.push(`- 심리·환경 흐름(프로그레션): ${prog.events.join(", ")}`);
      }
    }
    return lines.join("\n");
  }

  return { baseYmd, startYear, endYear, yearLabels, buildYearsBlock };
}

/** 연도별 파트(2·3)용 콤팩트 네이탈 요약 — 전체 상세 블록 대신 핵심만 (토큰 절약 + 초점 유지) */
export function buildCompactNatalBlock(base: ReportBaseData, snapshot: ProfileSnapshot): string {
  const { chartData, genderCode } = base;
  const lines: string[] = ["[출생 차트 핵심 요약]"];
  lines.push(
    `- 내담자: ${snapshot.name ?? ""} (${snapshot.gender ?? ""}), ${String(snapshot.birth_date).substring(0, 10)} ${snapshot.birth_time ?? ""} ${snapshot.city_name ?? ""}`,
  );
  const asc = chartData.houses.angles.ascendant;
  const mc = chartData.houses.angles.midheaven;
  lines.push(`- 상승점 ${SIGNS[Math.floor(asc / 30) % 12]}, MC ${SIGNS[Math.floor(mc / 30) % 12]}`);
  for (const [name, p] of Object.entries(chartData.planets)) {
    lines.push(`- ${name.toUpperCase()}: ${p.sign} ${p.degreeInSign.toFixed(1)}° (WS ${p.house}H${p.isRetrograde ? ", 역행" : ""})`);
  }
  lines.push(`- Fortuna: ${chartData.fortuna.sign} (WS ${chartData.fortuna.house}H)`);
  if (chartData.temperament) {
    lines.push(`- 기질: ${chartData.temperament.label} (열${chartData.temperament.hot}/한${chartData.temperament.cold}/습${chartData.temperament.wet}/건${chartData.temperament.dry})`);
  }
  if (chartData.almutens) {
    const a = chartData.almutens;
    lines.push(`- 알무텐: Asc ${a.ascendant ?? "-"}, Sun ${a.sun ?? "-"}, Moon ${a.moon ?? "-"}, Fortune ${a.fortune ?? "-"}, 지향점 ${a.aim ?? "-"}`);
  }
  try {
    const career = analyzeCareerPotential(chartData);
    const best = career.candidates.length > 0
      ? career.candidates.reduce((x: any, b: any) => (b.score > x.score ? b : x))
      : null;
    if (best) lines.push(`- 직업 지표성: ${best.planetName} (${best.role})`);
  } catch (_) { /* 무시 */ }
  try {
    const lot = calculateLotOfMarriage(chartData, genderCode);
    lines.push(`- 결혼의 랏: ${lot.sign}`);
  } catch (_) { /* 무시 */ }
  return lines.join("\n");
}
