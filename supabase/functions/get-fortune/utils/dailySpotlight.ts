/**
 * 데일리 "오늘의 신호 등급" 스코어링 (Spotlight Scoring)
 *
 * 방법론(말크님 체계): 트랜짓은 다층 프레임 위의 트리거이며, 대부분의 날은 "조용한 날"이다.
 * 정확도는 매일 변화가 아니라 "이벤트 게이팅"에서 나온다.
 * → 연주(Lord of the Year)의 상태를 척추로 삼되, 그 중 **연주–항성 회합(PED)**을 최상위 가중으로 둔다.
 *
 * Phase 1: 엔진에 이미 있는 데이터만 사용
 *  (연주–항성 회합 / 연주 프로펙션 앵글 진입 / 연주 역행 / 4대 감응점 타격 + 스포트라이트 보너스)
 *  향후: 일월식(±4/6/8°)·시저지·정지·MPD→SR→달·SR 조건 추가.
 */
import type { ChartData, DailyAngleStrike, PlanetPosition } from "../types.ts";
import type { LordStarConjunctionItem } from "./advancedAstrology.ts";

export type DailyLevel = "quiet" | "notable" | "clear" | "major";

export interface DailySpotlightSignal {
  label: string;
  weight: number;
  detail: string;
}

export interface DailySpotlight {
  score: number;
  level: DailyLevel;
  levelKo: string;
  primary: DailySpotlightSignal | null;
  signals: DailySpotlightSignal[];
  summaryLine: string;
}

export interface DailySpotlightInput {
  lordName: string;
  profectionSign: string;
  natalPlanets: ChartData["planets"] | null;
  /** 마이너 피르다르 로드 (스포트라이트 보너스용) */
  firdariaSubLord: string | null;
  /** 연주가 트랜짓 상 회합하는 항성 목록 (magnitude 포함) */
  lordStarConjunctions: LordStarConjunctionItem[];
  lordRetrograde: boolean;
  /** 연주가 진입한 프로펙션 앵글 하우스 (없으면 null) */
  lordProfectionAngleHouse: number | null;
  angleStrikes: DailyAngleStrike[];
  /** Phase 2 트리거 신호(일월식·시저지·정지·MPD→SR→달). 점수에 그대로 합산 */
  extraSignals?: DailySpotlightSignal[];
}

const PLANET_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
};

const LEVEL_KO: Record<DailyLevel, string> = {
  quiet: "잔잔한 날",
  notable: "주목할 날",
  clear: "뚜렷한 날",
  major: "중대한 날",
};

/** 4대 감응점 타격 총합 상한 (한 날에 타격이 몰려도 점수 폭주 방지) */
const ANGLE_STRIKE_CAP = 4;

/**
 * 그날 신호의 스포트라이트 점수·등급을 계산한다.
 * - 연주–항성 회합: 밝은 항성(mag≤2) +3 / 어두운 항성 +2 (항상 primary)
 * - 연주 프로펙션 앵글 진입: +2
 * - 연주 역행: +1
 * - 4대 감응점 타격: 타격당 (1 + 스포트라이트 보너스[연주/마이너로드/프로펙션사인 행성], 최대 3), 총합 최대 4
 * 등급: 점수 ≥4 중대 / 3 뚜렷 / 2 주목 / ≤1 잔잔
 */
export function computeDailySpotlight(input: DailySpotlightInput): DailySpotlight {
  const {
    lordName,
    profectionSign,
    natalPlanets,
    firdariaSubLord,
    lordStarConjunctions,
    lordRetrograde,
    lordProfectionAngleHouse,
    angleStrikes,
  } = input;

  const signals: DailySpotlightSignal[] = [];

  /** 특정 행성이 그 시기 스포트라이트를 받는 정도(0~3): 연주 / 마이너 피르다르 / 프로펙션 사인 내 네이탈 행성 */
  const planetSpotlightBonus = (name: string): number => {
    let b = 0;
    if (name === lordName) b += 1;
    if (firdariaSubLord && name === firdariaSubLord) b += 1;
    const key = PLANET_KEY[name];
    const p =
      key && natalPlanets
        ? (natalPlanets as Record<string, PlanetPosition | undefined>)[key]
        : undefined;
    if (p && p.sign === profectionSign) b += 1;
    return b;
  };

  let score = 0;

  // 1. 연주–항성 회합 (최상위) — 항상 primary
  let primary: DailySpotlightSignal | null = null;
  if (lordStarConjunctions && lordStarConjunctions.length > 0) {
    const sorted = [...lordStarConjunctions].sort(
      (a, b) => (a.magnitude ?? 9) - (b.magnitude ?? 9),
    );
    const top = sorted[0];
    const bright = (top.magnitude ?? 9) <= 2;
    const weight = bright ? 3 : 2;
    const sig: DailySpotlightSignal = {
      label: `연주(${lordName})–항성 ${top.starName} 회합${bright ? " (밝은 항성)" : ""}`,
      weight,
      detail: `${top.phase}, 거리 ${top.distance.toFixed(2)}° — ${top.meaning}`,
    };
    signals.push(sig);
    primary = sig;
    score += weight;
  }

  // 2. 연주 프로펙션 앵글 진입
  if (lordProfectionAngleHouse != null) {
    signals.push({
      label: `연주 프로펙션 앵글(${lordProfectionAngleHouse}H) 진입`,
      weight: 2,
      detail: "그해를 가르는 결정적 변곡점",
    });
    score += 2;
  }

  // 3. 연주 역행
  if (lordRetrograde) {
    signals.push({
      label: `연주(${lordName}) 역행`,
      weight: 1,
      detail: "핵심 변곡점 — 과거 이슈 재점화·물상화",
    });
    score += 1;
  }

  // 4. 4대 감응점 타격
  let strikeTotal = 0;
  for (const s of angleStrikes ?? []) {
    const w = Math.min(1 + planetSpotlightBonus(s.striker), 3);
    strikeTotal += w;
    signals.push({
      label: `${s.striker} → 네이탈 ${s.target} ${s.type}${s.isPartile ? " (파틸)" : ""}`,
      weight: w,
      detail: s.neo4jMetaTag ?? s.description,
    });
  }
  score += Math.min(strikeTotal, ANGLE_STRIKE_CAP);

  // 5. Phase 2 트리거(일월식·시저지·정지·MPD→SR→달) — 점수에 합산
  for (const sig of input.extraSignals ?? []) {
    signals.push(sig);
    score += sig.weight;
  }

  const level: DailyLevel =
    score >= 4 ? "major" : score === 3 ? "clear" : score === 2 ? "notable" : "quiet";
  const levelKo = LEVEL_KO[level];

  // primary가 아직 없으면(연주–항성 회합 부재) 최고 가중 신호를 primary로
  if (!primary && signals.length > 0) {
    primary = [...signals].sort((a, b) => b.weight - a.weight)[0];
  }

  const summaryLine =
    level === "quiet"
      ? `오늘은 두드러진 트리거가 없는 '${levelKo}'입니다(점수 ${score}). 없는 사건을 지어내지 말고 배경 흐름 위주로 담백하게.`
      : `오늘은 [${primary?.label ?? "—"}]이(가) 지배하는 '${levelKo}'입니다(점수 ${score}).`;

  // 표시용: 가중치 내림차순
  signals.sort((a, b) => b.weight - a.weight);

  return { score, level, levelKo, primary, signals, summaryLine };
}

/** DailySpotlight → 데일리 User Prompt용 [0. 오늘의 신호 등급] 섹션 문자열 */
export function formatDailySpotlightForPrompt(sp: DailySpotlight): string {
  const lines: string[] = [
    "[0. 오늘의 신호 등급 (Day Signal) — 해석의 최우선 기준]",
    `등급: ${sp.levelKo} (${sp.level}) · 점수 ${sp.score}`,
    sp.primary
      ? `지배 신호: ${sp.primary.label} — ${sp.primary.detail}`
      : "지배 신호: 없음 (잔잔한 날)",
  ];

  const others = sp.signals.filter((s) => s !== sp.primary);
  if (others.length > 0) {
    lines.push("기타 신호:");
    for (const s of others) {
      lines.push(`  - ${s.label}: ${s.detail}`);
    }
  }

  lines.push(
    "[해석 지침] '잔잔한 날'이면 없는 사건을 지어내지 말고 배경(연주·프로펙션 상태)과 컨디션 위주로 간결하게. " +
      "'주목→뚜렷→중대'로 갈수록 위 지배 신호를 이야기의 중심축으로 삼아 구체성·강도·분량을 키우세요. " +
      "특히 지배 신호가 연주–항성 회합이면 그 항성의 성질을 그날의 핵심 테마로 전면에 놓으세요.",
  );

  return lines.join("\n");
}
