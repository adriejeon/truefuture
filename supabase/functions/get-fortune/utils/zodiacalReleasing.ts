/**
 * 조디아컬 릴리징 (Zodiacal Releasing, Vettius Valens)
 *
 * 랏(주로 스피릿·포르투나·에로스)에서 방출하는 헬레니즘 타임로드 기법.
 * - L1(대주기): 랏이 위치한 사인에서 시작, 각 사인이 지배 행성의 행성년수만큼 지배
 *   (카프리콘은 토성 30년이 아닌 27년 — 발렌스 예외)
 * - L2(중주기): 각 L1 기간 내부를 같은 규칙으로 세분 (사인 년수 → 개월 단위)
 * - 사슬 풀림(Loosing of the Bond): L2 순환이 L1 시작 사인으로 한 바퀴 돌아오면
 *   그 사인을 반복하지 않고 반대편 사인으로 도약해 계속 진행 → 삶의 궤도가 크게
 *   전환되는 신호로 해석
 * - 정점(Peak): L2 사인이 포르투나 기준 앵글(1·10·7·4번째)일 때, 특히 10번째가
 *   직업·성취가 외부로 드러나는 최상 구간
 *
 * 시간 단위: 1년 = 365.25일, 1개월 = 365.25/12일 (현대 표준 구현 관례)
 */

import { SIGNS } from "./astrologyCalculator.ts";

const YEAR_DAYS = 365.25;
const MONTH_DAYS = YEAR_DAYS / 12;
const DAY_MS = 86400000;

/** 사인별 릴리징 년수 (지배 행성의 행성년수, 카프리콘만 27) */
export const ZR_SIGN_YEARS: Record<string, number> = {
  Aries: 15, // Mars
  Taurus: 8, // Venus
  Gemini: 20, // Mercury
  Cancer: 25, // Moon
  Leo: 19, // Sun
  Virgo: 20, // Mercury
  Libra: 8, // Venus
  Scorpio: 15, // Mars
  Sagittarius: 12, // Jupiter
  Capricorn: 27, // Saturn (발렌스 예외: 30이 아닌 27)
  Aquarius: 30, // Saturn
  Pisces: 12, // Jupiter
};

const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars",
  Taurus: "Venus",
  Gemini: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Virgo: "Mercury",
  Libra: "Venus",
  Scorpio: "Mars",
  Sagittarius: "Jupiter",
  Capricorn: "Saturn",
  Aquarius: "Saturn",
  Pisces: "Jupiter",
};

export interface ZrPeriod {
  level: 1 | 2;
  sign: string;
  ruler: string;
  from: Date;
  to: Date;
  /** 이 기간이 '사슬 풀림' 도약으로 시작됐는가 (L2 전용) */
  loosingOfBond?: boolean;
  /** 포르투나 사인 기준 몇 번째 사인인가 (1~12, 옵션 제공 시) */
  houseFromFortune?: number;
  /** 정점 구간 여부 (포르투나 기준 1·10·7·4번째) */
  isPeak?: boolean;
}

export interface ZodiacalReleasingResult {
  lotSign: string;
  l1: ZrPeriod[];
  l2: ZrPeriod[];
}

function signIndexOf(longitude: number): number {
  return Math.floor((((longitude % 360) + 360) % 360) / 30) % 12;
}

function annotateFortune(p: ZrPeriod, fortuneSignIndex: number | null): ZrPeriod {
  if (fortuneSignIndex == null) return p;
  const idx = SIGNS.indexOf(p.sign);
  const house = ((idx - fortuneSignIndex + 12) % 12) + 1;
  p.houseFromFortune = house;
  p.isPeak = house === 1 || house === 10 || house === 7 || house === 4;
  return p;
}

/**
 * 조디아컬 릴리징 L1/L2 계산.
 *
 * @param lotLongitude 방출 기준 랏의 절대 황경 (예: chartData.lots.spirit.degree)
 * @param birthDate 출생 시각 (UTC Date)
 * @param untilDate 이 시점까지의 기간을 생성 (L1은 전체, L2는 untilDate와 겹치는 L1만)
 * @param options fortuneLongitude 를 주면 각 기간에 포르투나 기준 위치·정점 여부 주석
 */
export function calculateZodiacalReleasing(
  lotLongitude: number,
  birthDate: Date,
  untilDate: Date,
  options?: { fortuneLongitude?: number; l2FromDate?: Date },
): ZodiacalReleasingResult {
  const startIdx = signIndexOf(lotLongitude);
  const fortuneSignIndex =
    options?.fortuneLongitude != null ? signIndexOf(options.fortuneLongitude) : null;
  const l2From = options?.l2FromDate ?? birthDate;

  // ---- L1: 랏 사인부터 순행, untilDate 를 덮을 때까지 ----
  const l1: ZrPeriod[] = [];
  let cursor = new Date(birthDate.getTime());
  let idx = startIdx;
  // 안전 가드: 최대 130년
  const hardEnd = new Date(birthDate.getTime() + 130 * YEAR_DAYS * DAY_MS);
  const genUntil = untilDate < hardEnd ? untilDate : hardEnd;
  while (cursor < genUntil) {
    const sign = SIGNS[idx];
    const years = ZR_SIGN_YEARS[sign];
    const to = new Date(cursor.getTime() + years * YEAR_DAYS * DAY_MS);
    l1.push(
      annotateFortune(
        { level: 1, sign, ruler: SIGN_RULERS[sign], from: new Date(cursor.getTime()), to },
        fortuneSignIndex,
      ),
    );
    cursor = to;
    idx = (idx + 1) % 12;
  }

  // ---- L2: 관심 구간과 겹치는 L1 기간만 세분 ----
  const l2: ZrPeriod[] = [];
  for (const major of l1) {
    if (major.to < l2From || major.from > genUntil) continue;
    const majorStartIdx = SIGNS.indexOf(major.sign);
    let subCursor = new Date(major.from.getTime());
    let subIdx = majorStartIdx;
    let steps = 0; // 시작 사인 포함 몇 번째 서브기간인지
    let bondLoosed = false;
    while (subCursor < major.to) {
      let lb = false;
      // 사슬 풀림: 순환이 시작 사인으로 '되돌아온' 시점 (첫 12번째 스텝)에
      // 그 사인을 반복하지 않고 반대편 사인으로 도약
      if (steps > 0 && subIdx === majorStartIdx && !bondLoosed) {
        subIdx = (subIdx + 6) % 12;
        lb = true;
        bondLoosed = true;
      }
      const sign = SIGNS[subIdx];
      const months = ZR_SIGN_YEARS[sign];
      let to = new Date(subCursor.getTime() + months * MONTH_DAYS * DAY_MS);
      if (to > major.to) to = new Date(major.to.getTime()); // L1 경계에서 절단
      if (to > l2From && subCursor < genUntil) {
        l2.push(
          annotateFortune(
            {
              level: 2,
              sign,
              ruler: SIGN_RULERS[sign],
              from: new Date(subCursor.getTime()),
              to,
              loosingOfBond: lb || undefined,
            },
            fortuneSignIndex,
          ),
        );
      }
      subCursor = to;
      subIdx = (subIdx + 1) % 12;
      steps++;
    }
  }

  return { lotSign: SIGNS[startIdx], l1, l2 };
}
