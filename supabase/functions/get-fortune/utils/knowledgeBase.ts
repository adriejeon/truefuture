/**
 * knowledgeBase.ts — 차트 기반 해석 지식베이스 룩업 엔진
 *
 * 점성술은 검색 키가 결정론적이다: 차트 계산이 끝나면 "어떤 행성·사인·하우스·
 * 조합을 볼지"가 확정되므로, 임베딩/벡터DB 없이 정적 규칙 모듈을 키로 조회해
 * 프롬프트에 주입한다(완전 무료, 외부 서비스 0).
 *
 * 흐름: 차트 → 정규화 토큰(점유 하우스·사인·어스펙트 쌍) → 규칙 조회 → 텍스트 주입.
 * 세부 if→then 판단은 규칙 텍스트 그대로 LLM에 맡긴다(코드가 모든 술어를 평가하지 않음).
 *
 * KO 전용. (EN 프롬프트는 호출하지 않음 — 코퍼스가 한국어)
 */

import type { ChartData } from "../types.ts";
import { FortuneType } from "../types.ts";
import { calculateAspects } from "./astrologyCalculator.ts";

import { HOUSES } from "../knowledge/houses.ts";
import { SIGNS_KB } from "../knowledge/signs.ts";
import { PLANETS_KB } from "../knowledge/planets.ts";
import { PLANET_COMBOS } from "../knowledge/planetCombos.ts";
import { GOLDEN_RULES } from "../knowledge/goldenRules.ts";
import { TIMING_KB } from "../knowledge/timing.ts";

// 차트 planets 키(소문자) → 지식베이스 행성명(TitleCase)
const PKEY_TO_NAME: Record<string, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
};

type GoldenKey = keyof typeof GOLDEN_RULES;

/** FortuneType → 주입할 하우스 번호 (타입별 관심 영역) */
function relevantHousesByType(ft: FortuneType): string[] {
  switch (ft) {
    case FortuneType.LIFETIME:
      return ["1", "2", "5", "6", "7", "10"];
    case FortuneType.COMPATIBILITY:
      return ["1", "5", "7", "11"];
    case FortuneType.CONSULTATION:
      return ["1", "2", "7", "10"];
    case FortuneType.DAILY:
    default:
      return [];
  }
}

/** FortuneType → 주입할 goldenRules 키 */
function goldenKeysByType(ft: FortuneType): GoldenKey[] {
  switch (ft) {
    case FortuneType.LIFETIME:
      return ["personality", "love", "career", "wealth", "health", "general"];
    case FortuneType.COMPATIBILITY:
      // personality(기질) = 두 사람 기질 비교 섹션의 기본 베이스
      return ["personality", "synastry", "general"];
    case FortuneType.CONSULTATION:
      return ["personality", "timing", "career", "love", "wealth", "general"];
    case FortuneType.DAILY:
    default:
      return ["timing"];
  }
}

function getOccupiedHouses(chartData: ChartData): string[] {
  const set = new Set<string>();
  const planets = chartData?.planets ?? {};
  for (const p of Object.values(planets) as Array<{ house?: number }>) {
    if (typeof p?.house === "number") set.add(String(p.house));
  }
  return Array.from(set);
}

/** 차트의 발광체·상승점 사인 (성격 핵심 키) */
function getKeySigns(chartData: ChartData): { label: string; sign: string }[] {
  const out: { label: string; sign: string }[] = [];
  const asc = chartData?.houses?.angles?.ascendant;
  if (typeof asc === "number") {
    const SIGN_NAMES = Object.keys(SIGNS_KB);
    const idx = Math.floor((((asc % 360) + 360) % 360) / 30);
    if (SIGN_NAMES[idx]) out.push({ label: "상승점", sign: SIGN_NAMES[idx] });
  }
  const sun = chartData?.planets?.sun?.sign;
  if (sun) out.push({ label: "태양", sign: sun });
  const moon = chartData?.planets?.moon?.sign;
  if (moon) out.push({ label: "달", sign: moon });
  return out;
}

/** 차트 내에서 어스펙트를 맺는 행성쌍의 조합 키 ("A-B", 알파벳 정렬) */
function getAspectedComboKeys(chartData: ChartData): string[] {
  let aspects: Array<{ transitPlanet: string; natalPlanet: string }> = [];
  try {
    aspects = calculateAspects(chartData, chartData);
  } catch (_) {
    return [];
  }
  const keys = new Set<string>();
  for (const a of aspects) {
    if (a.transitPlanet === a.natalPlanet) continue;
    keys.add([a.transitPlanet, a.natalPlanet].sort().join("-"));
  }
  return Array.from(keys);
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * 차트와 운세 타입에 맞춰 적용할 해석 규칙을 모아 프롬프트 섹션 문자열로 반환.
 * 주입할 규칙이 없으면 빈 문자열.
 */
export function buildKnowledgeContext(
  chartData: ChartData,
  fortuneType: FortuneType,
): string {
  if (!chartData?.planets) return "";

  const sections: string[] = [];
  const goldenKeys = goldenKeysByType(fortuneType);

  // ── 1. 관련 하우스 (타입 관심영역 ∪ 점유 하우스) ──
  // 점유 하우스는 심층 리딩(LIFETIME)에만 합쳐 분량을 통제. 그 외 타입은 관심영역만.
  const houseNums = dedup([
    ...relevantHousesByType(fortuneType),
    ...(fortuneType === FortuneType.LIFETIME
      ? getOccupiedHouses(chartData)
      : []),
  ]).sort((a, b) => Number(a) - Number(b));
  const houseLines: string[] = [];
  for (const h of houseNums) {
    const entry = HOUSES[h];
    if (!entry || !entry.rules?.length) continue;
    houseLines.push(`· ${h}하우스(${entry.topic}): ${entry.rules.join(" / ")}`);
  }
  if (houseLines.length) {
    sections.push("■ 관련 하우스 판단\n" + houseLines.join("\n"));
  }

  // ── 2. 핵심 기질 (상승점·태양·달 사인) ──
  const wantBody = goldenKeys.includes("health" as GoldenKey);
  const wantCareer = goldenKeys.includes("career" as GoldenKey);
  const signLines: string[] = [];
  for (const { label, sign } of getKeySigns(chartData)) {
    const s = SIGNS_KB[sign];
    if (!s) continue;
    let line = `· ${label}(${sign}): ${s.personality}`;
    if (wantCareer && s.careerTraits) line += ` 〔직업기질: ${s.careerTraits}〕`;
    if (wantBody && s.bodyParts) line += ` 〔신체: ${s.bodyParts}〕`;
    signLines.push(line);
  }
  if (signLines.length) {
    sections.push("■ 핵심 기질 (사인)\n" + signLines.join("\n"));
  }

  // ── 3. 행성 조합 (어스펙트로 연결된 쌍) ──
  const comboLines: string[] = [];
  for (const key of getAspectedComboKeys(chartData)) {
    const combo = PLANET_COMBOS[key];
    if (!combo) continue;
    const parts: string[] = [];
    if (combo.personality) parts.push(combo.personality);
    if (wantCareer && combo.career) parts.push(`직업: ${combo.career}`);
    if (parts.length) comboLines.push(`· ${key}: ${parts.join(" / ")}`);
  }
  if (comboLines.length) {
    sections.push("■ 행성 조합 (각을 맺는 행성)\n" + comboLines.join("\n"));
  }

  // ── 3.5 핵심 행성 의미 (발광체 + 관련 하우스 점유 행성) ──
  const wantWealth = goldenKeys.includes("wealth" as GoldenKey);
  const planetLines: string[] = [];
  for (const [pkey, pdata] of Object.entries(chartData.planets ?? {}) as Array<
    [string, { house?: number }]
  >) {
    const name = PKEY_TO_NAME[pkey];
    const kb = name ? PLANETS_KB[name] : undefined;
    if (!kb) continue;
    const isLuminary = pkey === "sun" || pkey === "moon";
    const inRelevant = houseNums.includes(String(pdata?.house));
    if (!isLuminary && !inRelevant) continue;
    const bits: string[] = [];
    if (kb.keywords) bits.push(kb.keywords);
    if (wantCareer && kb.careerFields) bits.push(`직업분야: ${kb.careerFields}`);
    if (wantWealth && kb.wealthPath) bits.push(`재물경로: ${kb.wealthPath}`);
    if (wantBody && kb.disease) bits.push(`질병경향: ${kb.disease}`);
    if (bits.length) planetLines.push(`· ${name}: ${bits.join(" / ")}`);
  }
  if (planetLines.length) {
    sections.push("■ 핵심 행성 의미\n" + planetLines.join("\n"));
  }

  // ── 4. 적용 규칙 (타입별 핵심 규칙) ──
  const ruleLines: string[] = [];
  for (const k of goldenKeys) {
    const rules = GOLDEN_RULES[k];
    if (rules?.length) ruleLines.push(...rules.map((r) => `· ${r}`));
  }
  if (ruleLines.length) {
    sections.push("■ 적용 규칙\n" + dedup(ruleLines).join("\n"));
  }

  // ── 5. 시기 해석 (데일리/연간/상담) ──
  if (goldenKeys.includes("timing" as GoldenKey)) {
    const timingLines: string[] = [];
    if (TIMING_KB.transit?.length) {
      timingLines.push(...TIMING_KB.transit.map((r) => `· ${r}`));
    }
    // 피르다리아는 장기 시기 기법 → 자유상담에만 (데일리 제외, 분량 절약)
    if (
      fortuneType === FortuneType.CONSULTATION &&
      TIMING_KB.firdaria?.length
    ) {
      timingLines.push(...TIMING_KB.firdaria.map((r) => `· ${r}`));
    }
    if (timingLines.length) {
      sections.push("■ 시기 해석 기준\n" + dedup(timingLines).join("\n"));
    }
  }

  if (!sections.length) return "";

  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "[📚 해석 지식베이스 — 이 차트에 적용할 규칙]",
    "아래는 이 차트의 배치에 맞춰 선별된 해석 규칙입니다. 반드시 근거로 활용하되, 전문 용어는 출력에 노출하지 말고 자연스러운 설명으로 풀어내세요.",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    sections.join("\n\n"),
  ].join("\n");
}
