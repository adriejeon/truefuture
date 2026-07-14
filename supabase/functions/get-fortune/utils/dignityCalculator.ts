/**
 * 인메모리 점성술 위계(Dignity), 섹트(Sect), 헤이즈(Hayz) 연산
 * Neo4j 의존성 없이 동기 연산으로 차트 해석 컨텍스트를 생성합니다.
 */

export type DignityType = "RULES" | "EXALTED_IN" | "DETRIMENT_IN" | "FALL_IN";

/** 행성별 섹트: Diurnal(낮), Nocturnal(밤), Neutral(중립) */
export const PLANET_SECT: Record<string, "Diurnal" | "Nocturnal" | "Neutral"> = {
  Sun: "Diurnal",
  Jupiter: "Diurnal",
  Saturn: "Diurnal",
  Moon: "Nocturnal",
  Venus: "Nocturnal",
  Mars: "Nocturnal",
  Mercury: "Neutral",
};

/** 별자리별 성별 (Hayz 판별용) */
export const SIGN_GENDER: Record<string, "Masculine" | "Feminine"> = {
  Aries: "Masculine",
  Taurus: "Feminine",
  Gemini: "Masculine",
  Cancer: "Feminine",
  Leo: "Masculine",
  Virgo: "Feminine",
  Libra: "Masculine",
  Scorpio: "Feminine",
  Sagittarius: "Masculine",
  Capricorn: "Feminine",
  Aquarius: "Masculine",
  Pisces: "Feminine",
};

/** 행성별 필수 위계: RULES(룰러십), EXALTED_IN(항진), DETRIMENT_IN(손상), FALL_IN(추락) */
const RULES: Record<string, string[]> = {
  Sun: ["Leo"],
  Moon: ["Cancer"],
  Mercury: ["Gemini", "Virgo"],
  Venus: ["Taurus", "Libra"],
  Mars: ["Aries", "Scorpio"],
  Jupiter: ["Sagittarius", "Pisces"],
  Saturn: ["Capricorn", "Aquarius"],
};

const EXALTED_IN: Record<string, string[]> = {
  Sun: ["Aries"],
  Moon: ["Taurus"],
  Mercury: ["Virgo"],
  Venus: ["Pisces"],
  Mars: ["Capricorn"],
  Jupiter: ["Cancer"],
  Saturn: ["Libra"],
};

const DETRIMENT_IN: Record<string, string[]> = {
  Sun: ["Aquarius"],
  Moon: ["Capricorn"],
  Mercury: ["Sagittarius", "Pisces"],
  Venus: ["Aries", "Scorpio"],
  Mars: ["Taurus", "Libra"],
  Jupiter: ["Gemini", "Virgo"],
  Saturn: ["Cancer", "Leo"],
};

const FALL_IN: Record<string, string[]> = {
  Sun: ["Libra"],
  Moon: ["Scorpio"],
  Mercury: ["Pisces"],
  Venus: ["Virgo"],
  Mars: ["Cancer"],
  Jupiter: ["Capricorn"],
  Saturn: ["Aries"],
};

/** 위계 타입별 한글 라벨 */
const DIGNITY_LABELS: Record<DignityType, string> = {
  RULES: "룰러쉽(도미사일)",
  EXALTED_IN: "항진(엑잘테이션)",
  DETRIMENT_IN: "손상(디트리먼트)",
  FALL_IN: "추락(폴)",
};

/** 하우스별 의미 (간략, Gemini 문장용) */
const HOUSE_MEANING: Record<number, string> = {
  1: "본인·성격",
  2: "재물·가치",
  3: "소통·학습",
  4: "가정·뿌리",
  5: "연애·창작",
  6: "일·건강",
  7: "배우자·파트너",
  8: "공유자원·위기",
  9: "철학·해외",
  10: "직업·명예",
  11: "친구·희망",
  12: "고립·무의식",
};

/**
 * 행성이 특정 별자리에 있을 때의 위계(Dignity) 타입 반환
 * @returns RULES | EXALTED_IN | DETRIMENT_IN | FALL_IN | null(방랑)
 */
export function getDignityType(
  planetName: string,
  signName: string
): DignityType | null {
  const planet = planetName.trim();
  const sign = signName.trim();
  if (RULES[planet]?.includes(sign)) return "RULES";
  if (EXALTED_IN[planet]?.includes(sign)) return "EXALTED_IN";
  if (DETRIMENT_IN[planet]?.includes(sign)) return "DETRIMENT_IN";
  if (FALL_IN[planet]?.includes(sign)) return "FALL_IN";
  return null;
}

/**
 * Sun의 하우스 번호로 낮/밤 차트 여부 판단
 * 7,8,9,10,11,12 = Day Chart / 1,2,3,4,5,6 = Night Chart
 */
export function isDayChartFromSunHouse(sunHouseNum: number | null | undefined): boolean {
  if (sunHouseNum == null || sunHouseNum < 1 || sunHouseNum > 12) return true;
  return sunHouseNum >= 7 && sunHouseNum <= 12;
}

/**
 * 헤이즈(Hayz) 여부: 낮 차트에서 낮 행성(Diurnal)이 남성 별자리, 또는 밤 차트에서 밤 행성(Nocturnal)이 여성 별자리
 */
export function checkHayz(
  planetName: string,
  signName: string,
  isDayChart: boolean
): boolean {
  const sect = PLANET_SECT[planetName.trim()];
  const gender = SIGN_GENDER[signName.trim()];
  if (!sect || !gender) return false;
  return (
    (isDayChart && sect === "Diurnal" && gender === "Masculine") ||
    (!isDayChart && sect === "Nocturnal" && gender === "Feminine")
  );
}

/**
 * 행성의 현재 상태를 Gemini가 이해하기 쉬운 짧은 명제형 텍스트로 생성
 * 예: "태양은 양자리 1하우스에 위치함. (엑잘테이션/항진). 낮 차트로 헤이즈 상태임."
 */
export function buildPlanetContext(
  planetName: string,
  signName: string,
  houseNum: number,
  isDayChart: boolean
): string {
  const dignity = getDignityType(planetName, signName);
  const dignityLabel = dignity ? DIGNITY_LABELS[dignity] : "방랑(중립)";
  const houseMeaning = HOUSE_MEANING[houseNum] ?? `${houseNum}하우스`;
  const chartType = isDayChart ? "낮" : "밤";
  const hayz = checkHayz(planetName, signName, isDayChart);

  let line = `${planetName}은(는) ${signName} ${houseNum}하우스(${houseMeaning})에 위치함. 에센셜 디그니티: ${dignityLabel}. ${chartType} 차트.`;
  if (hayz) {
    line += " 헤이즈 상태로 섹트에 잘 맞아 긍정 발현에 유리함.";
  } else {
    line += " ";
  }
  return line.trim();
}

// ============================================================================
// 세부 위계(Minor Dignities): 트리플리시티 / 텀(바운드) / 페이스 + 알무텐
// 표 출처: 고전 표준 (Dorothean 트리플리시티, Egyptian 텀, Chaldean 페이스).
// 이 데이터는 almuten(지배행성) 산출과 도수별 위계 판단에 사용된다.
// ============================================================================

/** 12사인 zodiacal 순서 (0=Aries) */
const SIGN_ORDER = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

const SIGN_ELEMENT: Record<string, "Fire" | "Earth" | "Air" | "Water"> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};

/** 도로테우스 트리플리시티 로드: [낮 로드, 밤 로드, 공동(participating)] */
const TRIPLICITY_LORDS: Record<string, [string, string, string]> = {
  Fire: ["Sun", "Jupiter", "Saturn"],
  Earth: ["Venus", "Moon", "Mars"],
  Air: ["Saturn", "Mercury", "Jupiter"],
  Water: ["Venus", "Mars", "Moon"],
};

/** 이집션 텀(바운드): 각 사인별 [로드, 시작도, 끝도] 5구간 */
const EGYPTIAN_TERMS: Record<string, Array<[string, number, number]>> = {
  Aries: [["Jupiter", 0, 6], ["Venus", 6, 12], ["Mercury", 12, 20], ["Mars", 20, 25], ["Saturn", 25, 30]],
  Taurus: [["Venus", 0, 8], ["Mercury", 8, 14], ["Jupiter", 14, 22], ["Saturn", 22, 27], ["Mars", 27, 30]],
  Gemini: [["Mercury", 0, 6], ["Jupiter", 6, 12], ["Venus", 12, 17], ["Mars", 17, 24], ["Saturn", 24, 30]],
  Cancer: [["Mars", 0, 7], ["Venus", 7, 13], ["Mercury", 13, 19], ["Jupiter", 19, 26], ["Saturn", 26, 30]],
  Leo: [["Jupiter", 0, 6], ["Venus", 6, 11], ["Saturn", 11, 18], ["Mercury", 18, 24], ["Mars", 24, 30]],
  Virgo: [["Mercury", 0, 7], ["Venus", 7, 17], ["Jupiter", 17, 21], ["Mars", 21, 28], ["Saturn", 28, 30]],
  Libra: [["Saturn", 0, 6], ["Mercury", 6, 14], ["Jupiter", 14, 21], ["Venus", 21, 28], ["Mars", 28, 30]],
  Scorpio: [["Mars", 0, 7], ["Venus", 7, 11], ["Mercury", 11, 19], ["Jupiter", 19, 24], ["Saturn", 24, 30]],
  Sagittarius: [["Jupiter", 0, 12], ["Venus", 12, 17], ["Mercury", 17, 21], ["Saturn", 21, 26], ["Mars", 26, 30]],
  Capricorn: [["Mercury", 0, 7], ["Jupiter", 7, 14], ["Venus", 14, 22], ["Saturn", 22, 26], ["Mars", 26, 30]],
  Aquarius: [["Mercury", 0, 7], ["Venus", 7, 13], ["Jupiter", 13, 20], ["Mars", 20, 25], ["Saturn", 25, 30]],
  Pisces: [["Venus", 0, 12], ["Jupiter", 12, 16], ["Mercury", 16, 19], ["Mars", 19, 28], ["Saturn", 28, 30]],
};

/** 페이스(데칸): 각 사인 3구간(0-10/10-20/20-30) 로드 — Chaldean order (Aries 0°=Mars 시작) */
const FACES: Record<string, [string, string, string]> = {
  Aries: ["Mars", "Sun", "Venus"],
  Taurus: ["Mercury", "Moon", "Saturn"],
  Gemini: ["Jupiter", "Mars", "Sun"],
  Cancer: ["Venus", "Mercury", "Moon"],
  Leo: ["Saturn", "Jupiter", "Mars"],
  Virgo: ["Sun", "Venus", "Mercury"],
  Libra: ["Moon", "Saturn", "Jupiter"],
  Scorpio: ["Mars", "Sun", "Venus"],
  Sagittarius: ["Mercury", "Moon", "Saturn"],
  Capricorn: ["Jupiter", "Mars", "Sun"],
  Aquarius: ["Venus", "Mercury", "Moon"],
  Pisces: ["Saturn", "Jupiter", "Mars"],
};

/** 도미사일(룰러) 로드 */
const DOMICILE_LORD: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

/** 엑절테이션 로드 (사인 → 그 사인에서 항진하는 행성) */
const EXALTATION_LORD: Record<string, string> = {
  Aries: "Sun", Taurus: "Moon", Cancer: "Jupiter", Virgo: "Mercury",
  Libra: "Saturn", Capricorn: "Mars", Pisces: "Venus",
};

/** 트리플리시티 로드 반환 (섹트 반영). day=주간 로드, night=야간 로드 우선, 공동 로드는 별도 취급 안 함 */
export function getTriplicityLord(signName: string, isDayChart: boolean): string | null {
  const el = SIGN_ELEMENT[signName.trim()];
  if (!el) return null;
  const [dayLord, nightLord] = TRIPLICITY_LORDS[el];
  return isDayChart ? dayLord : nightLord;
}

/** 텀(바운드) 로드 반환 */
export function getTermLord(signName: string, degreeInSign: number): string | null {
  const terms = EGYPTIAN_TERMS[signName.trim()];
  if (!terms) return null;
  for (const [lord, start, end] of terms) {
    if (degreeInSign >= start && degreeInSign < end) return lord;
  }
  return terms[terms.length - 1][0]; // 30° 경계 보정
}

/** 페이스 로드 반환 */
export function getFaceLord(signName: string, degreeInSign: number): string | null {
  const faces = FACES[signName.trim()];
  if (!faces) return null;
  const idx = Math.min(2, Math.floor(degreeInSign / 10));
  return faces[idx];
}

export interface AlmutenResult {
  winner: string | null;
  scores: Record<string, number>;
}

/**
 * 특정 도수(사인+도)의 알무텐 산출.
 * 가중치: 도미사일 5 · 엑절테이션 4 · 트리플리시티 3 · 텀 2 · 페이스 1 (Lilly/Ibn Ezra 방식).
 * 동점이면 winner는 도미사일>엑절>트리플>텀>페이스 우선순위의 최고 기여 행성으로 tiebreak.
 */
export function almutenOfDegree(
  signName: string,
  degreeInSign: number,
  isDayChart: boolean,
): AlmutenResult {
  const sign = signName.trim();
  const scores: Record<string, number> = {};
  const add = (planet: string | null | undefined, pts: number, rank: number) => {
    if (!planet) return;
    scores[planet] = (scores[planet] ?? 0) + pts;
    // tiebreak 저장용: 각 행성이 가진 최고 rank(작을수록 우선)
    const key = `__rank_${planet}`;
    (scores as any)[key] = Math.min((scores as any)[key] ?? 99, rank);
  };
  add(DOMICILE_LORD[sign], 5, 1);
  add(EXALTATION_LORD[sign], 4, 2);
  add(getTriplicityLord(sign, isDayChart), 3, 3);
  add(getTermLord(sign, degreeInSign), 2, 4);
  add(getFaceLord(sign, degreeInSign), 1, 5);

  let winner: string | null = null;
  let best = -1;
  let bestRank = 99;
  for (const [k, v] of Object.entries(scores)) {
    if (k.startsWith("__rank_")) continue;
    const rank = (scores as any)[`__rank_${k}`] ?? 99;
    if (v > best || (v === best && rank < bestRank)) {
      best = v;
      bestRank = rank;
      winner = k;
    }
  }
  // 내부 rank 키 제거
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    if (!k.startsWith("__rank_")) clean[k] = v;
  }
  return { winner, scores: clean };
}

/** 특정 도수의 전체 위계(도미사일/엑절/트리플/텀/페이스 로드)를 한 줄로 요약 */
export function describeDignitiesAtDegree(
  signName: string,
  degreeInSign: number,
  isDayChart: boolean,
): string {
  const sign = signName.trim();
  const dom = DOMICILE_LORD[sign] ?? "?";
  const exalt = EXALTATION_LORD[sign] ?? "-";
  const trip = getTriplicityLord(sign, isDayChart) ?? "-";
  const term = getTermLord(sign, degreeInSign) ?? "-";
  const face = getFaceLord(sign, degreeInSign) ?? "-";
  const alm = almutenOfDegree(sign, degreeInSign, isDayChart).winner ?? "-";
  return `룰러:${dom}/엑절:${exalt}/트리플:${trip}/텀:${term}/페이스:${face} → 알무텐:${alm}`;
}

export { SIGN_ORDER, SIGN_ELEMENT, DOMICILE_LORD, EXALTATION_LORD };
