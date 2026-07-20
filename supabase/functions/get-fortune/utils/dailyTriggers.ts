/**
 * 데일리 Phase 2 트리거 — 천체력(astronomy-engine) 기반 이벤트 신호.
 * 방법론(../astrology 트랜짓·시기추론): 일월식·시저지·정지·MPD→SR→트랜짓 달.
 * 각 트리거는 DailySpotlightSignal로 반환되어 computeDailySpotlight의 점수에 합산된다.
 *
 * ⚠️ 행성 황경은 순간(UTC)에만 의존하므로 SR 차트는 offset 0으로 계산해도 정확.
 *    (ASC/하우스는 tz 의존이라 여기선 사용하지 않음)
 */
import {
  EclipticGeoMoon,
  SearchMoonPhase,
  SearchGlobalSolarEclipse,
  SearchLunarEclipse,
} from "npm:astronomy-engine@2.1.19";
import {
  getSignFromLongitude,
  calculateSolarReturnDateTime,
  getActiveSolarReturnYear,
  calculateChart,
  getPlanetLongitudeAndSpeed,
  normalizeDegrees,
} from "./astrologyCalculator.ts";
import type { ChartData, Location } from "../types.ts";
import type { DailySpotlightSignal } from "./dailySpotlight.ts";

const DAY_MS = 86400000;
const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
/** 정지 트리거 대상: 사회·외행성 (달·수·금·태양은 너무 빠르거나 정지 개념 약함) */
const STATION_BODIES = ["mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const OUTER_OR_SATURN = new Set(["saturn", "uranus", "neptune", "pluto"]);

/** 0~180 각거리 */
function angDist(a: number, b: number): number {
  let d = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  if (d > 180) d = 360 - d;
  return d;
}
/** 축(회합 또는 대립) 최소 거리 — 일월식·시저지는 축으로 작동 */
function axisDist(a: number, b: number): number {
  return Math.min(angDist(a, b), angDist(a, b + 180));
}

export interface NatalPointLons {
  Sun: number;
  Moon: number;
  Ascendant: number;
  Midheaven: number;
  PartOfFortune: number;
}

export interface DailyTriggerInput {
  targetDate: Date;
  location: Location;
  birthDate: Date;
  natalSunLon: number;
  natalPoints: NatalPointLons;
  natalPlanets: ChartData["planets"];
  annualProfectionSign: string;
  lordName: string;
  lordLon: number;
  transitMoonLon: number;
}

const PLANET_KEY: Record<string, string> = {
  Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus",
  Mars: "mars", Jupiter: "jupiter", Saturn: "saturn",
};

/** 하일렉/앵글 포인트를 [라벨, 황경] 배열로 */
function hylegList(np: NatalPointLons, lordName: string, lordLon: number): Array<[string, number]> {
  return [
    ["태양", np.Sun],
    ["달", np.Moon],
    ["상승점", np.Ascendant],
    ["천정(MC)", np.Midheaven],
    ["행운의 점", np.PartOfFortune],
    [`연주(${lordName})`, lordLon],
  ];
}

/** 1) 일월식: 대상일 ±16일 내 일월식이 네이탈 하일렉/앵글 축 ±8° 안에 걸리면 신호 */
function eclipseSignal(input: DailyTriggerInput): DailySpotlightSignal | null {
  const { targetDate, natalPoints, lordName, lordLon } = input;
  const start = new Date(targetDate.getTime() - 20 * DAY_MS);
  const candidates: Array<{ kind: string; peak: Date }> = [];
  try {
    const sol = SearchGlobalSolarEclipse(start);
    if (sol?.peak?.date) candidates.push({ kind: "일식", peak: sol.peak.date });
  } catch (_) { /* ignore */ }
  try {
    const lun = SearchLunarEclipse(start);
    if (lun?.peak?.date) candidates.push({ kind: "월식", peak: lun.peak.date });
  } catch (_) { /* ignore */ }

  let best: { kind: string; peak: Date; lon: number; label: string; dist: number } | null = null;
  const points = hylegList(natalPoints, lordName, lordLon);
  for (const c of candidates) {
    const dtDays = Math.abs(c.peak.getTime() - targetDate.getTime()) / DAY_MS;
    if (dtDays > 16) continue;
    const lon = EclipticGeoMoon(c.peak).lon; // 식 지점(달=사인 도수)
    for (const [label, pl] of points) {
      const d = axisDist(lon, pl);
      if (d <= 8 && (!best || d < best.dist)) {
        best = { kind: c.kind, peak: c.peak, lon, label, dist: d };
      }
    }
  }
  if (!best) return null;
  const weight = best.dist <= 4 ? 3 : best.dist <= 6 ? 2 : 1;
  const signDeg = getSignFromLongitude(best.lon);
  return {
    label: `${best.kind}(${signDeg.sign} ${signDeg.degreeInSign.toFixed(0)}°) → 네이탈 ${best.label} 축 타격`,
    weight,
    detail: `대상일 ${((best.peak.getTime() - input.targetDate.getTime()) / DAY_MS).toFixed(0)}일 부근 식, 축거리 ${best.dist.toFixed(1)}°. 일월식은 이 시기 최대 등급의 사건 트리거.`,
  };
}

/** 가장 최근(대상일 이전)의 특정 위상(0=신월,180=만월) 시각 */
function lastPhaseBefore(targetLon: number, targetDate: Date): Date | null {
  const startDate = new Date(targetDate.getTime() - 40 * DAY_MS);
  let t = SearchMoonPhase(targetLon, startDate, 45);
  let last: Date | null = null;
  let guard = 0;
  while (t && t.date.getTime() <= targetDate.getTime() && guard < 4) {
    last = t.date;
    t = SearchMoonPhase(targetLon, new Date(t.date.getTime() + DAY_MS), 45);
    guard++;
  }
  return last;
}

/** 2) 시저지(신월/만월): 가장 최근 시저지가 하일렉/연주와 축 ±3° 회합/대립이면 신호 */
function syzygySignal(input: DailyTriggerInput): DailySpotlightSignal | null {
  const { targetDate, natalPoints, lordName, lordLon } = input;
  let newDate: Date | null = null;
  let fullDate: Date | null = null;
  try { newDate = lastPhaseBefore(0, targetDate); } catch (_) { /* */ }
  try { fullDate = lastPhaseBefore(180, targetDate); } catch (_) { /* */ }
  // 더 최근의 시저지를 사용
  let syz: { date: Date; type: string } | null = null;
  if (newDate && (!fullDate || newDate.getTime() >= fullDate.getTime())) syz = { date: newDate, type: "신월" };
  else if (fullDate) syz = { date: fullDate, type: "만월" };
  if (!syz) return null;

  const lon = EclipticGeoMoon(syz.date).lon;
  const points = hylegList(natalPoints, lordName, lordLon);
  let hit: { label: string; dist: number } | null = null;
  for (const [label, pl] of points) {
    const d = axisDist(lon, pl);
    if (d <= 3 && (!hit || d < hit.dist)) hit = { label, dist: d };
  }
  if (!hit) return null;
  const signDeg = getSignFromLongitude(lon);
  return {
    label: `${syz.type}(${signDeg.sign} ${signDeg.degreeInSign.toFixed(0)}°) → 네이탈 ${hit.label} 축 회합/대립`,
    weight: 2,
    detail: `축거리 ${hit.dist.toFixed(1)}°. 시저지가 하일렉/연주를 때리면 그 자체로 이 달의 테마를 형성.`,
  };
}

/** 3) 정지(station): 사회·외행성이 대상일 ±4일 내 정지하며 네이탈 포인트 ±2°면 신호 */
function stationSignal(input: DailyTriggerInput): DailySpotlightSignal | null {
  const { targetDate, natalPoints, lordName, lordLon } = input;
  const points = hylegList(natalPoints, lordName, lordLon);
  let best: { body: string; lon: number; label: string; dist: number } | null = null;
  for (const key of STATION_BODIES) {
    try {
      const before = getPlanetLongitudeAndSpeed(key, new Date(targetDate.getTime() - 4 * DAY_MS));
      const after = getPlanetLongitudeAndSpeed(key, new Date(targetDate.getTime() + 4 * DAY_MS));
      if (before.speed === 0 || after.speed === 0) continue;
      if (before.speed * after.speed >= 0) continue; // 부호 변화 없음 = 정지 아님
      const at = getPlanetLongitudeAndSpeed(key, targetDate);
      for (const [label, pl] of points) {
        const d = angDist(at.longitude, pl);
        if (d <= 2 && (!best || d < best.dist)) {
          best = { body: key, lon: at.longitude, label, dist: d };
        }
      }
    } catch (_) { /* ignore body */ }
  }
  if (!best) return null;
  const bodyKo = getSignFromLongitude(best.lon);
  const heavy = OUTER_OR_SATURN.has(best.body);
  const weight = Math.min(2 + (heavy ? 1 : 0), 3);
  const bodyName = best.body.charAt(0).toUpperCase() + best.body.slice(1);
  return {
    label: `${bodyName} 정지(${bodyKo.sign} ${bodyKo.degreeInSign.toFixed(0)}°) → 네이탈 ${best.label} 유효각`,
    weight,
    detail: `정지 도수가 감응점 ±${best.dist.toFixed(1)}°. 정지는 변화의 물상화 지점.`,
  };
}

/** 4) MPD→SR→트랜짓 달: 월간 프로펙션 사인의 네이탈 행성 → 그 SR 도수를 트랜짓 달이 통과 */
async function mpdSrMoonSignal(input: DailyTriggerInput): Promise<DailySpotlightSignal | null> {
  const { targetDate, location, birthDate, natalSunLon, natalPlanets, annualProfectionSign, transitMoonLon } = input;
  try {
    const srYear = getActiveSolarReturnYear(birthDate, targetDate);
    const srDate = calculateSolarReturnDateTime(birthDate, srYear, natalSunLon);
    if (!(srDate instanceof Date) || isNaN(srDate.getTime())) return null;

    // 월간 프로펙션(MPD) 사인: 연간 프로펙션 사인에서 (SR 이후 개월수)만큼 순행
    const monthsSinceSR = Math.floor((targetDate.getTime() - srDate.getTime()) / (DAY_MS * (365.2422 / 12)));
    const monthIndex = ((monthsSinceSR % 12) + 12) % 12;
    const annualIdx = SIGN_NAMES.indexOf(annualProfectionSign);
    if (annualIdx < 0) return null;
    const mpdSign = SIGN_NAMES[(annualIdx + monthIndex) % 12];

    // MPD 사인에 있는 네이탈 행성
    const planetsInMpd: string[] = [];
    for (const [name, key] of Object.entries(PLANET_KEY)) {
      const p = (natalPlanets as Record<string, { sign?: string } | undefined>)?.[key];
      if (p?.sign === mpdSign) planetsInMpd.push(name);
    }
    if (planetsInMpd.length === 0) return null;

    // SR 차트 (행성 황경만 사용 → offset 0으로 충분)
    const srChart = await calculateChart(srDate, location, 0);
    let hit: { planet: string; dist: number; srLon: number } | null = null;
    for (const name of planetsInMpd) {
      const key = PLANET_KEY[name];
      const srP = (srChart.planets as Record<string, { degree?: number } | undefined>)?.[key];
      if (!srP || typeof srP.degree !== "number") continue;
      const d = angDist(transitMoonLon, srP.degree);
      if (d <= 3 && (!hit || d < hit.dist)) hit = { planet: name, dist: d, srLon: srP.degree };
    }
    if (!hit) return null;
    return {
      label: `트랜짓 달 → SR ${hit.planet} 도수 통과 (MPD ${mpdSign})`,
      weight: 2,
      detail: `이번 달 월간 프로펙션(${mpdSign})의 네이탈 ${hit.planet}이(가) SR에서 놓인 도수를 트랜짓 달이 ±${hit.dist.toFixed(1)}°로 통과 → ${hit.planet} 관련 사건 인동.`,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Phase 2 트리거 신호 전부 계산 (실패한 트리거는 건너뜀).
 */
export async function computeDailyTriggerSignals(
  input: DailyTriggerInput,
): Promise<DailySpotlightSignal[]> {
  const signals: DailySpotlightSignal[] = [];
  const push = (s: DailySpotlightSignal | null) => { if (s) signals.push(s); };

  push(eclipseSignal(input));
  push(syzygySignal(input));
  push(stationSignal(input));
  push(await mpdSrMoonSignal(input));

  return signals;
}
