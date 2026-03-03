/**
 * 차트 기반 위계(Dignity), 섹트(Sect), 헤이즈(Hayz) 컨텍스트 생성
 * Neo4j 제거: 모든 연산은 dignityCalculator 인메모리 동기 처리.
 */

import type { ChartData, Neo4jReceptionRejectionResult } from "../types.ts";
import { getSignFromLongitude, getSignRuler } from "./astrologyCalculator.ts";
import {
  getDignityType,
  isDayChartFromSunHouse,
  buildPlanetContext,
} from "./dignityCalculator.ts";

const PLANET_KEYS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
] as const;

const PLANET_NAMES: Record<string, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
};

export interface PlanetPlacement {
  planetName: string;
  signName: string;
  houseNum: number;
}

/** 행성 객체: sign(별자리), house(하우스 번호) */
export type PlanetsInput = Record<
  string,
  { sign?: string; house?: number; degreeInSign?: number }
>;

function getPlacementsFromPlanets(
  planets: PlanetsInput | null
): PlanetPlacement[] {
  const placements: PlanetPlacement[] = [];
  if (!planets) return placements;

  for (const key of PLANET_KEYS) {
    const p = planets[key];
    if (p && p.sign != null && p.house != null) {
      const signName =
        typeof p.sign === "string" ? p.sign : (p.sign as any)?.sign ?? "";
      placements.push({
        planetName: PLANET_NAMES[key] ?? key,
        signName: signName,
        houseNum: Number(p.house),
      });
    }
  }
  return placements;
}

/**
 * 차트 행성·별자리·하우스 및 위계/섹트/헤이즈를 인메모리 연산으로 Gemini용 텍스트 생성 (동기)
 */
export function getNeo4jContext(
  planets: PlanetsInput | null,
  isDayChart: boolean
): string {
  const placements = getPlacementsFromPlanets(planets);
  if (placements.length === 0) return "";

  const lines = placements.map((pl) =>
    buildPlanetContext(pl.planetName, pl.signName, pl.houseNum, isDayChart)
  );
  return lines.join("\n\n");
}

/**
 * 특정 행성–별자리 위계 타입 반환 (동기, 인메모리)
 */
export function getPlanetSignDignity(
  planetName: string,
  signName: string
): string | null {
  return getDignityType(planetName, signName);
}

const DAILY_DIGNITY_META: Record<string, string> = {
  RULES:
    "[리셉션(룰러쉽) 상태. 해당 영역에서 주도권과 안정감이 강화되는 시기로 작용함]",
  EXALTED_IN:
    "[리셉션(항진) 상태. 책임을 맡거나 뼈대를 단단히 세우는 긍정적 시기로 작용함]",
  DETRIMENT_IN:
    "[리젝션(손상) 상태. 과유불급, 오지랖으로 인한 감정·에너지 소모 주의]",
  FALL_IN:
    "[리젝션(추락) 상태. 해당 영역에서 힘이 분산되거나 지연될 수 있으니 무리하지 마세요]",
};

/**
 * 트랜짓 행성이 네이탈 감응점(별자리)을 타격할 때 위계 기반 LLM용 메타 태그 반환 (동기)
 */
export function getDailyReceptionRejectionMeta(
  transitPlanetName: string,
  natalAngleSign: string
): Neo4jReceptionRejectionResult {
  const dignityType = getDignityType(transitPlanetName, natalAngleSign);
  const metaTag =
    dignityType && DAILY_DIGNITY_META[dignityType]
      ? DAILY_DIGNITY_META[dignityType]
      : "[방랑자(중립). 해당 별자리에서 위계가 없어 영향이 중립적으로 작용함]";
  return { dignityType, metaTag };
}

/**
 * Sun의 하우스 번호로 낮/밤 차트 여부 판단
 * 7~12 하우스 = Day Chart / 1~6 하우스 = Night Chart
 */
export function isDayChartFromSun(planets: PlanetsInput | null): boolean {
  const sun = planets?.sun;
  if (!sun || sun.house == null) return true;
  return isDayChartFromSunHouse(Number(sun.house));
}

// ========== Consultation: 카테고리별 핵심 행성 + 하우스 룰러 ==========

const TOPIC_CORE: Record<
  string,
  { planetKeys: string[]; houseNumbers: number[] }
> = {
  LOVE: { planetKeys: ["venus", "moon"], houseNumbers: [7] },
  MONEY: { planetKeys: ["jupiter", "venus"], houseNumbers: [2] },
  WORK: { planetKeys: ["saturn", "sun", "mars"], houseNumbers: [10] },
  EXAM: { planetKeys: ["mercury"], houseNumbers: [3, 9] },
  MOVE: { planetKeys: ["moon", "mercury"], houseNumbers: [4] },
  GENERAL: { planetKeys: ["sun", "moon"], houseNumbers: [1] },
};

const PLANET_NAME_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(PLANET_NAMES).map(([k, v]) => [v, k])
);

function getHouseRulerPlanet(
  ascendantLongitude: number,
  houseNum: number
): string {
  const cuspLong =
    (((ascendantLongitude + (houseNum - 1) * 30) % 360) + 360) % 360;
  const sign = getSignFromLongitude(cuspLong).sign;
  return getSignRuler(sign);
}

/**
 * 질문 카테고리와 차트 기반으로 관련 행성만 선별해 인메모리로 컨텍스트 문자열 생성 (동기)
 */
export function fetchConsultationContext(
  consultationTopic: string,
  chartData: ChartData
): string {
  const topicUpper = (consultationTopic || "GENERAL").trim().toUpperCase();
  const core = TOPIC_CORE[topicUpper] ?? TOPIC_CORE.GENERAL;

  const ascLon = chartData.houses?.angles?.ascendant ?? 0;
  const planets = chartData.planets ?? {};

  const planetKeysSet = new Set<string>(core.planetKeys);
  for (const houseNum of core.houseNumbers) {
    const rulerName = getHouseRulerPlanet(ascLon, houseNum);
    const key = PLANET_NAME_TO_KEY[rulerName];
    if (key) planetKeysSet.add(key);
  }

  const placements: Array<{
    planetName: string;
    signName: string;
    houseNum: number;
  }> = [];

  for (const key of planetKeysSet) {
    const p = planets[key as keyof typeof planets];
    if (!p || p.sign == null || p.house == null) continue;
    const signName = typeof p.sign === "string" ? p.sign : "";
    const houseNum = Number(p.house);
    placements.push({
      planetName: PLANET_NAMES[key] ?? key,
      signName,
      houseNum,
    });
  }

  if (placements.length === 0) return "";

  const isDayChart = isDayChartFromSun(planets);
  const lines = placements.map((pl) =>
    buildPlanetContext(pl.planetName, pl.signName, pl.houseNum, isDayChart)
  );
  return lines.join(" ");
}
