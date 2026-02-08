/**
 * 6개월 단기 예보 스캔
 * - Time Lord(Profection Ruler)와 항성 회합 (대길운)
 * - 화성/목성/토성 역행·정지 및 Natal 앵글·루미너리와의 유효각
 */

import { MakeTime } from "npm:astronomy-engine@2.1.19";
import type { ChartData, ProfectionData } from "../types.ts";
import {
  calculateProfection,
  getSignFromLongitude,
  getPlanetLongitude,
  getPlanetRetrogradeAndSpeed,
  normalizeDegrees,
  PLANETS,
} from "./astrologyCalculator.ts";
import {
  FIXED_STARS,
  checkStarTransit,
  type PlanetKey,
} from "./advancedAstrology.ts";

const STEP_DAYS = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 속도 부호가 바뀌는 구간(windowStart ~ windowEnd)을 1일 간격으로 스캔하여
 * |속도|가 최소인 날(정지에 가장 가까운 날)을 YYYY-MM-DD로 반환.
 */
function findStationDateInWindow(
  body: unknown,
  windowStart: Date,
  windowEnd: Date
): string {
  let minAbsSpeed = Infinity;
  let stationDateStr = windowStart.toISOString().split("T")[0];

  for (
    let t = windowStart.getTime();
    t <= windowEnd.getTime();
    t += ONE_DAY_MS
  ) {
    const d = new Date(t);
    const time = MakeTime(d);
    const motion = getPlanetRetrogradeAndSpeed(body, time, d);
    const absSpeed = Math.abs(motion.speed);
    if (absSpeed < minAbsSpeed) {
      minAbsSpeed = absSpeed;
      stationDateStr = d.toISOString().split("T")[0];
    }
  }

  return stationDateStr;
}

/** 행성명 → 차트 키 */
const LORD_NAME_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
};

/** 역행/정지 스캔 대상 (화성, 목성, 토성) */
const OUTER_PLANET_KEYS = ["mars", "jupiter", "saturn"] as const;

export interface ShortTermEvent {
  date: string;
  type: "TimeLordFixedStar" | "StationRetrograde" | "StationDirect";
  planet?: string;
  starName?: string;
  description: string;
  aspectToNatal?: string;
}

/** 타임로드 역행 기간 (Start ~ End) */
export interface TimeLordRetrogradePeriodItem {
  start: string;
  end: string;
  type: "Retrograde";
}

/** 타임로드 정지(Station) — High Alert 날짜 */
export interface TimeLordStationItem {
  date: string;
  type: "Station (Stopping)" | "Station (Direct)";
  effect: string;
}

export type TimeLordUpcomingItem =
  | TimeLordRetrogradePeriodItem
  | TimeLordStationItem;

export interface TimeLordRetrogradeResult {
  planet: string;
  isCurrentlyRetrograde: boolean;
  upcomingPeriods: TimeLordUpcomingItem[];
}

export interface ScanShortTermResult {
  events: ShortTermEvent[];
  timeLordRetrograde: TimeLordRetrogradeResult | null;
}

/**
 * 두 황경이 유효각(Conjunction, Opposition, Square)을 맺는지 판별
 */
function getAspectToAngle(
  transitLon: number,
  natalLon: number
): "Conjunction" | "Opposition" | "Square" | null {
  const diff = Math.abs(normalizeDegrees(transitLon - natalLon));
  const sep = diff > 180 ? 360 - diff : diff;
  if (sep <= 8) return "Conjunction";
  if (Math.abs(sep - 180) <= 8) return "Opposition";
  if (Math.abs(sep - 90) <= 6 || Math.abs(sep - 270) <= 6) return "Square";
  return null;
}

/**
 * 향후 6개월간 단기 이벤트 스캔
 * - Time Lord가 항성과 회합하는 시기
 * - 타임로드 역행 기간(Start~End) 및 정지(Station) High Alert
 * - 화성/목성/토성의 정지·역행 및 Natal 앵글·루미너리 유효각
 */
export function scanShortTermEvents(
  natalChart: ChartData,
  startDate: Date,
  months: number = 6
): ScanShortTermResult {
  const events: ShortTermEvent[] = [];
  const birthDate = new Date(natalChart.date);
  const ascLon = natalChart.houses?.angles?.ascendant ?? 0;
  const mcLon = natalChart.houses?.angles?.midheaven ?? 0;
  const natalAscSign = getSignFromLongitude(ascLon).sign;
  const sunLon = natalChart.planets?.sun?.degree ?? 0;
  const moonLon = natalChart.planets?.moon?.degree ?? 0;

  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + months);

  const profectionData: ProfectionData = calculateProfection(
    birthDate,
    startDate,
    natalAscSign,
    false
  );
  const lordName = profectionData.lordOfTheYear;
  const lordKey = LORD_NAME_TO_KEY[lordName];
  const timeLordBody = lordKey ? (PLANETS as Record<string, unknown>)[lordKey] : null;

  let timeLordRetrograde: TimeLordRetrogradeResult | null = null;
  const upcomingPeriods: TimeLordUpcomingItem[] = [];
  let prevTimeLordSpeed: number | undefined;
  let isCurrentlyRetrograde = false;
  if (timeLordBody) {
    const startTime = MakeTime(startDate);
    const startMotion = getPlanetRetrogradeAndSpeed(timeLordBody, startTime, startDate);
    isCurrentlyRetrograde = startMotion.speed < 0;
    prevTimeLordSpeed = startMotion.speed;
  }

  const natalAngles = [
    { name: "Asc", lon: ascLon },
    { name: "MC", lon: mcLon },
    { name: "Sun", lon: sunLon },
    { name: "Moon", lon: moonLon },
  ];

  let prevSpeeds: Record<string, number> = {};
  const stepMs = STEP_DAYS * 24 * 60 * 60 * 1000;

  for (
    let t = startDate.getTime();
    t < endDate.getTime();
    t += stepMs
  ) {
    const stepDate = new Date(t);
    const dateStr = stepDate.toISOString().split("T")[0];

    if (timeLordBody) {
      const time = MakeTime(stepDate);
      const lordLon = getPlanetLongitude(timeLordBody, time);
      const lordMotion = getPlanetRetrogradeAndSpeed(timeLordBody, time, stepDate);

      if (prevTimeLordSpeed !== undefined) {
        if (prevTimeLordSpeed > 0 && lordMotion.speed < 0) {
          const windowStart = new Date(
            stepDate.getTime() - STEP_DAYS * ONE_DAY_MS
          );
          const stationDateStr = findStationDateInWindow(
            timeLordBody,
            windowStart,
            stepDate
          );
          upcomingPeriods.push({
            date: stationDateStr,
            type: "Station (Stopping)",
            effect: "Extreme Intensity",
          });
          upcomingPeriods.push({
            start: stationDateStr,
            end: stationDateStr,
            type: "Retrograde",
          });
        } else if (prevTimeLordSpeed < 0 && lordMotion.speed > 0) {
          const windowStart = new Date(
            stepDate.getTime() - STEP_DAYS * ONE_DAY_MS
          );
          const stationDateStr = findStationDateInWindow(
            timeLordBody,
            windowStart,
            stepDate
          );
          upcomingPeriods.push({
            date: stationDateStr,
            type: "Station (Direct)",
            effect: "Extreme Intensity",
          });
          for (let i = upcomingPeriods.length - 1; i >= 0; i--) {
            const item = upcomingPeriods[i];
            if ("end" in item && item.type === "Retrograde") {
              (item as TimeLordRetrogradePeriodItem).end = stationDateStr;
              break;
            }
          }
        }
      }
      prevTimeLordSpeed = lordMotion.speed;

      for (const star of FIXED_STARS) {
        const result = checkStarTransit(
          lordLon,
          lordMotion.speed,
          star,
          lordName as PlanetKey
        );
        if (result.matched) {
          events.push({
            date: dateStr,
            type: "TimeLordFixedStar",
            planet: lordName,
            starName: star.name,
            description:
              result.description ??
              `★ Event: Time Lord ${lordName} conjoins ${star.name}. Effect: ${star.meaning}`,
          });
        }
      }
    }

    for (const pKey of OUTER_PLANET_KEYS) {
      const body = (PLANETS as Record<string, unknown>)[pKey];
      const time = MakeTime(stepDate);
      const lon = getPlanetLongitude(body, time);
      const motion = getPlanetRetrogradeAndSpeed(body, time, stepDate);
      const planetName = pKey.charAt(0).toUpperCase() + pKey.slice(1);

      const prev = prevSpeeds[pKey];
      if (prev !== undefined) {
        if (prev > 0 && motion.speed < 0) {
          const windowStart = new Date(
            stepDate.getTime() - STEP_DAYS * ONE_DAY_MS
          );
          const stationDateStr = findStationDateInWindow(body, windowStart, stepDate);
          const aspectDesc: string[] = [];
          for (const na of natalAngles) {
            const asp = getAspectToAngle(lon, na.lon);
            if (asp) aspectDesc.push(`${na.name} ${asp}`);
          }
          events.push({
            date: stationDateStr,
            type: "StationRetrograde",
            planet: planetName,
            description: `${planetName} 역행 진입(정지)`,
            aspectToNatal:
              aspectDesc.length > 0 ? aspectDesc.join(", ") : undefined,
          });
        } else if (prev < 0 && motion.speed > 0) {
          const windowStart = new Date(
            stepDate.getTime() - STEP_DAYS * ONE_DAY_MS
          );
          const stationDateStr = findStationDateInWindow(body, windowStart, stepDate);
          const aspectDesc: string[] = [];
          for (const na of natalAngles) {
            const asp = getAspectToAngle(lon, na.lon);
            if (asp) aspectDesc.push(`${na.name} ${asp}`);
          }
          events.push({
            date: stationDateStr,
            type: "StationDirect",
            planet: planetName,
            description: `${planetName} 순행 전환(정지)`,
            aspectToNatal:
              aspectDesc.length > 0 ? aspectDesc.join(", ") : undefined,
          });
        }
      }
      prevSpeeds[pKey] = motion.speed;
    }
  }

  if (timeLordBody) {
    timeLordRetrograde = {
      planet: lordName,
      isCurrentlyRetrograde,
      upcomingPeriods,
    };
  }

  return {
    events: dedupeEvents(events),
    timeLordRetrograde,
  };
}

function dedupeEvents(events: ShortTermEvent[]): ShortTermEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.date}|${e.type}|${e.planet ?? ""}|${e.starName ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 스캔 결과를 Gemini 프롬프트용 텍스트로 포맷
 * timeLordRetrograde가 있으면 타임로드 역행 기간·정지(High Alert) 섹션을 포함합니다.
 */
export function formatShortTermEventsForPrompt(
  result: ScanShortTermResult
): string {
  const events = result.events;
  const timeLord = result.timeLordRetrograde;
  const hasTimeLordContent =
    timeLord &&
    (timeLord.isCurrentlyRetrograde || timeLord.upcomingPeriods.length > 0);
  if (events.length === 0 && !hasTimeLordContent) {
    return "향후 6개월간 등록된 단기 이벤트 없음.";
  }

  const lines: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "[향후 6개월간의 결정적 시기 Critical Short-term Trends]",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ];

  if (timeLord && (timeLord.upcomingPeriods.length > 0 || timeLord.isCurrentlyRetrograde)) {
    lines.push("\n[타임로드 역행 — 핵심 변곡점 (Critical Inflection Point)]");
    lines.push(`- 올해의 지배 행성(Time Lord): ${timeLord.planet}`);
    lines.push(
      `- 현재 역행 여부: ${timeLord.isCurrentlyRetrograde ? "예 (역행 중)" : "아니오"}`
    );
    if (timeLord.isCurrentlyRetrograde) {
      lines.push(
        "- 해석 지침: 직업·금전·연애·건강 등에서 흐름이 바뀌거나 과거 이슈가 재점화되는 시기입니다. 대형 이벤트 발생 확률이 높으므로 반드시 강조하세요."
      );
    }
    if (timeLord.upcomingPeriods.length > 0) {
      lines.push("- 역행 기간 및 정지(Station) High Alert:");
      for (const item of timeLord.upcomingPeriods) {
        if (item.type === "Retrograde") {
          lines.push(`  * ${item.start} ~ ${item.end}: 역행 기간`);
        } else {
          lines.push(
            `  * ${item.date}: ${item.type} — ${item.effect}`
          );
        }
      }
    }
  }

  const byType = {
    TimeLordFixedStar: events.filter((e) => e.type === "TimeLordFixedStar"),
    StationRetrograde: events.filter((e) => e.type === "StationRetrograde"),
    StationDirect: events.filter((e) => e.type === "StationDirect"),
  };

  if (byType.TimeLordFixedStar.length > 0) {
    lines.push("\n[타임로드–항성 회합 (대길운 가능 시기)]");
    for (const e of byType.TimeLordFixedStar) {
      lines.push(`- ${e.date}: ${e.description}`);
    }
  }

  if (byType.StationRetrograde.length > 0) {
    lines.push("\n[역행 진입(정지)]");
    for (const e of byType.StationRetrograde) {
      const extra = e.aspectToNatal ? ` (Natal ${e.aspectToNatal})` : "";
      lines.push(`- ${e.date}: ${e.description}${extra}`);
    }
  }

  if (byType.StationDirect.length > 0) {
    lines.push("\n[순행 전환(정지)]");
    for (const e of byType.StationDirect) {
      const extra = e.aspectToNatal ? ` (Natal ${e.aspectToNatal})` : "";
      lines.push(`- ${e.date}: ${e.description}${extra}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
