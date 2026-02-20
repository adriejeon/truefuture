/**
 * Neo4j 전문 해석 데이터 조회
 * Supabase Edge Function (get-fortune) 내부: supabase/functions/get-fortune/utils/neo4jContext.ts
 * 차트(행성/별자리/하우스) 기반으로 위계(Dignity), 섹트(Sect), 헤이즈(Hayz) 포함 줄글 텍스트 생성
 */

import neo4j, { Driver, Session } from "npm:neo4j-driver@5.25.0";
import type { ChartData, Neo4jReceptionRejectionResult } from "../types.ts";
import { getSignFromLongitude, getSignRuler } from "./astrologyCalculator.ts";

const DIGNITY_LABELS: Record<string, string> = {
  RULES: "룰러쉽(매우 강력함)",
  EXALTED_IN: "항진(강력함)",
  DETRIMENT_IN: "손상(불편함)",
  FALL_IN: "추락(약함)",
};

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

/**
 * 행성 정보 객체에서 배치(행성명, 별자리, 하우스) 목록 추출
 */
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
 * 단일 행성에 대한 Neo4j 조회 결과를 줄글 한 문단으로 포맷
 */
function formatPlanetLine(row: Record<string, any>): string {
  const planetName = row.planet_name ?? "";
  const signName = row.sign_name ?? "";
  const houseNum = row.house_num ?? "";
  const pos = row.keywords_pos ?? "(없음)";
  const neg = row.keywords_neg ?? "(없음)";
  const signKeywords = row.sign_keywords ?? "(없음)";
  const houseMeaning = row.house_meaning ?? "(없음)";
  const dignityType = row.dignity_type;
  const sect = row.sect ?? "";
  const signGender = row.sign_gender ?? "";
  const isDayChart = row.is_day_chart === true;

  let dignityStatus = "방랑자(중립)";
  if (dignityType && DIGNITY_LABELS[dignityType]) {
    dignityStatus = DIGNITY_LABELS[dignityType];
  }

  let hayzNote = "";
  const isHayz =
    (isDayChart && sect === "Diurnal" && signGender === "Masculine") ||
    (!isDayChart && sect === "Nocturnal" && signGender === "Feminine");
  if (isHayz) {
    hayzNote =
      " 이 위치는 Hayz(헤이즈) 상태로, 섹트에 잘 맞아 긍정적으로 발현되기 유리합니다.";
  }

  return `${planetName}은(는) ${signName}의 ${houseNum}하우스에 위치합니다. ${pos}를 상징하며, 부정적으로는 ${neg}에 주의할 필요가 있습니다. 별자리 분위기는 ${signKeywords}이고, 하우스 영역은 ${houseMeaning}입니다. 위계는 ${dignityStatus}입니다.${hayzNote}`;
}

/**
 * Neo4j에서 행성·별자리·하우스 및 위계/섹트 정보를 조회해 Gemini용 해석 텍스트(String)로 반환
 *
 * @param planets - 차트의 행성 정보 (chartData.planets). 각 키(sun, moon, ...)에 sign, house 포함
 * @param isDayChart - 낮 차트 여부. 점성술 규칙: Sun이 7,8,9,10,11,12하우스 = Day Chart, 1,2,3,4,5,6하우스 = Night Chart
 * @returns Gemini에게 보낼 해석 텍스트. 연결 실패 시 빈 문자열 또는 에러 메시지
 */
export async function getNeo4jContext(
  planets: PlanetsInput | null,
  isDayChart: boolean
): Promise<string> {
  const uri = Deno.env.get("NEO4J_URI");
  const user = Deno.env.get("NEO4J_USER");
  const password = Deno.env.get("NEO4J_PASSWORD");

  if (!uri || !user || !password) {
    console.warn(
      "[Neo4j] NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD 중 하나가 없어 전문 해석 데이터를 건너뜁니다."
    );
    return "";
  }

  const placements = getPlacementsFromPlanets(planets);
  if (placements.length === 0) {
    return "";
  }

  let driver: Driver | null = null;

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    const session: Session = driver.session();

    const paragraphs: string[] = [];

    for (const pl of placements) {
      try {
        const result = await session.run(
          `
          MATCH (p:Planet {name: $planetName})
          MATCH (s:Sign {name: $signName})
          MATCH (h:House {number: $houseNum})
          OPTIONAL MATCH (p)-[r:RULES|EXALTED_IN|DETRIMENT_IN|FALL_IN]->(s)
          RETURN p.name AS planet_name, s.name AS sign_name, h.number AS house_num,
                 p.keywords_pos AS keywords_pos, p.keywords_neg AS keywords_neg,
                 s.keywords AS sign_keywords, s.gender AS sign_gender,
                 h.meaning AS house_meaning, p.sect AS sect,
                 type(r) AS dignity_type
          `,
          {
            planetName: pl.planetName,
            signName: pl.signName,
            houseNum: pl.houseNum,
          }
        );

        if (result.records.length > 0) {
          const record = result.records[0];
          const obj: Record<string, any> = {
            planet_name: record.get("planet_name"),
            sign_name: record.get("sign_name"),
            house_num: record.get("house_num"),
            keywords_pos: record.get("keywords_pos"),
            keywords_neg: record.get("keywords_neg"),
            sign_keywords: record.get("sign_keywords"),
            sign_gender: record.get("sign_gender"),
            house_meaning: record.get("house_meaning"),
            sect: record.get("sect"),
            dignity_type: record.get("dignity_type"),
            is_day_chart: isDayChart,
          };
          paragraphs.push(formatPlanetLine(obj));
        }
      } catch (e) {
        console.warn(
          `[Neo4j] 행성 ${pl.planetName} / ${pl.signName} / ${pl.houseNum} 조회 실패:`,
          e
        );
      }
    }

    await session.close();

    if (paragraphs.length === 0) {
      return "";
    }

    return paragraphs.join("\n\n");
  } catch (err: any) {
    console.error("[Neo4j] 연결 또는 조회 실패:", err?.message ?? err);
    return `[Neo4j 연결 실패로 전문 해석 데이터를 불러오지 못했습니다: ${
      err?.message ?? String(err)
    }]`;
  } finally {
    if (driver) {
      await driver.close();
    }
  }
}

// ========== 데일리 운세: 행성–별자리 위계(리셉션/리젝션) 조회 ==========

/**
 * 특정 행성이 특정 별자리에 있을 때의 위계(Dignity) 타입을 Neo4j에서 조회
 * @returns "RULES" | "EXALTED_IN" | "DETRIMENT_IN" | "FALL_IN" | null(방랑)
 */
export async function getPlanetSignDignity(
  planetName: string,
  signName: string
): Promise<string | null> {
  const uri = Deno.env.get("NEO4J_URI");
  const user = Deno.env.get("NEO4J_USER");
  const password = Deno.env.get("NEO4J_PASSWORD");

  if (!uri || !user || !password) return null;

  let driver: Driver | null = null;
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    const session = driver.session();
    const result = await session.run(
      `
      MATCH (p:Planet {name: $planetName})
      MATCH (s:Sign {name: $signName})
      OPTIONAL MATCH (p)-[r:RULES|EXALTED_IN|DETRIMENT_IN|FALL_IN]->(s)
      RETURN type(r) AS dignity_type
      `,
      { planetName, signName }
    );
    await session.close();
    if (result.records.length === 0) return null;
    const dtype = result.records[0].get("dignity_type");
    return dtype ?? null;
  } catch (err: any) {
    console.warn("[Neo4j] getPlanetSignDignity 실패:", err?.message);
    return null;
  } finally {
    if (driver) await driver.close();
  }
}

/** 데일리용 리셉션/리젝션 메타 태그 문구 (한국어) */
const DAILY_DIGNITY_META: Record<string, string> = {
  RULES:
    "[Neo4j 판단: 리셉션(룰러쉽) 상태. 해당 영역에서 주도권과 안정감이 강화되는 시기로 작용함]",
  EXALTED_IN:
    "[Neo4j 판단: 리셉션(항진) 상태. 책임을 맡거나 뼈대를 단단히 세우는 긍정적 시기로 작용함]",
  DETRIMENT_IN:
    "[Neo4j 판단: 리젝션(손상) 상태. 과유불급, 오지랖으로 인한 감정·에너지 소모 주의]",
  FALL_IN:
    "[Neo4j 판단: 리젝션(추락) 상태. 해당 영역에서 힘이 분산되거나 지연될 수 있으니 무리하지 마세요]",
};

/**
 * 트랜짓 행성이 네이탈 감응점(별자리)을 타격할 때, Neo4j 위계를 조회해 LLM용 메타 태그 반환
 * @param transitPlanetName - 타격 주체 행성명 (예: "Saturn")
 * @param natalAngleSign - 타겟 감응점의 별자리 (예: "Libra" = Ascendant가 천칭자리)
 */
export async function getDailyReceptionRejectionMeta(
  transitPlanetName: string,
  natalAngleSign: string
): Promise<Neo4jReceptionRejectionResult> {
  const dignityType = await getPlanetSignDignity(
    transitPlanetName,
    natalAngleSign
  );
  const metaTag =
    dignityType && DAILY_DIGNITY_META[dignityType]
      ? DAILY_DIGNITY_META[dignityType]
      : "[Neo4j 판단: 방랑자(중립). 해당 별자리에서 위계가 없어 영향이 중립적으로 작용함]";
  return { dignityType, metaTag };
}

/**
 * Sun의 하우스 번호로 낮/밤 차트 여부 판단
 * 점성술 규칙: Sun이 7, 8, 9, 10, 11, 12 하우스 = Day Chart / 1, 2, 3, 4, 5, 6 하우스 = Night Chart
 */
export function isDayChartFromSun(planets: PlanetsInput | null): boolean {
  const sun = planets?.sun;
  if (!sun || sun.house == null) return true;
  const house = Number(sun.house);
  return house >= 7 && house <= 12;
}

// ========== Consultation Topic → Core Planets / House Rulers ==========

/** 질문 카테고리별 핵심 행성 키 + 조회할 하우스 룰러(하우스 번호) */
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

/** 행성명 → 차트 키 (Sun → sun) */
const PLANET_NAME_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(PLANET_NAMES).map(([k, v]) => [v, k])
);

/** Whole Sign 기준 N하우스 쿠스프의 별자리 주인(행성명) 반환 */
function getHouseRulerPlanet(
  ascendantLongitude: number,
  houseNum: number
): string {
  const cuspLong =
    (((ascendantLongitude + (houseNum - 1) * 30) % 360) + 360) % 360;
  const sign = getSignFromLongitude(cuspLong).sign;
  return getSignRuler(sign);
}

/** 하우스 번호를 서수 문자열로 (7 → "7th") */
function houseOrdinal(n: number): string {
  const ordinals: Record<number, string> = {
    1: "1st",
    2: "2nd",
    3: "3rd",
    4: "4th",
    5: "5th",
    6: "6th",
    7: "7th",
    8: "8th",
    9: "9th",
    10: "10th",
    11: "11th",
    12: "12th",
  };
  return ordinals[n] ?? `${n}th`;
}

/**
 * 단일 배치에 대한 Neo4j 조회 결과를 상담용 한 줄 포맷으로
 * "Venus in Virgo: {Meaning} / 7th House Keywords: {Keywords}"
 */
function formatConsultationLine(
  row: Record<string, any>,
  houseLabel: string
): string {
  const planetName = row.planet_name ?? "";
  const signName = row.sign_name ?? "";
  const pos = row.keywords_pos ?? "(없음)";
  const neg = row.keywords_neg ?? "(없음)";
  const signKeywords = row.sign_keywords ?? "(없음)";
  const houseMeaning = row.house_meaning ?? "(없음)";
  const dignityType = row.dignity_type;
  let dignityStatus = "방랑자(중립)";
  if (dignityType && DIGNITY_LABELS[dignityType]) {
    dignityStatus = DIGNITY_LABELS[dignityType];
  }
  const meaning = `${pos}; 부정 시 ${neg}. 별자리: ${signKeywords}. 위계: ${dignityStatus}`;
  return `${planetName} in ${signName}: ${meaning} / ${houseLabel} House Keywords: ${houseMeaning}`;
}

/**
 * 질문 카테고리(consultationTopic)와 차트(chartData)를 기반으로
 * 관련된 Neo4j 지식만 선별 조회해 하나의 문자열로 반환.
 *
 * @param consultationTopic - LOVE | MONEY | WORK | EXAM | MOVE | GENERAL (대소문자 무관)
 * @param chartData - 출생 차트 (planets, houses.angles.ascendant)
 * @returns 검색된 텍스트를 합친 문자열. 실패/미설정 시 빈 문자열 또는 에러 메시지
 */
export async function fetchConsultationContext(
  consultationTopic: string,
  chartData: ChartData
): Promise<string> {
  const uri = Deno.env.get("NEO4J_URI");
  const user = Deno.env.get("NEO4J_USER");
  const password = Deno.env.get("NEO4J_PASSWORD");

  if (!uri || !user || !password) {
    console.warn(
      "[Neo4j] NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD 중 하나가 없어 상담 컨텍스트를 건너뜁니다."
    );
    return "";
  }

  const topicUpper = (consultationTopic || "GENERAL").trim().toUpperCase();
  const core = TOPIC_CORE[topicUpper] ?? TOPIC_CORE.GENERAL;

  const ascLon = chartData.houses?.angles?.ascendant ?? 0;
  const planets = chartData.planets ?? {};

  // 선정된 행성 키 + 하우스 룰러로 나오는 행성 키 수집 (중복 제거)
  const planetKeysSet = new Set<string>(core.planetKeys);
  for (const houseNum of core.houseNumbers) {
    const rulerName = getHouseRulerPlanet(ascLon, houseNum);
    const key = PLANET_NAME_TO_KEY[rulerName];
    if (key) planetKeysSet.add(key);
  }

  // 배치 목록: 각 행성의 sign, house (chartData에서)
  const placements: Array<{
    planetName: string;
    signName: string;
    houseNum: number;
    houseLabel: string;
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
      houseLabel: houseOrdinal(houseNum),
    });
  }

  if (placements.length === 0) {
    return "";
  }

  let driver: Driver | null = null;

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    const session: Session = driver.session();

    const lines: string[] = [];

    for (const pl of placements) {
      try {
        const result = await session.run(
          `
          MATCH (p:Planet {name: $planetName})
          MATCH (s:Sign {name: $signName})
          MATCH (h:House {number: $houseNum})
          OPTIONAL MATCH (p)-[r:RULES|EXALTED_IN|DETRIMENT_IN|FALL_IN]->(s)
          RETURN p.name AS planet_name, s.name AS sign_name, h.number AS house_num,
                 p.keywords_pos AS keywords_pos, p.keywords_neg AS keywords_neg,
                 s.keywords AS sign_keywords, h.meaning AS house_meaning,
                 type(r) AS dignity_type
          `,
          {
            planetName: pl.planetName,
            signName: pl.signName,
            houseNum: pl.houseNum,
          }
        );

        if (result.records.length > 0) {
          const record = result.records[0];
          const obj: Record<string, any> = {
            planet_name: record.get("planet_name"),
            sign_name: record.get("sign_name"),
            house_num: record.get("house_num"),
            keywords_pos: record.get("keywords_pos"),
            keywords_neg: record.get("keywords_neg"),
            sign_keywords: record.get("sign_keywords"),
            house_meaning: record.get("house_meaning"),
            dignity_type: record.get("dignity_type"),
          };
          lines.push(formatConsultationLine(obj, pl.houseLabel));
        }
      } catch (e) {
        console.warn(
          `[Neo4j] fetchConsultationContext ${pl.planetName} / ${pl.signName} / ${pl.houseNum} 조회 실패:`,
          e
        );
      }
    }

    await session.close();

    if (lines.length === 0) {
      return "";
    }

    return lines.join(" ");
  } catch (err: any) {
    console.error(
      "[Neo4j] fetchConsultationContext 연결 또는 조회 실패:",
      err?.message ?? err
    );
    return `[Neo4j 연결 실패로 상담 컨텍스트를 불러오지 못했습니다: ${
      err?.message ?? String(err)
    }]`;
  } finally {
    if (driver) {
      await driver.close();
    }
  }
}
