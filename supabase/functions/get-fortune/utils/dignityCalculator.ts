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
