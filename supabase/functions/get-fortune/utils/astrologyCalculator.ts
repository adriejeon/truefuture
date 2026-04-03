/**
 * 🌟 점성술 계산 유틸리티 모듈
 * astronomy-engine을 사용하여 차트 계산 및 Aspect 분석을 수행합니다.
 */

// Deno npm 스펙(npm:...) — Edge Function 런타임에서는 정상 동작, IDE는 Node 해석기 사용 시 경고 표시
// @ts-ignore
import {
  MakeTime,
  Body,
  GeoVector,
  Ecliptic,
  SiderealTime,
  SearchSunLongitude,
  Observer,
  Horizon,
  Equator,
} from "npm:astronomy-engine@2.1.19";
import type {
  ChartData,
  Location,
  PlanetPosition,
  QuadrantStrength,
  TransitNatalPlacement,
  Aspect,
  ProfectionData,
  SolarReturnOverlay,
  FirdariaResult,
  InteractionResult,
  ProgressionResult,
  DailyAspectWithPhase,
  DailyAngleStrike,
  LordProfectionAngleEntry,
  AspectPhase,
} from "../types.ts";

// ========== 상수 정의 ==========
export const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

export const PLANETS = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

export const PLANET_NAMES: Record<string, string> = {
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

// Aspect 타입 정의 (합/충/형 6°, 삼합/육합 4°)
export const ASPECT_TYPES = {
  CONJUNCTION: { name: "Conjunction", angle: 0, orb: 6 },
  OPPOSITION: { name: "Opposition", angle: 180, orb: 6 },
  SQUARE: { name: "Square", angle: 90, orb: 6 },
  TRINE: { name: "Trine", angle: 120, orb: 4 },
  SEXTILE: { name: "Sextile", angle: 60, orb: 4 },
};

// 3외행성 키워드 정의 (데일리 운세, 자유 상담소 시기 추운용)
export const OUTER_PLANET_KEYWORDS: Record<string, string> = {
  Uranus:
    "갑작스러운 흉사, 예측 불가능한 사건, 교통사고, 탈것에 의한 사고, 갑작스러운 외적 사고, 급작스럽게 들이닥치는 변화",
  Neptune:
    "사리분별 불가, 흐릿해짐, 약물 복용, 잘못된 판단, 술로 인한 실수, 건강 악화로 인한 약 복용, 현실감각 상실",
  Pluto:
    "거시적 흉사, 개인 의지와 무관한 큰 사건, 큰 흐름에 휘말림, 새우 등 터지는 상황, 통제 불가능한 거대한 변화",
};

// ========== 유틸리티 함수 ==========

/**
 * 각도를 0-360 범위로 정규화
 */
export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * 황도 경도로부터 별자리와 별자리 내 각도를 계산
 */
export function getSignFromLongitude(longitude: number): {
  sign: string;
  degreeInSign: number;
} {
  const normalized = normalizeDegrees(longitude);
  const signIndex = Math.floor(normalized / 30);
  const degreeInSign = normalized % 30;

  return {
    sign: SIGNS[signIndex],
    degreeInSign: degreeInSign,
  };
}

/**
 * Whole Sign House System을 사용하여 하우스 계산
 */
export function getWholeSignHouse(
  longitude: number,
  ascendantLon: number,
): number {
  const normalized = normalizeDegrees(longitude);
  const ascNormalized = normalizeDegrees(ascendantLon);

  const ascSignIndex = Math.floor(ascNormalized / 30);
  const planetSignIndex = Math.floor(normalized / 30);

  let house = planetSignIndex - ascSignIndex + 1;

  if (house < 1) house += 12;
  if (house > 12) house -= 12;

  return house;
}

/** 상승점 계산 결과 (ascendant + RAMC for MC 계산) */
export interface AscendantResult {
  ascendant: number;
  ramc: number;
}

/**
 * RAMC(천정의 적경)를 황도 경도로 변환 → MC(천정)의 황경.
 * IC = MC + 180° 로 구하면 됨.
 */
export function ramcToEclipticLongitude(ramcDeg: number): number {
  const obliquity = 23.4392911;
  const obliquityRad = obliquity * (Math.PI / 180);
  const ramcRad = (normalizeDegrees(ramcDeg) * Math.PI) / 180;
  // tan(λ) = sin(RAMC) / (cos(RAMC) * cos(ε)) → λ = atan2(sin(RAMC), cos(RAMC) * cos(ε))
  const y = Math.sin(ramcRad);
  const x = Math.cos(ramcRad) * Math.cos(obliquityRad);
  const lambdaRad = Math.atan2(y, x);
  return normalizeDegrees((lambdaRad * 180) / Math.PI);
}

/**
 * 상승점(Ascendant) 계산. MC 계산을 위해 RAMC도 반환.
 */
export function calculateAscendant(
  date: Date,
  lat: number,
  lng: number,
  time: any,
): AscendantResult {
  // 호출 시점 검증: 잘못된 Date면 즉시 throw (새벽 등 잘못 계산되는 것 방지)
  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime()) ||
    !Number.isFinite(date.getTime())
  ) {
    throw new Error(
      `calculateAscendant: invalid date (expected valid Date, got: ${date})`,
    );
  }

  // 1. 그리니치 항성시(GMST) 계산
  const gmst = SiderealTime(time); // 시간 단위로 반환

  // 2. 지방 항성시(LST) = GMST + (경도 / 15)
  const lst = gmst + lng / 15;

  // 3. RAMC (Right Ascension of MC) - 도 단위로 변환
  const ramc = normalizeDegrees(lst * 15);

  // 4. 황도경사각 (obliquity of the ecliptic) - J2000 기준 약 23.44도
  const obliquity = 23.4392911;
  const obliquityRad = obliquity * (Math.PI / 180);
  const latRad = lat * (Math.PI / 180);
  const ramcRad = ramc * (Math.PI / 180);

  // 5. 상승점 계산 공식 (360도 전 구간 무결점 표준 로직)
  // y = cos(RAMC)
  // x = - (sin(RAMC) * cos(obliquity) + tan(lat) * sin(obliquity))
  const y = Math.cos(ramcRad);
  const x = -(Math.sin(ramcRad) * Math.cos(obliquityRad) + Math.tan(latRad) * Math.sin(obliquityRad));

  const ascendantRad = Math.atan2(y, x);
  let ascendant = (ascendantRad * 180) / Math.PI;

  // 음수일 경우 360도를 더해 양수화하고 정규화
  if (ascendant < 0) {
    ascendant += 360;
  }
  ascendant = ascendant % 360;

  return {
    ascendant,
    ramc,
  };
}

/**
 * Part of Fortune 계산 (Day: Asc+Moon-Sun, Night: Asc+Sun-Moon)
 */
export function calculateFortuna(
  ascendant: number,
  moonLon: number,
  sunLon: number,
  isDayChart: boolean = true,
): number {
  const fortuna = isDayChart
    ? ascendant + moonLon - sunLon
    : ascendant + sunLon - moonLon;
  return normalizeDegrees(fortuna);
}

/**
 * 행성의 황도 경도 계산
 */
export function getPlanetLongitude(body: any, time: any): number {
  try {
    const vector = GeoVector(body, time, true);
    const ecliptic = Ecliptic(vector);
    const longitude = ecliptic.elon;

    return normalizeDegrees(longitude);
  } catch (error: any) {
    console.error(`Error calculating planet longitude for ${body}:`, error);
    throw new Error(`Failed to calculate planet longitude: ${error.message}`);
  }
}

/** 1시간(ms) — 역행/속도 계산용 델타 */
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * 두 시점의 황경 차이를 signed delta(도)로 반환 (역행 시 음수).
 * 360도 wrap을 고려한다.
 */
function signedLongitudeDelta(lon1: number, lon2: number): number {
  let d = normalizeDegrees(lon2) - normalizeDegrees(lon1);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * 행성의 역행 여부와 속도(deg/일) 계산.
 * t와 t+1시간의 황경을 비교. 태양·달은 항상 isRetrograde: false.
 */
export function getPlanetRetrogradeAndSpeed(
  body: any,
  time: any,
  date: Date,
): { isRetrograde: boolean; speed: number } {
  const lonNow = getPlanetLongitude(body, time);
  const datePlus1h = new Date(date.getTime() + ONE_HOUR_MS);
  const timePlus1h = MakeTime(datePlus1h);
  const lonLater = getPlanetLongitude(body, timePlus1h);

  const deltaDeg = signedLongitudeDelta(lonNow, lonLater);
  const speedPerDay = deltaDeg * 24;

  const isRetrograde = speedPerDay < 0;

  return { isRetrograde, speed: speedPerDay };
}

/** 행성 표기명(Lord of the Year 등) → 차트 키 */
const PLANET_DISPLAY_NAME_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
};

/**
 * 특정 시점에서 행성의 황경과 속도(deg/일)를 반환.
 * 연주–항성 회합 등 트랜짓 판별용.
 */
export function getPlanetLongitudeAndSpeed(
  planetKey: string,
  date: Date,
): { longitude: number; speed: number } {
  const body = (PLANETS as Record<string, unknown>)[planetKey];
  if (!body) {
    throw new Error(`Unknown planet key: ${planetKey}`);
  }
  const time = MakeTime(date);
  const longitude = getPlanetLongitude(body, time);
  const { speed } = getPlanetRetrogradeAndSpeed(body, time, date);
  return { longitude, speed };
}

/** 연주 행성명(예: Jupiter) → 차트 키(예: jupiter) */
export function getLordKeyFromName(lordName: string): string | null {
  return PLANET_DISPLAY_NAME_TO_KEY[lordName] ?? null;
}

// ========== 주요 계산 함수 ==========

/**
 * 점성술 차트 계산
 * @param date - 계산할 날짜/시간 (UTC). JavaScript Date는 절대 시각(UTC)을 담고 있음.
 * @param location - 위치 정보 (위도, 경도)
 * @param timezoneOffsetHours - (현재 미사용) 예약: 솔라 리턴 기준일 포맷팅·결과물 현지 시간 표시용.
 *   천체/하우스 계산에 date를 변형하는 데 사용하지 않음 — 이중 타임존 시프트 방지.
 * @returns 계산된 차트 데이터
 */
export async function calculateChart(
  date: Date,
  location: Location,
  timezoneOffsetHours: number = 0,
): Promise<ChartData> {
  try {
    const { lat, lng } = location;

    // 입력 검증: NaN·잘못된 Date로 차트가 새벽 등 잘못 계산되는 것 방지
    if (
      !(date instanceof Date) ||
      Number.isNaN(date.getTime()) ||
      !Number.isFinite(date.getTime())
    ) {
      throw new Error(
        `calculateChart: invalid date (expected valid Date, got: ${date})`,
      );
    }

    if (typeof lat !== "number" || isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error("Invalid latitude.");
    }

    if (typeof lng !== "number" || isNaN(lng) || lng < -180 || lng > 180) {
      throw new Error("Invalid longitude.");
    }

    // 절대 시각(UTC) 그대로 엔진에 주입. Date에 오프셋을 더/빼지 않음 (이중 시프트 방지).
    const time = MakeTime(date);

    // 상승점/하우스: GMST(date) + 경도 보정으로 LST 산출. 동일한 UTC date 사용.
    const { ascendant, ramc } = calculateAscendant(date, lat, lng, time);
    const ascendantSignInfo = getSignFromLongitude(ascendant);

    const midheaven = ramcToEclipticLongitude(ramc);
    const alcabitiusCusps = calculateAlcabitiusCusps(
      ascendant,
      midheaven,
      lat,
      ramc,
    );

    // 행성 위치 계산 (역행·속도 포함)
    const planetsData: any = {};
    const luminaries = new Set(["sun", "moon"]);

    for (const [planetName, body] of Object.entries(PLANETS)) {
      try {
        const longitude = getPlanetLongitude(body, time);
        const signInfo = getSignFromLongitude(longitude);
        const house = getWholeSignHouse(longitude, ascendant);
        const qsHouse = alcabitiusHouseForLongitude(longitude, alcabitiusCusps);

        let isRetrograde = false;
        let speed: number | undefined;

        if (luminaries.has(planetName)) {
          isRetrograde = false;
          const motion = getPlanetRetrogradeAndSpeed(body, time, date);
          speed = motion.speed;
        } else {
          const motion = getPlanetRetrogradeAndSpeed(body, time, date);
          isRetrograde = motion.isRetrograde;
          speed = motion.speed;
        }

        planetsData[planetName] = {
          sign: signInfo.sign,
          degree: longitude,
          degreeInSign: signInfo.degreeInSign,
          house: house,
          qsHouse,
          qsStrength: quadrantStrengthFromHouse(qsHouse),
          isRetrograde,
          ...(speed !== undefined && { speed }),
        };
      } catch (planetError: any) {
        console.error(`❌ ${planetName} 계산 실패:`, planetError);
        throw new Error(
          `Failed to calculate ${planetName} position: ${planetError.message}`,
        );
      }
    }

    const moonLon = planetsData.moon.degree;
    const sunLon = planetsData.sun.degree;
    const isDayChart =
      planetsData.sun.house >= 7 && planetsData.sun.house <= 12;

    const fortunaLon = calculateFortuna(ascendant, moonLon, sunLon, isDayChart);
    const fortunaSignInfo = getSignFromLongitude(fortunaLon);
    const fortunaHouse = getWholeSignHouse(fortunaLon, ascendant);
    const fortunaQsHouse = alcabitiusHouseForLongitude(
      fortunaLon,
      alcabitiusCusps,
    );

    const result: ChartData = {
      date: date.toISOString(),
      location: { lat, lng },
      houses: {
        system: "Whole Sign",
        ramcDegrees: ramc,
        angles: {
          ascendant: ascendant,
          midheaven: midheaven,
        },
      },
      planets: planetsData,
      fortuna: {
        sign: fortunaSignInfo.sign,
        degree: fortunaLon,
        degreeInSign: fortunaSignInfo.degreeInSign,
        house: fortunaHouse,
        qsHouse: fortunaQsHouse,
        qsStrength: quadrantStrengthFromHouse(fortunaQsHouse),
        isRetrograde: false,
      },
    };

    return result;
  } catch (error: any) {
    console.error("❌ 차트 계산 중 에러 발생:", error);
    throw new Error(
      `Chart calculation failed: ${error.message || "Unknown error occurred"}`,
    );
  }
}

/**
 * 두 각도 간의 최소 각도 차이를 계산 (0-180도 범위)
 */
export function calculateAngleDifference(
  angle1: number,
  angle2: number,
): number {
  const diff = Math.abs(normalizeDegrees(angle1) - normalizeDegrees(angle2));
  return diff > 180 ? 360 - diff : diff;
}

// ========== Primary Directions (Placidus, Naibod Key) ==========

const OBLIQUITY_DEG = 23.44;
const NAIBOD_KEY = 0.985647;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}
function toDeg(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * 황경/황위 → 적경(RA). lon, lat, obliquity in degrees; returns RA in degrees (0–360).
 * tan(RA) = (sin(lon)*cos(eps) - tan(lat)*sin(eps)) / cos(lon)
 */
export function toRightAscension(
  lon: number,
  lat: number,
  obliquity: number = OBLIQUITY_DEG,
): number {
  const lonR = toRad(lon);
  const latR = toRad(lat);
  const epsR = toRad(obliquity);
  const num = Math.sin(lonR) * Math.cos(epsR) - Math.tan(latR) * Math.sin(epsR);
  const den = Math.cos(lonR);
  let ra = Math.atan2(num, den);
  if (ra < 0) ra += 2 * Math.PI;
  return normalizeDegrees(toDeg(ra));
}

/**
 * 황경/황위 → 적위(Declination). lon, lat, obliquity in degrees; returns Decl in degrees.
 * sin(Decl) = sin(lat)*cos(eps) + cos(lat)*sin(eps)*sin(lon)
 */
export function toDeclination(
  lon: number,
  lat: number,
  obliquity: number = OBLIQUITY_DEG,
): number {
  const lonR = toRad(lon);
  const latR = toRad(lat);
  const epsR = toRad(obliquity);
  const sinDecl =
    Math.sin(latR) * Math.cos(epsR) +
    Math.cos(latR) * Math.sin(epsR) * Math.sin(lonR);
  const decl = Math.asin(Math.max(-1, Math.min(1, sinDecl)));
  return toDeg(decl);
}

/**
 * 적경/적위 → 사경(OA). ra, decl, geoLat in degrees; returns OA in degrees (0–360).
 * Formula: OA = RA - degrees(atan(tan(radians(geoLat)) * tan(radians(decl))))
 */
export function toObliqueAscension(
  ra: number,
  decl: number,
  geoLat: number,
): number {
  const geoLatR = toRad(geoLat);
  const declR = toRad(decl);
  const adRad = Math.atan(Math.tan(geoLatR) * Math.tan(declR));
  const adDeg = toDeg(adRad);
  let oa = ra - adDeg;
  return normalizeDegrees(oa);
}

// ========== Alcabitius (Quadrant Strength) ==========

/** ramcToEclipticLongitude / calculateAscendant와 동일 황도경사각 */
const ALCABITIUS_OBLIQUITY_DEG = 23.4392911;

/**
 * 적경상 최단 방향 각차(도, -180 초과 ~ 180 이하). MC→ASC, ASC→IC 적경 3등분에 사용.
 */
function directedShortestRaDeltaDeg(fromRa: number, toRa: number): number {
  let d = normalizeDegrees(toRa - fromRa);
  if (d > 180) d -= 360;
  return d;
}

/**
 * 황경 lon이 [start, end) 황도 순방향(0→360) 반개구간에 있는지. 경계: 시작 커스프는 해당 하우스에 포함.
 */
function longitudeInForwardHalfOpenArc(
  lon: number,
  start: number,
  end: number,
): boolean {
  const p = normalizeDegrees(lon);
  const a = normalizeDegrees(start);
  const b = normalizeDegrees(end);
  const arcLen = normalizeDegrees(b - a);
  if (arcLen < 1e-8) return false;
  const t = normalizeDegrees(p - a);
  return t + 1e-9 < arcLen;
}

/**
 * 알카비티우스 12 커스프 황경(도). 인덱스 0=1하우스 … 11=12하우스.
 * 적경 구간은 `toRightAscension`(β=0)과 RAMC(선택)를 사용하고, 적경→황경은 `ramcToEclipticLongitude`와 동일한 구면식(atan2)으로 복원합니다.
 *
 * @param ascLongitude 상승점 황경
 * @param mcLongitude MC 황경
 * @param _lat 출생지 위도(표준 알카비티우스 적경 3등분에는 불필요하나 API·향후 극지 확장용)
 * @param ramcDegrees RAMC(도). 네이탈과 일치시키려면 `calculateAscendant`의 `ramc` 전달. 생략 시 MC 황경에서 역산한 적경 사용.
 */
export function calculateAlcabitiusCusps(
  ascLongitude: number,
  mcLongitude: number,
  _lat: number,
  ramcDegrees?: number,
): number[] {
  const eps = ALCABITIUS_OBLIQUITY_DEG;
  const raMc =
    ramcDegrees !== undefined
      ? normalizeDegrees(ramcDegrees)
      : toRightAscension(mcLongitude, 0, eps);
  const raAsc = toRightAscension(ascLongitude, 0, eps);
  const icLon = normalizeDegrees(mcLongitude + 180);
  const raIc = toRightAscension(icLon, 0, eps);

  const dMcAsc = directedShortestRaDeltaDeg(raMc, raAsc);
  const thirdTop = dMcAsc / 3;
  const ra11 = normalizeDegrees(raMc + thirdTop);
  const ra12 = normalizeDegrees(raMc + 2 * thirdTop);

  const dAscIc = directedShortestRaDeltaDeg(raAsc, raIc);
  const thirdBot = dAscIc / 3;
  const ra2 = normalizeDegrees(raAsc + thirdBot);
  const ra3 = normalizeDegrees(raAsc + 2 * thirdBot);

  const cusp1 = normalizeDegrees(ascLongitude);
  const cusp2 = ramcToEclipticLongitude(ra2);
  const cusp3 = ramcToEclipticLongitude(ra3);
  const cusp4 = icLon;
  const cusp11 = ramcToEclipticLongitude(ra11);
  const cusp12 = ramcToEclipticLongitude(ra12);
  const cusp5 = normalizeDegrees(cusp11 + 180);
  const cusp6 = normalizeDegrees(cusp12 + 180);
  const cusp7 = normalizeDegrees(ascLongitude + 180);
  const cusp8 = normalizeDegrees(cusp2 + 180);
  const cusp9 = normalizeDegrees(cusp3 + 180);
  const cusp10 = normalizeDegrees(mcLongitude);

  return [
    cusp1,
    cusp2,
    cusp3,
    cusp4,
    cusp5,
    cusp6,
    cusp7,
    cusp8,
    cusp9,
    cusp10,
    cusp11,
    cusp12,
  ];
}

/**
 * 행성 황경이 알카비티우스 커스프 순서상 몇 하우스에 속하는지 (1–12).
 */
export function alcabitiusHouseForLongitude(
  longitude: number,
  cusps12: readonly number[],
): number {
  if (cusps12.length !== 12) {
    throw new Error("alcabitiusHouseForLongitude: expected 12 cusps");
  }
  const p = normalizeDegrees(longitude);
  for (let h = 1; h <= 12; h++) {
    const start = normalizeDegrees(cusps12[h - 1]);
    const end = normalizeDegrees(cusps12[h % 12]);
    if (longitudeInForwardHalfOpenArc(p, start, end)) return h;
  }
  return 12;
}

/** 알카비티우스 하우스 번호 → Quadrant Strength (앵글/서시던트/케이던트) */
export function quadrantStrengthFromHouse(house: number): QuadrantStrength {
  const h = ((((Math.floor(house) - 1) % 12) + 12) % 12) + 1;
  if (h === 1 || h === 4 || h === 7 || h === 10) return "Angle";
  if (h === 2 || h === 5 || h === 8 || h === 11) return "Succedent";
  return "Cadent";
}

/**
 * 트랜짓 황경이 네이탈 차트 기준 Whole Sign 하우스·알카비티우스 QS 하우스에 어디에 해당하는지.
 */
export function getTransitPointNatalWsQs(
  natalChart: ChartData,
  transitLongitude: number,
): TransitNatalPlacement {
  const asc = natalChart.houses.angles.ascendant;
  const mc = natalChart.houses.angles.midheaven;
  const lat = natalChart.location?.lat ?? 0;
  const ramcOpt = natalChart.houses.ramcDegrees;
  const cusps = calculateAlcabitiusCusps(asc, mc, lat, ramcOpt);
  const qsHouse = alcabitiusHouseForLongitude(transitLongitude, cusps);
  return {
    wsHouse: getWholeSignHouse(transitLongitude, asc),
    qsHouse,
    qsStrength: quadrantStrengthFromHouse(qsHouse),
  };
}

export interface PrimaryDirectionHit {
  name: string;
  /** "Promissor -> Target" (e.g. "Moon -> IC") */
  pair: string;
  type: "Direct" | "Converse";
  age: number;
  arc: number;
  /** 서기 연도 (향후 10년 타임라인용) */
  year: number;
  /** YYYY.MM (생년월일 + EventAge로 계산) */
  eventDate: string;
}

/**
 * Primary Directions (Placidus, Naibod Key). Direct and Converse, next 10 years.
 * Targets: MC/IC (RA), Asc/Dsc (OA), Natal Sun/Moon (OA).
 * Promissors: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn.
 * Arc Direct  = normalizeDegrees(Promissor - Target). Arc Converse = normalizeDegrees(Target - Promissor).
 * EventAge = Arc / NAIBOD_KEY. Returns only currentAge <= EventAge <= currentAge + 10.
 */
export function calculatePrimaryDirections(
  chartData: ChartData,
  currentAge: number,
  birthDate: Date,
): PrimaryDirectionHit[] {
  const hits: PrimaryDirectionHit[] = [];
  const geoLat = chartData.location?.lat ?? 0;
  const ascLon = chartData.houses?.angles?.ascendant ?? 0;
  const mcLon = chartData.houses?.angles?.midheaven ?? 0;
  const obliquity = OBLIQUITY_DEG;
  const lat0 = 0;
  const minAge = currentAge;
  const maxAge = currentAge + 10;

  const raMC = toRightAscension(mcLon, lat0, obliquity);
  const raIC = normalizeDegrees(raMC + 180);
  const raAsc = toRightAscension(ascLon, lat0, obliquity);
  const declAsc = toDeclination(ascLon, lat0, obliquity);
  const oaAsc = toObliqueAscension(raAsc, declAsc, geoLat);
  const oaDsc = normalizeDegrees(oaAsc + 180);

  const planets = chartData.planets ?? {};
  const sunLon = planets.sun?.degree;
  const moonLon = planets.moon?.degree;
  const oaSun =
    sunLon != null
      ? toObliqueAscension(
          toRightAscension(sunLon, lat0, obliquity),
          toDeclination(sunLon, lat0, obliquity),
          geoLat,
        )
      : null;
  const oaMoon =
    moonLon != null
      ? toObliqueAscension(
          toRightAscension(moonLon, lat0, obliquity),
          toDeclination(moonLon, lat0, obliquity),
          geoLat,
        )
      : null;

  type TargetSpec = { name: string; val: number; coord: "RA" | "OA" };
  const targets: TargetSpec[] = [
    { name: "MC", val: raMC, coord: "RA" },
    { name: "IC", val: raIC, coord: "RA" },
    { name: "Asc", val: oaAsc, coord: "OA" },
    { name: "Dsc", val: oaDsc, coord: "OA" },
  ];
  if (oaSun != null) targets.push({ name: "Sun", val: oaSun, coord: "OA" });
  if (oaMoon != null) targets.push({ name: "Moon", val: oaMoon, coord: "OA" });

  const promissors: Array<{ key: string; name: string; lon: number }> = [];
  for (const [key, data] of Object.entries(planets)) {
    if (data?.degree != null)
      promissors.push({
        key,
        name: PLANET_NAMES[key],
        lon: data.degree,
      });
  }

  const eventDateFromAge = (eventAge: number): string => {
    const d = new Date(birthDate.getTime());
    d.setUTCMonth(d.getUTCMonth() + Math.round(eventAge * 12));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return `${y}.${String(m).padStart(2, "0")}`;
  };

  const checkHit = (
    promName: string,
    targetName: string,
    directionType: "Direct" | "Converse",
    arcRaw: number,
  ) => {
    const arc = normalizeDegrees(arcRaw);
    if (arc <= 0) return;
    const eventAge = arc / NAIBOD_KEY;
    if (eventAge < minAge || eventAge > maxAge) return;
    const eventDate = eventDateFromAge(eventAge);
    const pair = `${promName} -> ${targetName}`;
    const year = parseInt(eventDate.split(".")[0], 10);
    hits.push({
      name: pair,
      pair,
      type: directionType,
      age: Math.round(eventAge * 10) / 10,
      arc: Math.round(arc * 10) / 10,
      year,
      eventDate,
    });
  };

  for (const prom of promissors) {
    const raP = toRightAscension(prom.lon, lat0, obliquity);
    const declP = toDeclination(prom.lon, lat0, obliquity);
    const oaP = toObliqueAscension(raP, declP, geoLat);

    for (const t of targets) {
      if (t.name === "Sun" && prom.key === "sun") continue;
      if (t.name === "Moon" && prom.key === "moon") continue;

      const valP = t.coord === "RA" ? raP : oaP;
      const valT = t.val;

      const arcDirect = normalizeDegrees(valP - valT);
      const arcConverse = normalizeDegrees(valT - valP);

      checkHit(prom.name, t.name, "Direct", arcDirect);
      if (arcConverse !== arcDirect)
        checkHit(prom.name, t.name, "Converse", arcConverse);
    }
  }

  return hits.sort((a, b) => a.age - b.age);
}

/**
 * Natal 차트와 Transit 차트 간의 Aspect 계산
 * @param natalChart - 출생 차트
 * @param transitChart - 현재 하늘(Transit) 차트
 * @returns Aspect 배열
 */
export function calculateAspects(
  natalChart: ChartData,
  transitChart: ChartData,
): Aspect[] {
  const aspects: Aspect[] = [];

  // Transit 행성들을 순회
  for (const [transitPlanetKey, transitPlanet] of Object.entries(
    transitChart.planets,
  )) {
    const transitPlanetName = PLANET_NAMES[transitPlanetKey];
    const transitDegree = transitPlanet.degree;

    // Natal 행성들과 비교
    for (const [natalPlanetKey, natalPlanet] of Object.entries(
      natalChart.planets,
    )) {
      const natalPlanetName = PLANET_NAMES[natalPlanetKey];
      const natalDegree = natalPlanet.degree;

      // 각도 차이 계산
      const angleDiff = calculateAngleDifference(transitDegree, natalDegree);

      // 각 Aspect 타입과 비교
      for (const [aspectKey, aspectType] of Object.entries(ASPECT_TYPES)) {
        const expectedAngle = aspectType.angle;
        const orb = aspectType.orb;
        const actualOrb = Math.abs(angleDiff - expectedAngle);

        // Orb 범위 내에 있는지 확인
        if (actualOrb <= orb) {
          const aspect: Aspect = {
            type: aspectType.name,
            orb: actualOrb,
            transitPlanet: transitPlanetName,
            natalPlanet: natalPlanetName,
            description: `Transit ${transitPlanetName} ${
              aspectType.name
            } Natal ${natalPlanetName} (orb ${actualOrb.toFixed(1)}°)`,
          };

          aspects.push(aspect);
        }
      }
    }
  }

  // Orb가 작은 순서로 정렬 (더 정확한 Aspect가 우선)
  aspects.sort((a, b) => a.orb - b.orb);

  return aspects;
}

/**
 * Transit 달이 Natal 차트의 몇 번째 하우스에 있는지 계산
 */
export function getTransitMoonHouseInNatalChart(
  natalChart: ChartData,
  transitChart: ChartData,
): number {
  return getTransitPointNatalWsQs(
    natalChart,
    transitChart.planets.moon.degree,
  ).wsHouse;
}

/** 행성 표기명 → 차트 키 (연주/트랜짓 계산용) */
const LORD_NAME_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
  Uranus: "uranus",
  Neptune: "neptune",
  Pluto: "pluto",
};

/**
 * 트랜짓 차트 내에서 모든 행성 쌍 간의 각도를 계산합니다.
 * 3외행성(Uranus, Neptune, Pluto)을 포함한 모든 트랜짓 행성들 간의 각도를 반환합니다.
 * 데일리 운세에서 현재 하늘의 행성들 간 관계를 파악하는 데 사용됩니다.
 */
export function calculateTransitToTransitAspects(
  transitChart: ChartData,
): Aspect[] {
  const aspects: Aspect[] = [];
  const planetEntries = Object.entries(transitChart.planets);

  // 모든 행성 쌍을 순회 (중복 제거: A-B와 B-A는 동일하므로 한 번만 계산)
  for (let i = 0; i < planetEntries.length; i++) {
    const [planet1Key, planet1] = planetEntries[i];
    const planet1Name = PLANET_NAMES[planet1Key];
    if (!planet1Name) continue;

    for (let j = i + 1; j < planetEntries.length; j++) {
      const [planet2Key, planet2] = planetEntries[j];
      const planet2Name = PLANET_NAMES[planet2Key];
      if (!planet2Name) continue;

      const angleDiff = calculateAngleDifference(
        planet1.degree,
        planet2.degree,
      );

      // 각 Aspect 타입과 비교
      for (const [, aspectType] of Object.entries(ASPECT_TYPES)) {
        const expectedAngle = aspectType.angle;
        const orb = aspectType.orb;
        const actualOrb = Math.abs(angleDiff - expectedAngle);

        // Orb 범위 내에 있는지 확인
        if (actualOrb <= orb) {
          aspects.push({
            type: aspectType.name,
            orb: actualOrb,
            transitPlanet: planet1Name,
            natalPlanet: planet2Name,
            description: `Transit ${planet1Name} ${aspectType.name} Transit ${planet2Name} (orb ${actualOrb.toFixed(1)}°)`,
          });
          break; // 한 행성 쌍당 하나의 가장 강한 각도만
        }
      }
    }
  }

  // Orb가 작은 순서로 정렬 (더 정확한 Aspect가 우선)
  aspects.sort((a, b) => a.orb - b.orb);

  return aspects;
}

/**
 * 연주 행성(Lord of the Year)이 트랜짓 차트에서 다른 트랜짓 행성과 맺는 각도를 계산합니다.
 * 데일리 운세에서 "연주가 오늘 하늘에서 어떤 행성과 각도를 맺는지" 해석용.
 */
export function calculateLordOfYearTransitAspects(
  transitChart: ChartData,
  lordOfTheYear: string,
): Aspect[] {
  const lordKey = LORD_NAME_TO_KEY[lordOfTheYear];
  if (!lordKey) return [];
  const lordPlanet =
    transitChart.planets?.[lordKey as keyof typeof transitChart.planets];
  if (!lordPlanet) return [];

  const lordDegree = lordPlanet.degree;
  const aspects: Aspect[] = [];

  for (const [otherKey, otherPlanet] of Object.entries(transitChart.planets)) {
    if (otherKey === lordKey) continue;
    const otherName = PLANET_NAMES[otherKey];
    if (!otherName) continue;

    const angleDiff = calculateAngleDifference(lordDegree, otherPlanet.degree);

    for (const [, aspectType] of Object.entries(ASPECT_TYPES)) {
      const expectedAngle = aspectType.angle;
      const orb = aspectType.orb;
      const actualOrb = Math.abs(angleDiff - expectedAngle);

      if (actualOrb <= orb) {
        aspects.push({
          type: aspectType.name,
          orb: actualOrb,
          transitPlanet: lordOfTheYear,
          natalPlanet: otherName,
          description: `연주 행성(${lordOfTheYear}) ${aspectType.name} Transit ${otherName} (orb ${actualOrb.toFixed(1)}°)`,
        });
        break; // 한 행성당 하나의 가장 강한 각도만
      }
    }
  }

  aspects.sort((a, b) => a.orb - b.orb);
  return aspects;
}

/**
 * 연주 행성의 트랜짓 차트 내 상태: 역행 여부, 섹트(낮/밤 차트 및 연주 행성의 섹트 적합 여부).
 * 데일리 운세 프롬프트에 "연주 행성의 현재 트랜짓에서의 상태"로 넘길 때 사용.
 */
export function getLordOfYearTransitStatus(
  transitChart: ChartData,
  lordOfTheYear: string,
): {
  isRetrograde: boolean;
  isDayChart: boolean;
  sectStatus: "day_sect" | "night_sect" | "neutral";
  isInSect: boolean;
} {
  const lordKey = LORD_NAME_TO_KEY[lordOfTheYear];
  const lordPlanet = lordKey
    ? transitChart.planets?.[lordKey as keyof typeof transitChart.planets]
    : null;

  const isRetrograde = lordPlanet?.isRetrograde === true;

  const sunHouse = transitChart.planets?.sun?.house;
  const isDayChart = sunHouse != null ? sunHouse >= 7 && sunHouse <= 12 : true;

  const sectStatus: "day_sect" | "night_sect" | "neutral" =
    DAY_SECT_PLANETS.has(lordOfTheYear)
      ? "day_sect"
      : NIGHT_SECT_PLANETS.has(lordOfTheYear)
        ? "night_sect"
        : "neutral";

  const isInSect =
    (isDayChart && DAY_SECT_PLANETS.has(lordOfTheYear)) ||
    (!isDayChart && NIGHT_SECT_PLANETS.has(lordOfTheYear));

  return { isRetrograde, isDayChart, sectStatus, isInSect };
}

// ========== 데일리 운세: Orb 한도 및 4대 감응점 타격 ==========

/** 연주/행성 각도: 접근(Applying) 시 허용 Orb (도) */
export const DAILY_ASPECT_ORB_APPLYING = 4;
/** 연주/행성 각도: 분리(Separating) 시 허용 Orb (도) */
export const DAILY_ASPECT_ORB_SEPARATING = 2;
/** 4대 감응점 타격 Orb (도) */
export const DAILY_ANGLE_STRIKE_ORB = 2;
/** Partile(완전 합) 판정: 이 값 미만이면 isPartile */
const PARTILE_ORB_DEG = 0.1;

/** 데일리: 4대 감응점 타격에만 쓰는 애스펙트 타입 (Trine 제외) */
export const DAILY_ANGLE_ASPECT_TYPES = {
  CONJUNCTION: { name: "Conjunction" as const, angle: 0 },
  SEXTILE: { name: "Sextile" as const, angle: 60 },
  SQUARE: { name: "Square" as const, angle: 90 },
  OPPOSITION: { name: "Opposition" as const, angle: 180 },
};

/** 연주가 프로펙션 앵글 알림 대상에서 제외되는 무거운 행성 (목성, 토성) */
const HEAVY_LORDS_EXCLUDED_FROM_ANGLE_ALERT = new Set(["Jupiter", "Saturn"]);

/**
 * 연주 행성(Lord of the Year)이 프로펙션 별자리를 1하우스로 둔 차트에서
 * 1, 4, 7, 10번째 앵글 하우스에 있으며, 해당 사인 내 0°~2°에 있을 때만 알림.
 * 목성·토성은 무거운 행성이므로 이 알림 대상에서 제외.
 */
export function getLordOfYearProfectionAngleEntry(
  transitChart: ChartData,
  lordOfTheYear: string,
  profectionSign: string
): LordProfectionAngleEntry | null {
  if (HEAVY_LORDS_EXCLUDED_FROM_ANGLE_ALERT.has(lordOfTheYear)) return null;

  const lordKey = LORD_NAME_TO_KEY[lordOfTheYear];
  if (!lordKey) return null;
  const lordPlanet =
    transitChart.planets?.[lordKey as keyof typeof transitChart.planets];
  if (!lordPlanet) return null;

  const natalAscIndex = SIGNS.indexOf(profectionSign);
  if (natalAscIndex === -1) return null;
  const profectionAscendant = natalAscIndex * 30;
  const lordLon = lordPlanet.degree;
  const house = getWholeSignHouse(lordLon, profectionAscendant);
  if (house !== 1 && house !== 4 && house !== 7 && house !== 10) return null;

  const degreeInSign = lordLon % 30;
  if (degreeInSign > 2) return null;

  return {
    inAngleHouse: true,
    house: house as 1 | 4 | 7 | 10,
    message: "올해 가장 중요한 이벤트 발생 시기",
  };
}

/**
 * AM/PM 두 시점의 Orb 비교로 접근(Applying)/분리(Separating) 판별
 * - Orb가 줄어들면 접근, 늘어나면 분리
 */
function getAspectPhase(orbAM: number, orbPM: number): AspectPhase {
  return orbPM < orbAM ? "Applying" : "Separating";
}

/**
 * 연주 행성이 트랜짓 차트에서 다른 트랜짓 행성과 맺는 각도를
 * 접근 4° / 분리 2° 이내로 필터하고, Applying/Separating 및 Partile 플래그 부여
 */
export function calculateLordAspectsWithPhase(
  transitChartAM: ChartData,
  transitChartPM: ChartData,
  lordOfTheYear: string,
  applyingMaxOrb: number = DAILY_ASPECT_ORB_APPLYING,
  separatingMaxOrb: number = DAILY_ASPECT_ORB_SEPARATING
): DailyAspectWithPhase[] {
  const lordKey = LORD_NAME_TO_KEY[lordOfTheYear];
  if (!lordKey) return [];
  const lordAM =
    transitChartAM.planets?.[lordKey as keyof typeof transitChartAM.planets];
  const lordPM =
    transitChartPM.planets?.[lordKey as keyof typeof transitChartPM.planets];
  if (!lordAM || !lordPM) return [];

  const results: DailyAspectWithPhase[] = [];
  for (const [otherKey, otherAM] of Object.entries(transitChartAM.planets)) {
    if (otherKey === lordKey) continue;
    const otherPM = transitChartPM.planets?.[otherKey as keyof typeof transitChartPM.planets];
    if (!otherPM) continue;
    const otherName = PLANET_NAMES[otherKey];
    if (!otherName) continue;

    for (const [, aspectType] of Object.entries(ASPECT_TYPES)) {
      const expected = aspectType.angle;
      const diffAM = calculateAngleDifference(lordAM.degree, otherAM.degree);
      const diffPM = calculateAngleDifference(lordPM.degree, otherPM.degree);
      const orbAM = Math.abs(diffAM - expected);
      const orbPM = Math.abs(diffPM - expected);
      const orb = Math.min(orbAM, orbPM);
      const phase = getAspectPhase(orbAM, orbPM);
      const withinOrb =
        (phase === "Applying" && orb <= applyingMaxOrb) ||
        (phase === "Separating" && orb <= separatingMaxOrb);
      if (!withinOrb) continue;

      const isPartile = orb < PARTILE_ORB_DEG;
      results.push({
        type: aspectType.name,
        orb: Math.round(orb * 10) / 10,
        phase,
        isPartile,
        transitPlanet: lordOfTheYear,
        otherLabel: `Transit ${otherName}`,
        description: `연주(${lordOfTheYear}) ${aspectType.name} Transit ${otherName} (orb ${orb.toFixed(1)}°, ${phase})${isPartile ? " [Partile]" : ""}`,
      });
    }
  }
  results.sort((a, b) => a.orb - b.orb);
  return results;
}

/**
 * 4대 감응점(태양, 달, 상승점, 포르투나)만 타격하는 트랜짓 각도 계산
 * Orb 2° 이내, Conjunction/Sextile/Square/Opposition만. Neo4j 메타태그는 호출처에서 채움.
 */
export function calculateDailyAngleStrikes(
  natalChart: ChartData,
  transitChartAM: ChartData,
  transitChartPM: ChartData,
  orbMax: number = DAILY_ANGLE_STRIKE_ORB
): DailyAngleStrike[] {
  const targets: Array<{
    target: DailyAngleStrike["target"];
    longitude: number;
    sign: string;
  }> = [
    {
      target: "Sun",
      longitude: natalChart.planets.sun.degree,
      sign: natalChart.planets.sun.sign,
    },
    {
      target: "Moon",
      longitude: natalChart.planets.moon.degree,
      sign: natalChart.planets.moon.sign,
    },
    {
      target: "Ascendant",
      longitude: natalChart.houses.angles.ascendant,
      sign: getSignFromLongitude(natalChart.houses.angles.ascendant).sign,
    },
    {
      target: "PartOfFortune",
      longitude: natalChart.fortuna.degree,
      sign: natalChart.fortuna.sign,
    },
  ];

  const strikes: DailyAngleStrike[] = [];
  const planetEntries = Object.entries(transitChartAM.planets);
  for (const [strikerKey, strikerAM] of planetEntries) {
    const strikerName = PLANET_NAMES[strikerKey];
    if (!strikerName) continue;
    const strikerPM = transitChartPM.planets?.[strikerKey as keyof typeof transitChartPM.planets];
    if (!strikerPM) continue;

    for (const { target, longitude: targetLon, sign: targetSign } of targets) {
      for (const [, aspectDef] of Object.entries(DAILY_ANGLE_ASPECT_TYPES)) {
        const expected = aspectDef.angle;
        const diffAM = calculateAngleDifference(strikerAM.degree, targetLon);
        const diffPM = calculateAngleDifference(strikerPM.degree, targetLon);
        const orbAM = Math.abs(diffAM - expected);
        const orbPM = Math.abs(diffPM - expected);
        const orb = Math.min(orbAM, orbPM);
        if (orb > orbMax) continue;
        const phase = getAspectPhase(orbAM, orbPM);
        const isPartile = orb < PARTILE_ORB_DEG;
        const desc = `Transit ${strikerName} ${aspectDef.name} Natal ${target} (orb ${orb.toFixed(1)}°, ${phase})${isPartile ? " [Partile]" : ""}`;
        strikes.push({
          target,
          targetSign,
          striker: strikerName,
          type: aspectDef.name,
          orb: Math.round(orb * 10) / 10,
          phase,
          isPartile,
          neo4jMetaTag: null,
          description: desc,
        });
      }
    }
  }
  strikes.sort((a, b) => a.orb - b.orb);
  return strikes;
}

// ========== Secondary Progression (진행 달) ==========

const PROGRESSION_ORB = 1;
const PROGRESSION_ASPECTS: Array<{ angle: number; label: string }> = [
  { angle: 0, label: "Conjunct" },
  { angle: 60, label: "Sextile" },
  { angle: 90, label: "Square" },
  { angle: 120, label: "Trine" },
  { angle: 180, label: "Opposition" },
];

/**
 * Secondary Progression: "A day for a year"
 * Target Time = Birth Time + (Age * 24 hours) 시점의 모든 주요 행성 위치를 계산하고,
 * Progressed Moon vs Natal 행성 / Progressed Moon vs Progressed 행성 각도를 분석.
 *
 * @param natalChart - 출생 차트 (날짜·위치·Natal 행성·Ascendant)
 * @param ageInFullYears - 만 나이 (연수)
 * @returns ProgressionResult (진행 달 별자리, Natal 기준 하우스, natalAspects, progressedAspects)
 */
export function calculateSecondaryProgression(
  natalChart: ChartData,
  ageInFullYears: number,
): ProgressionResult {
  const birthDate = new Date(natalChart.date);
  if (isNaN(birthDate.getTime())) {
    throw new Error("Invalid natalChart.date");
  }
  if (typeof ageInFullYears !== "number" || ageInFullYears < 0) {
    throw new Error("ageInFullYears must be a non-negative number");
  }

  // Target Time = Birth Time + (Age * 24 hours)
  const progressedDate = new Date(
    birthDate.getTime() + ageInFullYears * 24 * 60 * 60 * 1000,
  );
  const time = MakeTime(progressedDate);

  // 1. Calculate all progressed planets at target time
  const progressedLongitudes: Record<string, number> = {};
  for (const [planetKey, body] of Object.entries(PLANETS)) {
    progressedLongitudes[planetKey] = getPlanetLongitude(body, time);
  }

  const progMoonLongitude = progressedLongitudes.moon;
  const signInfo = getSignFromLongitude(progMoonLongitude);
  const natalAscendant = natalChart.houses.angles.ascendant;
  const progMoonHouse = getWholeSignHouse(progMoonLongitude, natalAscendant);

  // 2a. Type A: Progressed Moon vs Natal planets (Orb ±1°)
  const natalAspects: string[] = [];
  for (const [planetKey, planetData] of Object.entries(natalChart.planets)) {
    const natalPlanetName = PLANET_NAMES[planetKey];
    const natalDegree = planetData.degree;
    const angleDiff = calculateAngleDifference(progMoonLongitude, natalDegree);

    for (const { angle, label } of PROGRESSION_ASPECTS) {
      const orb = Math.abs(angleDiff - angle);
      if (orb <= PROGRESSION_ORB) {
        const exact = orb <= 0.5 ? " (Exact)" : "";
        natalAspects.push(`${label} Natal ${natalPlanetName}${exact}`);
        break;
      }
    }
  }

  // 2b. Type B: Progressed Moon vs Progressed planets (Orb ±1°), exclude Moon vs Moon
  const progressedAspects: string[] = [];
  for (const [planetKey, progLon] of Object.entries(progressedLongitudes)) {
    if (planetKey === "moon") continue;
    const progressedPlanetName = PLANET_NAMES[planetKey];
    const angleDiff = calculateAngleDifference(progMoonLongitude, progLon);

    for (const { angle, label } of PROGRESSION_ASPECTS) {
      const orb = Math.abs(angleDiff - angle);
      if (orb <= PROGRESSION_ORB) {
        const exact = orb <= 0.5 ? " (Exact)" : "";
        progressedAspects.push(
          `${label} Progressed ${progressedPlanetName}${exact}`,
        );
        break;
      }
    }
  }

  return {
    progMoonSign: signInfo.sign,
    progMoonHouse,
    natalAspects,
    progressedAspects,
  };
}

/** Progressed Moon 이벤트 타임라인 항목 (연도별) */
export interface ProgressedEventItem {
  year: number;
  age: number;
  events: string[];
}

/**
 * Secondary Progressions 10년 타임라인: 각 연도별 Progressed Moon의 Natal/Progressed 행성과의 주요 각(0,60,90,120,180) 발생 시기.
 * 1일 = 1년. startAge부터 duration년 동안 루프.
 */
export function calculateProgressedEventsTimeline(
  chartData: ChartData,
  startAge: number,
  duration: number = 10,
): ProgressedEventItem[] {
  const birthDate = new Date(chartData.date);
  if (isNaN(birthDate.getTime())) return [];
  const birthYear = birthDate.getUTCFullYear();
  const timeline: ProgressedEventItem[] = [];
  const PROGRESSION_ORB = 1;

  for (let i = 0; i < duration; i++) {
    const age = startAge + i;
    const year = birthYear + age;
    const progressedDate = new Date(
      birthDate.getTime() + age * 24 * 60 * 60 * 1000,
    );
    const time = MakeTime(progressedDate);
    const progMoonLongitude = getPlanetLongitude(PLANETS.moon, time);
    const events: string[] = [];

    // Natal 행성들과의 각도 (0, 60, 90, 120, 180)
    for (const [planetKey, planetData] of Object.entries(
      chartData.planets ?? {},
    )) {
      const natalDegree = planetData?.degree;
      if (natalDegree == null) continue;
      const natalPlanetName = PLANET_NAMES[planetKey];
      const angleDiff = calculateAngleDifference(
        progMoonLongitude,
        natalDegree,
      );
      for (const { angle, label } of PROGRESSION_ASPECTS) {
        const orb = Math.abs(angleDiff - angle);
        if (orb <= PROGRESSION_ORB) {
          const aspectLabel =
            label === "Conjunct"
              ? "conjunct"
              : label === "Sextile"
                ? "sextile"
                : label === "Square"
                  ? "square"
                  : label === "Trine"
                    ? "trine"
                    : "opposition";
          events.push(`P.Moon ${aspectLabel} Natal ${natalPlanetName}`);
          break;
        }
      }
    }

    // Natal Asc, MC와의 각도
    const ascLon = chartData.houses?.angles?.ascendant ?? 0;
    const mcLon = chartData.houses?.angles?.midheaven ?? 0;
    for (const [pointName, lon] of [
      ["Asc", ascLon],
      ["MC", mcLon],
    ] as const) {
      const angleDiff = calculateAngleDifference(progMoonLongitude, lon);
      for (const { angle, label } of PROGRESSION_ASPECTS) {
        const orb = Math.abs(angleDiff - angle);
        if (orb <= PROGRESSION_ORB) {
          const aspectLabel =
            label === "Conjunct"
              ? "conjunct"
              : label === "Sextile"
                ? "sextile"
                : label === "Square"
                  ? "square"
                  : label === "Trine"
                    ? "trine"
                    : "opposition";
          events.push(`P.Moon ${aspectLabel} Natal ${pointName}`);
          break;
        }
      }
    }

    timeline.push({ year, age, events });
  }

  return timeline;
}

// ========== Solar Arc Direction (솔라 아크 디렉션) ==========

// ========== Solar Return & Profection 계산 함수 ==========

/**
 * 별자리의 지배 행성(Ruler) 반환
 */
export function getSignRuler(sign: string): string {
  const rulers: Record<string, string> = {
    Aries: "Mars",
    Taurus: "Venus",
    Gemini: "Mercury",
    Cancer: "Moon",
    Leo: "Sun",
    Virgo: "Mercury",
    Libra: "Venus",
    Scorpio: "Mars", // 고전 점성술: Mars (현대: Pluto)
    Sagittarius: "Jupiter",
    Capricorn: "Saturn",
    Aquarius: "Saturn", // 고전 점성술: Saturn (현대: Uranus)
    Pisces: "Jupiter", // 고전 점성술: Jupiter (현대: Neptune)
  };

  return rulers[sign] || "Unknown";
}

// ========== Career & Wealth (Hellenistic) ==========

/** 행성별 Domicile(본집) 별자리 */
const DOMICILE_SIGNS: Record<string, string[]> = {
  Sun: ["Leo"],
  Moon: ["Cancer"],
  Mercury: ["Gemini", "Virgo"],
  Venus: ["Taurus", "Libra"],
  Mars: ["Aries", "Scorpio"],
  Jupiter: ["Sagittarius", "Pisces"],
  Saturn: ["Capricorn", "Aquarius"],
};

/** 행성별 Exaltation(양자리) 별자리 */
const EXALTATION_SIGNS: Record<string, string> = {
  Sun: "Aries",
  Moon: "Taurus",
  Mercury: "Virgo",
  Venus: "Pisces",
  Mars: "Capricorn",
  Jupiter: "Cancer",
  Saturn: "Libra",
};

/** Sect: 낮 차트 = Sun, Jupiter, Saturn / 밤 차트 = Moon, Venus, Mars */
const DAY_SECT_PLANETS = new Set(["Sun", "Jupiter", "Saturn"]);
const NIGHT_SECT_PLANETS = new Set(["Moon", "Venus", "Mars"]);
const MALEFICS = new Set(["Mars", "Saturn"]);

/** 직업 키워드 (Hellenistic Career Significators) */
const CAREER_KEYWORDS: Record<string, string> = {
  Sun: "리더십/정치/공직",
  Moon: "돌봄/교육/공공",
  Mercury: "커뮤니케이션/상업/문서",
  Venus: "예술/미용/협상",
  Mars: "엔지니어/군인/스포츠",
  Jupiter: "법/교육/종교",
  Saturn: "관리/구조/장기 프로젝트",
};

/** 차트에서 낮/밤 판별 (Sun이 7–12하우스 = Day) */
function isDayChartFromChart(chartData: ChartData): boolean {
  const house = chartData.planets?.sun?.house;
  if (house == null) return true;
  return house >= 7 && house <= 12;
}

/** 두 경도 간의 Natal Aspect 타입 및 Orb 반환 (Trine/Sextile/Square/Opposition만) */
function getNatalAspect(
  lon1: number,
  lon2: number,
  options: {
    trineOrb?: number;
    sextileOrb?: number;
    squareOrb?: number;
    oppositionOrb?: number;
  } = {},
): { type: string; angle: number; orb: number } | null {
  const diff = calculateAngleDifference(lon1, lon2);
  const orbs = {
    trine: options.trineOrb ?? 4,
    sextile: options.sextileOrb ?? 4,
    square: options.squareOrb ?? 6,
    opposition: options.oppositionOrb ?? 6,
  };
  if (Math.abs(diff - 120) <= orbs.trine)
    return { type: "Trine", angle: 120, orb: Math.abs(diff - 120) };
  if (Math.abs(diff - 60) <= orbs.sextile)
    return { type: "Sextile", angle: 60, orb: Math.abs(diff - 60) };
  if (Math.abs(diff - 90) <= orbs.square)
    return { type: "Square", angle: 90, orb: Math.abs(diff - 90) };
  if (Math.abs(diff - 180) <= orbs.opposition)
    return { type: "Opposition", angle: 180, orb: Math.abs(diff - 180) };
  return null;
}

export interface PlanetScoreResult {
  score: number;
  breakdown: {
    sect: number;
    essentialDignity: number;
    bonification: number;
    maltreatment: number;
  };
}

/**
 * 고전 점성학 기준 특정 행성의 힘(Strength)을 점수화
 * Sect +3, Essential Dignity +5, Bonification +5, Maltreatment -5(또는 흉성 Sect 시 -2)
 */
export function calculatePlanetScore(
  planetName: string,
  chartData: ChartData,
): PlanetScoreResult {
  const key = planetName.toLowerCase();
  const planetData = chartData.planets?.[key as keyof typeof chartData.planets];
  if (!planetData) {
    return {
      score: 0,
      breakdown: {
        sect: 0,
        essentialDignity: 0,
        bonification: 0,
        maltreatment: 0,
      },
    };
  }

  const displayName = PLANET_NAMES[key] ?? planetName;
  const longitude = planetData.degree;
  const sign = planetData.sign;
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const isDayChart = isDayChartFromChart(chartData);
  const planets = chartData.planets ?? {};
  const breakdown = {
    sect: 0,
    essentialDignity: 0,
    bonification: 0,
    maltreatment: 0,
  };

  // Sect (+3)
  if (isDayChart && DAY_SECT_PLANETS.has(displayName)) breakdown.sect = 3;
  else if (!isDayChart && NIGHT_SECT_PLANETS.has(displayName))
    breakdown.sect = 3;

  // Essential Dignity (+5): Domicile or Exaltation
  const domicile = DOMICILE_SIGNS[displayName]?.includes(sign);
  const exaltation = EXALTATION_SIGNS[displayName] === sign;
  if (domicile || exaltation) breakdown.essentialDignity = 5;

  // Bonification (+5): Sign ruler in Trine or Sextile to this planet
  const lordName = getSignRuler(sign);
  const lordKey = PLANET_NAME_TO_KEY[lordName];
  const lordData = lordKey ? planets[lordKey as keyof typeof planets] : null;
  if (lordData && lordKey !== key) {
    const aspect = getNatalAspect(longitude, lordData.degree);
    if (aspect && (aspect.type === "Trine" || aspect.type === "Sextile"))
      breakdown.bonification = 5;
  }

  // Maltreatment (-5 or -2): Malefic (Mars/Saturn) in Square or Opposition; -2 if malefic has Sect
  for (const maleficKey of ["mars", "saturn"]) {
    const maleficData = planets[maleficKey as keyof typeof planets];
    if (!maleficData) continue;
    const aspect = getNatalAspect(longitude, maleficData.degree);
    if (!aspect || (aspect.type !== "Square" && aspect.type !== "Opposition"))
      continue;
    const maleficDisplay = PLANET_NAMES[maleficKey];
    const maleficHasSect =
      (isDayChart && maleficDisplay === "Saturn") ||
      (!isDayChart && maleficDisplay === "Mars");
    breakdown.maltreatment += maleficHasSect ? -2 : -5;
  }

  const score =
    breakdown.sect +
    breakdown.essentialDignity +
    breakdown.bonification +
    breakdown.maltreatment;
  return { score, breakdown };
}

export interface CareerCandidateResult {
  planetKey: string;
  planetName: string;
  score: number;
  sign: string;
  house: number;
  keywords: string;
  role: "MC Lord" | "POF 1st" | "POF 10th" | "POF 11th";
  /** Sect/Dignity/Bonification/Maltreatment 점수 (프롬프트용 Reason) */
  breakdown: PlanetScoreResult["breakdown"];
}

export interface CareerAnalysisResult {
  isDayChart: boolean;
  pofLongitude: number;
  pofSign: string;
  candidates: CareerCandidateResult[];
}

/**
 * 직업(Career) 운 분석: POF·MC Lord·POF 1/10/11 하우스 후보를 찾아 점수화
 */
export function analyzeCareerPotential(
  chartData: ChartData,
): CareerAnalysisResult {
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const planets = chartData.planets ?? {};
  const sunLon = planets.sun?.degree ?? 0;
  const moonLon = planets.moon?.degree ?? 0;
  const isDayChart = isDayChartFromChart(chartData);
  const pofLongitude = calculateFortuna(asc, moonLon, sunLon, isDayChart);
  const pofSignInfo = getSignFromLongitude(pofLongitude);
  const pofSign = pofSignInfo.sign;

  // Whole Sign: 1st from POF = POF sign, 10th = +9 signs, 11th = +10 signs
  const signIndex = (s: string) => SIGNS.indexOf(s);
  const tenthFromPofIndex = (signIndex(pofSign) + 9) % 12;
  const eleventhFromPofIndex = (signIndex(pofSign) + 10) % 12;
  const tenthSignFromPof = SIGNS[tenthFromPofIndex];
  const eleventhSignFromPof = SIGNS[eleventhFromPofIndex];

  const candidates: CareerCandidateResult[] = [];
  const seen = new Set<string>();

  // 1) MC (10th House) Ruler (Whole Sign: 10th = Asc + 9 signs)
  const tenthHouseSignIndex = (Math.floor(asc / 30) + 9) % 12;
  const mcSign = SIGNS[tenthHouseSignIndex];
  const mcLordName = getSignRuler(mcSign);
  const mcLordKey = PLANET_NAME_TO_KEY[mcLordName];
  if (mcLordKey && !seen.has(mcLordKey)) {
    seen.add(mcLordKey);
    const data = planets[mcLordKey as keyof typeof planets];
    const res = calculatePlanetScore(mcLordKey, chartData);
    candidates.push({
      planetKey: mcLordKey,
      planetName: PLANET_NAMES[mcLordKey],
      score: res.score,
      sign: data?.sign ?? "?",
      house: data?.house ?? 0,
      keywords: CAREER_KEYWORDS[PLANET_NAMES[mcLordKey]] ?? "",
      role: "MC Lord",
      breakdown: res.breakdown,
    });
  }

  // 2) Planets in POF 1st, 10th, 11th (by Whole Sign from POF)
  for (const [pKey, data] of Object.entries(planets)) {
    if (!data?.sign) continue;
    let role: "POF 1st" | "POF 10th" | "POF 11th" | null = null;
    if (data.sign === pofSign) role = "POF 1st";
    else if (data.sign === tenthSignFromPof) role = "POF 10th";
    else if (data.sign === eleventhSignFromPof) role = "POF 11th";
    if (!role || seen.has(pKey)) continue;
    seen.add(pKey);
    const res = calculatePlanetScore(pKey, chartData);
    candidates.push({
      planetKey: pKey,
      planetName: PLANET_NAMES[pKey],
      score: res.score,
      sign: data.sign,
      house: data.house,
      keywords: CAREER_KEYWORDS[PLANET_NAMES[pKey]] ?? "",
      role,
      breakdown: res.breakdown,
    });
  }

  return {
    isDayChart,
    pofLongitude,
    pofSign,
    candidates,
  };
}

export interface WealthOccupantInfo {
  planetName: string;
  type: "Benefic" | "Malefic";
}

export interface WealthAnalysisResult {
  isDayChart: boolean;
  pofLongitude: number;
  pofSign: string;
  acquisitionSign: string;
  occupants: WealthOccupantInfo[];
  ruler: {
    planetName: string;
    score: number;
    breakdown: PlanetScoreResult["breakdown"];
  };
}

const BENEFIC_PLANETS = new Set(["Jupiter", "Venus"]);
const WEALTH_MALEFIC_PLANETS = new Set(["Saturn", "Mars"]);

/**
 * 재물(Wealth) 운 분석: Acquisition House (POF로부터 11번째 별자리) 및 그 주인 평가
 */
export function analyzeWealthPotential(
  chartData: ChartData,
): WealthAnalysisResult {
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const planets = chartData.planets ?? {};
  const sunLon = planets.sun?.degree ?? 0;
  const moonLon = planets.moon?.degree ?? 0;
  const isDayChart = isDayChartFromChart(chartData);
  const pofLongitude = calculateFortuna(asc, moonLon, sunLon, isDayChart);
  const pofSignInfo = getSignFromLongitude(pofLongitude);
  const pofSign = pofSignInfo.sign;

  // Acquisition Sign = 11th sign from POF
  const signIndex = (s: string) => SIGNS.indexOf(s);
  const acquisitionIndex = (signIndex(pofSign) + 10) % 12;
  const acquisitionSign = SIGNS[acquisitionIndex];

  const occupants: WealthOccupantInfo[] = [];
  for (const [pKey, data] of Object.entries(planets)) {
    if (!data?.sign || data.sign !== acquisitionSign) continue;
    const name = PLANET_NAMES[pKey];
    if (BENEFIC_PLANETS.has(name))
      occupants.push({ planetName: name, type: "Benefic" });
    else if (WEALTH_MALEFIC_PLANETS.has(name))
      occupants.push({ planetName: name, type: "Malefic" });
  }

  const rulerName = getSignRuler(acquisitionSign);
  const rulerKey = PLANET_NAME_TO_KEY[rulerName];
  const rulerScoreResult = rulerKey
    ? calculatePlanetScore(rulerKey, chartData)
    : {
        score: 0,
        breakdown: {
          sect: 0,
          essentialDignity: 0,
          bonification: 0,
          maltreatment: 0,
        },
      };

  return {
    isDayChart,
    pofLongitude,
    pofSign,
    acquisitionSign,
    occupants,
    ruler: {
      planetName: rulerName,
      score: rulerScoreResult.score,
      breakdown: rulerScoreResult.breakdown,
    },
  };
}

// ========== Health Analysis (Hellenistic) ==========

export interface HealthIssue {
  issue: string;
  severity: "High" | "Medium" | "Low";
  affectedBodyPart?: string;
}

export interface HealthAnalysisResult {
  moonHealth: {
    isAfflicted: boolean;
    issues: HealthIssue[];
    description: string;
  };
  mentalHealth: {
    riskLevel: "High" | "Medium" | "Low" | "None";
    factors: string[];
    description: string;
  };
  physicalHealth: {
    riskLevel: "High" | "Medium" | "Low" | "None";
    factors: string[];
    maleficsIn6th: string[];
    description: string;
  };
  congenitalIssues: {
    hasRisk: boolean;
    factors: string[];
    bodyParts: string[];
    description: string;
  };
  overallScore: number; // -10 (very weak) ~ +10 (very strong)
  summary: string;
}

const SIGN_BODY_PARTS: { [key: string]: string } = {
  Aries: "머리/얼굴",
  Taurus: "목/인후",
  Gemini: "어깨/팔/폐",
  Cancer: "위/가슴",
  Leo: "심장/등",
  Virgo: "소화기/장",
  Libra: "신장/허리",
  Scorpio: "생식기/배설기",
  Sagittarius: "허벅지/간",
  Capricorn: "무릎/뼈/치아",
  Aquarius: "종아리/순환계",
  Pisces: "발/림프계",
};

/**
 * 건강 지표성 분석 (헬레니스틱 점성학)
 * - 달의 흉성 공격 (특히 토성)
 * - 12하우스 연관성 (정신 건강)
 * - 6하우스 흉성 (신체 건강 취약점)
 * - 어센던트 흉성 공격 + 리젝션 (선천적 건강 문제)
 */
export function analyzeHealthPotential(
  chartData: ChartData,
): HealthAnalysisResult {
  const planets = chartData.planets ?? {};
  const moon = planets.moon;
  const saturn = planets.saturn;
  const mars = planets.mars;
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const ascSign = getSignFromLongitude(asc).sign;

  let overallScore = 10; // Start optimistic
  const moonIssues: HealthIssue[] = [];
  const mentalFactors: string[] = [];
  const physicalFactors: string[] = [];
  const congenitalFactors: string[] = [];
  const congenitalBodyParts: string[] = [];
  const maleficsIn6th: string[] = [];

  // === 1. 달의 상태 체크 (흉성 공격, 특히 토성) ===
  let moonAfflicted = false;
  if (moon && saturn) {
    const aspect = getNatalAspect(moon.degree, saturn.degree, {
      squareOrb: 6,
      oppositionOrb: 6,
    });
    if (aspect && (aspect.type === "Square" || aspect.type === "Opposition")) {
      moonAfflicted = true;
      moonIssues.push({
        issue: `달이 토성에게 ${aspect.type} 공격을 받음`,
        severity: "High",
      });
      overallScore -= 4;
    }
  }
  if (moon && mars) {
    const aspect = getNatalAspect(moon.degree, mars.degree, {
      squareOrb: 6,
      oppositionOrb: 6,
    });
    if (aspect && (aspect.type === "Square" || aspect.type === "Opposition")) {
      moonAfflicted = true;
      moonIssues.push({
        issue: `달이 화성에게 ${aspect.type} 공격을 받음`,
        severity: "Medium",
      });
      overallScore -= 2;
    }
  }

  const moonDesc = moonAfflicted
    ? "달이 흉성의 공격을 받아 건강이 취약함"
    : "달의 상태가 양호함";

  // === 2. 정신 건강 (12하우스 연관성) ===
  let mentalRiskLevel: "High" | "Medium" | "Low" | "None" = "None";

  // 2.1 달이 12하우스에 위치
  if (moon) {
    const moonHouse = moon.house ?? getWholeSignHouse(moon.degree, asc);
    if (moonHouse === 12) {
      mentalFactors.push("달이 12하우스에 위치 (우울/불안 경향)");
      overallScore -= 3;
      mentalRiskLevel = "High";
    }
  }

  // 2.2 달이 12하우스 로드
  const house12Sign = getSignFromLongitude(normalizeDegrees(asc + 330)).sign; // 12th house cusp
  const house12Ruler = getSignRuler(house12Sign);
  if (moon && PLANET_NAMES.moon === house12Ruler) {
    mentalFactors.push("달이 12하우스의 로드 (정신 건강 취약)");
    overallScore -= 2;
    if (mentalRiskLevel === "None") mentalRiskLevel = "Medium";
  }

  // 2.3 토성이 12하우스에 위치
  if (saturn) {
    const saturnHouse = saturn.house ?? getWholeSignHouse(saturn.degree, asc);
    if (saturnHouse === 12) {
      mentalFactors.push("토성이 12하우스에 위치 (우울증/고독 경향)");
      overallScore -= 3;
      mentalRiskLevel = "High";
    }
  }

  // 2.4 토성이 12하우스 로드
  if (saturn && PLANET_NAMES.saturn === house12Ruler) {
    mentalFactors.push("토성이 12하우스의 로드 (만성 우울/불안)");
    overallScore -= 2;
    if (mentalRiskLevel === "None") mentalRiskLevel = "Medium";
  }

  const mentalDesc =
    mentalRiskLevel === "High"
      ? "정신 건강에 높은 주의 필요 (우울/불안 경향)"
      : mentalRiskLevel === "Medium"
        ? "정신 건강에 중간 수준 주의 필요"
        : "정신 건강 양호";

  // === 3. 신체 건강 (6하우스 흉성) ===
  let physicalRiskLevel: "High" | "Medium" | "Low" | "None" = "None";
  const house6Sign = getSignFromLongitude(normalizeDegrees(asc + 150)).sign; // 6th house cusp
  const house6Ruler = getSignRuler(house6Sign);

  // 3.1 6하우스에 화성이나 토성 위치
  if (mars) {
    const marsHouse = mars.house ?? getWholeSignHouse(mars.degree, asc);
    if (marsHouse === 6) {
      maleficsIn6th.push("Mars");
      physicalFactors.push("화성이 6하우스에 위치 (사고/수술 위험)");
      overallScore -= 3;
      physicalRiskLevel = "High";
    }
  }
  if (saturn) {
    const saturnHouse = saturn.house ?? getWholeSignHouse(saturn.degree, asc);
    if (saturnHouse === 6) {
      maleficsIn6th.push("Saturn");
      physicalFactors.push("토성이 6하우스에 위치 (만성 질환)");
      overallScore -= 3;
      physicalRiskLevel = "High";
    }
  }

  // 3.2 6하우스 로드가 흉성에게 공격
  const house6RulerKey = PLANET_NAME_TO_KEY[house6Ruler];
  if (house6RulerKey) {
    const rulerData = planets[house6RulerKey];
    if (rulerData && saturn) {
      const asp = getNatalAspect(rulerData.degree, saturn.degree, {
        squareOrb: 8,
        oppositionOrb: 8,
      });
      if (asp && (asp.type === "Square" || asp.type === "Opposition")) {
        physicalFactors.push(
          `6하우스 로드(${house6Ruler})가 토성에게 ${asp.type} 공격받음`,
        );
        overallScore -= 2;
        if (physicalRiskLevel === "None") physicalRiskLevel = "Medium";
      }
    }
    if (rulerData && mars) {
      const asp = getNatalAspect(rulerData.degree, mars.degree, {
        squareOrb: 8,
        oppositionOrb: 8,
      });
      if (asp && (asp.type === "Square" || asp.type === "Opposition")) {
        physicalFactors.push(
          `6하우스 로드(${house6Ruler})가 화성에게 ${asp.type} 공격받음`,
        );
        overallScore -= 2;
        if (physicalRiskLevel === "None") physicalRiskLevel = "Medium";
      }
    }
  }

  const physicalDesc =
    physicalRiskLevel === "High"
      ? "신체 건강에 높은 취약점 존재"
      : physicalRiskLevel === "Medium"
        ? "신체 건강에 중간 수준 주의 필요"
        : "신체 건강 양호";

  // === 4. 선천적 건강 문제 (어센던트 + 흉성 공격 + 리젝션) ===
  let hasCongenitalRisk = false;

  // 4.1 어센던트가 흉성에게 공격받는지 체크
  if (saturn) {
    const ascSaturnAsp = getNatalAspect(asc, saturn.degree, {
      squareOrb: 6,
      oppositionOrb: 6,
    });
    if (
      ascSaturnAsp &&
      (ascSaturnAsp.type === "Square" || ascSaturnAsp.type === "Opposition")
    ) {
      // 리젝션 체크: 어센던트 사인이 토성을 리젝션으로 뱉는지
      const saturnSign = getSignFromLongitude(saturn.degree).sign;
      const isRejection = checkRejection(ascSign, saturnSign);
      if (isRejection) {
        hasCongenitalRisk = true;
        congenitalFactors.push(
          `어센던트가 토성에게 ${ascSaturnAsp.type} 공격받고, 리젝션 관계`,
        );
        congenitalBodyParts.push(SIGN_BODY_PARTS[saturnSign] ?? saturnSign);
        overallScore -= 4;
      }
    }
  }
  if (mars) {
    const ascMarsAsp = getNatalAspect(asc, mars.degree, {
      squareOrb: 6,
      oppositionOrb: 6,
    });
    if (
      ascMarsAsp &&
      (ascMarsAsp.type === "Square" || ascMarsAsp.type === "Opposition")
    ) {
      const marsSign = getSignFromLongitude(mars.degree).sign;
      const isRejection = checkRejection(ascSign, marsSign);
      if (isRejection) {
        hasCongenitalRisk = true;
        congenitalFactors.push(
          `어센던트가 화성에게 ${ascMarsAsp.type} 공격받고, 리젝션 관계`,
        );
        congenitalBodyParts.push(SIGN_BODY_PARTS[marsSign] ?? marsSign);
        overallScore -= 3;
      }
    }
  }

  const congenitalDesc = hasCongenitalRisk
    ? `선천적 건강 문제 가능성 높음 (${congenitalBodyParts.join(", ")} 취약)`
    : "선천적 건강 문제 없음";

  // === 5. 종합 요약 ===
  const summaryParts: string[] = [];
  if (moonAfflicted) summaryParts.push("달 공격");
  if (mentalRiskLevel !== "None")
    summaryParts.push(`정신건강 ${mentalRiskLevel}`);
  if (physicalRiskLevel !== "None")
    summaryParts.push(`신체건강 ${physicalRiskLevel}`);
  if (hasCongenitalRisk) summaryParts.push("선천적 문제");

  const summary =
    summaryParts.length > 0 ? summaryParts.join(" / ") : "전반적으로 건강 양호";

  return {
    moonHealth: {
      isAfflicted: moonAfflicted,
      issues: moonIssues,
      description: moonDesc,
    },
    mentalHealth: {
      riskLevel: mentalRiskLevel,
      factors: mentalFactors,
      description: mentalDesc,
    },
    physicalHealth: {
      riskLevel: physicalRiskLevel,
      factors: physicalFactors,
      maleficsIn6th,
      description: physicalDesc,
    },
    congenitalIssues: {
      hasRisk: hasCongenitalRisk,
      factors: congenitalFactors,
      bodyParts: congenitalBodyParts,
      description: congenitalDesc,
    },
    overallScore,
    summary,
  };
}

/**
 * 리젝션 체크: sign1이 sign2를 리젝션으로 뱉는지
 * (예: 양자리가 전갈자리를 리젝션, 황소자리가 양자리를 리젝션 등)
 */
function checkRejection(sign1: string, sign2: string): boolean {
  const REJECTION_MAP: { [key: string]: string[] } = {
    Aries: ["Scorpio", "Virgo"],
    Taurus: ["Aries", "Libra"],
    Gemini: ["Scorpio", "Sagittarius"],
    Cancer: ["Aquarius", "Capricorn"],
    Leo: ["Capricorn", "Aquarius"],
    Virgo: ["Aries", "Pisces"],
    Libra: ["Taurus", "Pisces"],
    Scorpio: ["Aries", "Gemini"],
    Sagittarius: ["Gemini", "Taurus"],
    Capricorn: ["Cancer", "Leo"],
    Aquarius: ["Cancer", "Leo"],
    Pisces: ["Virgo", "Libra"],
  };
  return REJECTION_MAP[sign1]?.includes(sign2) ?? false;
}

// ========== Love & Marriage (Hellenistic) ==========

/**
 * Lot of Marriage (결혼의 랏) — 성별 기준 공식
 * Male: Asc + Venus - Saturn (남자는 금성을 지향)
 * Female: Asc + Saturn - Venus (여자는 토성을 지향)
 */
export function calculateLotOfMarriage(
  chartData: ChartData,
  gender: string,
): { sign: string; longitude: number } {
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const venusLon = chartData.planets?.venus?.degree ?? 0;
  const saturnLon = chartData.planets?.saturn?.degree ?? 0;
  const isFemale =
    typeof gender === "string" &&
    (gender.toUpperCase() === "F" || gender.toLowerCase() === "female");
  const lotLon = isFemale
    ? normalizeDegrees(asc + saturnLon - venusLon)
    : normalizeDegrees(asc + venusLon - saturnLon);
  const { sign } = getSignFromLongitude(lotLon);
  return { sign, longitude: lotLon };
}

export interface LoveQualitiesResult {
  score: number;
  statusDescription: string;
  interpretation: string;
}

/** Venus 연애 품질: 하우스(1,4,7,10,11=Good / 6,8,12=Weak), Combustion, Dignity/Sect */
export function analyzeLoveQualities(
  chartData: ChartData,
): LoveQualitiesResult {
  const venus = chartData.planets?.venus;
  const sun = chartData.planets?.sun;
  if (!venus) {
    return {
      score: 0,
      statusDescription: "Venus data missing",
      interpretation: "—",
    };
  }

  const house =
    venus.house ??
    getWholeSignHouse(venus.degree, chartData.houses?.angles?.ascendant ?? 0);
  const GOOD_HOUSES = new Set([1, 4, 7, 10, 11]);
  const WEAK_HOUSES = new Set([6, 8, 12]);
  let houseStatus: string;
  if (GOOD_HOUSES.has(house)) houseStatus = "Good/Opportunity";
  else if (WEAK_HOUSES.has(house))
    houseStatus = house === 12 ? "Weak/Hidden (Secret Love)" : "Weak/Hidden";
  else houseStatus = "Neutral";

  const COMBUSTION_ORB = 8.5;
  const sunVenusDiff = calculateAngleDifference(sun?.degree ?? 0, venus.degree);
  const combust = sunVenusDiff <= COMBUSTION_ORB;
  const combustionStatus = combust
    ? "Combust (연애 기회 차단/흉함)"
    : "Not combust";

  const scoreResult = calculatePlanetScore("venus", chartData);
  const dignityStatus =
    scoreResult.score >= 5
      ? "Stable/Happy (Dignity/Sect favorable)"
      : scoreResult.score <= 0
        ? "Challenging (Dignity/Sect weak)"
        : "Moderate";

  const statusParts = [houseStatus, combustionStatus, dignityStatus];
  const interpretation = `Venus in ${
    venus.sign
  } (${house}th House): ${statusParts.join(". ")}`;

  return {
    score: scoreResult.score,
    statusDescription: statusParts.join("; "),
    interpretation,
  };
}

/** Luminary가 다른 행성에게 적용(Applying) 중인지 판단 (빠른 행성이 정확 각도로 접근) */
function isApplyingAspect(
  lumLongitude: number,
  otherLongitude: number,
  aspectAngle: number,
): boolean {
  const diff = normalizeDegrees(otherLongitude - lumLongitude);
  if (aspectAngle === 0) return diff > 0 && diff < 180;
  return diff > aspectAngle && diff < 360;
}

/** Ptolemaic aspects: Conjunction, Opposition, Trine, Square, Sextile (합/충/형 6°, 삼합/육합 4°) */
const PTOLEMAIC_ASPECTS = [
  { angle: 0, orb: 6 },
  { angle: 60, orb: 4 },
  { angle: 90, orb: 6 },
  { angle: 120, orb: 4 },
  { angle: 180, orb: 6 },
];

export interface SpouseCandidateResult {
  bestSpouseCandidate: string;
  scores: Record<string, number>;
}

/**
 * 배우자 후보 행성 선정: 7th Ruler, 7th House에 위치한 행성, Lot Ruler, Venus, Luminary(M=Moon, F=Sun)를 지표로
 * 다른 행성들이 이들과 맺는 각도에 따라 점수 부여. Luminary가 가장 먼저 만나는(Applying) 행성 +30.
 * 7th House에 위치한 행성들에게 +15점 추가.
 */
export function identifySpouseCandidate(
  chartData: ChartData,
  gender: "M" | "F",
): SpouseCandidateResult {
  const planets = chartData.planets ?? {};
  const asc = chartData.houses?.angles?.ascendant ?? 0;
  const planetKeys = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
  ] as const;

  const seventhCuspLon = normalizeDegrees(asc + 180);
  const seventhSign = getSignFromLongitude(seventhCuspLon).sign;
  const seventhRulerName = getSignRuler(seventhSign);
  const seventhRulerLon =
    planets[PLANET_NAME_TO_KEY[seventhRulerName] as keyof typeof planets]
      ?.degree;

  const lot = calculateLotOfMarriage(chartData, gender);
  const lotRulerName = getSignRuler(lot.sign);
  const lotRulerLon =
    planets[PLANET_NAME_TO_KEY[lotRulerName] as keyof typeof planets]?.degree;

  const venusLon = planets.venus?.degree ?? 0;
  const luminaryKey = gender === "M" ? "moon" : "sun";
  const luminaryLon = planets[luminaryKey]?.degree ?? 0;

  const scores: Record<string, number> = {};
  for (const key of planetKeys) {
    scores[PLANET_NAMES[key]] = 0;
  }

  // 7th House에 위치한 행성들에게 가산점 부여
  for (const key of planetKeys) {
    const planet = planets[key];
    if (!planet) continue;
    const house = planet.house ?? getWholeSignHouse(planet.degree, asc);
    if (house === 7) {
      scores[PLANET_NAMES[key]] += 15; // 7하우스 위치 보너스
    }
  }

  for (const key of planetKeys) {
    const otherLon = planets[key]?.degree;
    if (otherLon == null) continue;
    const name = PLANET_NAMES[key];

    // 7th Ruler와의 각도
    if (seventhRulerLon != null) {
      const asp = getNatalAspect(otherLon, seventhRulerLon);
      if (asp) scores[name] += 10;
    }
    // Venus와의 각도
    const aspVenus = getNatalAspect(otherLon, venusLon);
    if (aspVenus) scores[name] += 10;
    // Lot Ruler와의 각도
    if (lotRulerLon != null) {
      const aspLot = getNatalAspect(otherLon, lotRulerLon);
      if (aspLot) scores[name] += 5;
    }
  }

  // Luminary가 가장 먼저 만나는 행성 (Applying Aspect)
  let bestApplyingOrb = Infinity;
  let luminaryFirstPlanet: string | null = null;
  for (const key of planetKeys) {
    if (key === luminaryKey) continue;
    const otherLon = planets[key]?.degree;
    if (otherLon == null) continue;
    for (const { angle, orb } of PTOLEMAIC_ASPECTS) {
      const diff = calculateAngleDifference(luminaryLon, otherLon);
      const curOrb = Math.abs(diff - angle);
      if (curOrb <= orb && isApplyingAspect(luminaryLon, otherLon, angle)) {
        if (curOrb < bestApplyingOrb) {
          bestApplyingOrb = curOrb;
          luminaryFirstPlanet = PLANET_NAMES[key];
        }
        break;
      }
    }
  }
  if (luminaryFirstPlanet != null) {
    scores[luminaryFirstPlanet] = (scores[luminaryFirstPlanet] ?? 0) + 30;
  }

  let bestPlanet = "Venus";
  let bestScore = -1;
  for (const [planetName, total] of Object.entries(scores)) {
    if (total > bestScore) {
      bestScore = total;
      bestPlanet = planetName;
    }
  }

  return { bestSpouseCandidate: bestPlanet, scores };
}

export interface LoveTimingResult {
  activatedFactors: string[];
}

/**
 * 연애/결혼 시기 트리거: Profection, Firdaria, Direction, Progression 체크
 */
export function analyzeLoveTiming(
  natalChart: ChartData,
  currentAge: number,
  spouseCandidate: string,
  gender: string,
  options?: {
    firdariaResult?: FirdariaResult | null;
    progressionResult?: ProgressionResult | null;
    directionHits?: PrimaryDirectionHit[] | null;
  },
): LoveTimingResult {
  const activatedFactors: string[] = [];
  const birthDate = new Date(natalChart.date);
  const now = new Date();
  const asc = natalChart.houses?.angles?.ascendant ?? 0;
  const natalAscSign = getSignFromLongitude(asc).sign;
  const venusSign = natalChart.planets?.venus?.sign ?? "";
  const lot = calculateLotOfMarriage(natalChart, gender);
  const seventhCuspLon = normalizeDegrees(asc + 180);
  const seventhSign = getSignFromLongitude(seventhCuspLon).sign;

  if (birthDate.getTime() && isNaN(birthDate.getTime())) {
    return { activatedFactors };
  }

  const profection = calculateProfection(birthDate, now, natalAscSign, false);
  if (
    profection.profectionSign === venusSign ||
    profection.profectionSign === lot.sign ||
    profection.profectionSign === seventhSign
  ) {
    activatedFactors.push(
      `Profection: Current year sign (${profection.profectionSign}) activates Venus/Lot/7th — love themes highlighted`,
    );
  }

  const firdaria =
    options?.firdariaResult ??
    calculateFirdaria(
      birthDate,
      {
        lat: natalChart.location?.lat ?? 0,
        lng: natalChart.location?.lng ?? 0,
      },
      now,
    );
  if (firdaria.majorLord === "Venus" || firdaria.subLord === "Venus") {
    activatedFactors.push(
      `Firdaria: Venus period active (Major: ${firdaria.majorLord}, Sub: ${
        firdaria.subLord ?? "—"
      })`,
    );
  }

  const directionHits =
    options?.directionHits ??
    calculatePrimaryDirections(natalChart, currentAge, birthDate);
  const angleSignificators = ["Asc", "MC", "Dsc", "IC"];
  for (const hit of directionHits) {
    const match = hit.name.match(/^(.+?) -> (.+)$/);
    if (!match) continue;
    const [, promName, significator] = match;
    const isAngle = angleSignificators.includes(significator);
    const isVenusOrSpouse =
      promName.includes("Venus") || promName.includes(spouseCandidate);
    if (isAngle && isVenusOrSpouse) {
      activatedFactors.push(
        `Direction: ${hit.name} (${hit.eventDate}, age ${hit.age}) — angle trigger`,
      );
    }
  }

  const progression =
    options?.progressionResult ??
    calculateSecondaryProgression(natalChart, currentAge);
  const venusOrSpouseInNatal = progression.natalAspects.some(
    (s) => s.includes("Venus") || s.includes(spouseCandidate),
  );
  const venusOrSpouseInProg = progression.progressedAspects.some(
    (s) => s.includes("Venus") || s.includes(spouseCandidate),
  );
  if (venusOrSpouseInNatal) {
    activatedFactors.push(
      `Progression: Progressed Moon aspects Natal Venus or ${spouseCandidate} — ${progression.natalAspects
        .filter((a) => a.includes("Venus") || a.includes(spouseCandidate))
        .join("; ")}`,
    );
  }
  if (venusOrSpouseInProg) {
    activatedFactors.push(
      `Progression: Progressed Moon aspects Progressed Venus or ${spouseCandidate} — ${progression.progressedAspects
        .filter((a) => a.includes("Venus") || a.includes(spouseCandidate))
        .join("; ")}`,
    );
  }

  return { activatedFactors };
}

// ========== Solar Return & Profection 계산 함수 ==========

/**
 * Solar Return 날짜/시간 계산
 * 태양이 Natal 태양과 정확히 같은 황경에 위치하는 시점을 찾습니다.
 *
 * @param birthDate - 사용자의 출생 날짜
 * @param targetYear - 계산할 연도 (현재 년도 또는 특정 년도)
 * @param natalSunLongitude - Natal 태양의 황경
 * @returns Solar Return 날짜/시간 (UTC)
 */
export function calculateSolarReturnDateTime(
  birthDate: Date,
  targetYear: number,
  natalSunLongitude: number,
): Date {
  try {
    // 대략적인 생일 날짜 계산 (targetYear의 생일)
    const birthMonth = birthDate.getUTCMonth();
    const birthDay = birthDate.getUTCDate();

    // 검색 시작일: targetYear의 생일 2일 전
    const searchStartDate = new Date(
      Date.UTC(targetYear, birthMonth, birthDay - 2),
    );

    // 검색 종료일: targetYear의 생일 2일 후
    const searchEndDate = new Date(
      Date.UTC(targetYear, birthMonth, birthDay + 2),
    );

    const startTime = MakeTime(searchStartDate);
    const endTime = MakeTime(searchEndDate);

    // astronomy-engine의 SearchSunLongitude를 사용하여 정확한 시점 찾기
    const solarReturnTime = SearchSunLongitude(natalSunLongitude, startTime, 5);

    if (!solarReturnTime) {
      throw new Error("Solar Return time not found in the search window");
    }

    // AstroTime을 순수 UTC Date로 변환
    // astronomy-engine의 AstroTime.date는 JavaScript Date 객체이지만,
    // 생성 시 로컬 타임존이 적용될 수 있으므로 명시적으로 UTC로 파싱
    const astroDate = solarReturnTime.date;

    // Date 객체를 UTC 기준으로 재구성
    // getUTC* 메서드를 사용하여 UTC 값을 가져온 후 Date.UTC로 순수 UTC Date 생성
    const solarReturnDate = new Date(
      Date.UTC(
        astroDate.getUTCFullYear(),
        astroDate.getUTCMonth(),
        astroDate.getUTCDate(),
        astroDate.getUTCHours(),
        astroDate.getUTCMinutes(),
        astroDate.getUTCSeconds(),
        astroDate.getUTCMilliseconds(),
      ),
    );

    return solarReturnDate;
  } catch (error: any) {
    console.error("❌ Solar Return 계산 실패:", error);
    throw new Error(`Solar Return calculation failed: ${error.message}`);
  }
}

/**
 * 현재 적용 중인 Solar Return 연도 결정
 * 현재 날짜가 올해 생일 이전이면 작년 Solar Return, 이후면 올해 Solar Return
 *
 * @param birthDate - 사용자의 출생 날짜
 * @param now - 현재 날짜
 * @returns Solar Return 연도
 */
export function getActiveSolarReturnYear(birthDate: Date, now: Date): number {
  const currentYear = now.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();

  // 올해의 생일
  const birthdayThisYear = new Date(
    Date.UTC(currentYear, birthMonth, birthDay),
  );

  // 현재가 올해 생일 이전이면 작년의 Solar Return 사용
  if (now < birthdayThisYear) {
    return currentYear - 1;
  }

  // 생일 이후면 올해의 Solar Return 사용
  return currentYear;
}

/** 연도별 Profection 타임라인 항목 */
export interface ProfectionTimelineItem {
  age: number;
  year: number;
  sign: string;
  lord: string;
}

/**
 * Annual Profections 10년 타임라인: 향후 duration년 동안 매년의 Lord of the Year와 Profection Sign.
 */
export function calculateProfectionTimeline(
  chartData: ChartData,
  startAge: number,
  duration: number = 10,
): ProfectionTimelineItem[] {
  const birthDate = new Date(chartData.date);
  if (isNaN(birthDate.getTime())) return [];
  const birthYear = birthDate.getUTCFullYear();
  const ascLon = chartData.houses?.angles?.ascendant ?? 0;
  const natalAscSign = getSignFromLongitude(ascLon).sign;
  const natalAscIndex = SIGNS.indexOf(natalAscSign);
  if (natalAscIndex === -1) return [];

  const timeline: ProfectionTimelineItem[] = [];
  for (let i = 0; i < duration; i++) {
    const age = startAge + i;
    const year = birthYear + age;
    const profectionHouse = (age % 12) + 1;
    const profectionSignIndex = (natalAscIndex + (profectionHouse - 1)) % 12;
    const sign = SIGNS[profectionSignIndex];
    const lord = getSignRuler(sign);
    timeline.push({ age, year, sign, lord });
  }
  return timeline;
}

/**
 * Annual Profection 계산
 *
 * @param birthDate - 사용자의 출생 날짜
 * @param targetDate - 계산 기준 날짜 (보통 Solar Return 날짜)
 * @param natalAscSign - Natal 차트의 상승궁 별자리
 * @param isSolarReturn - Solar Return 차트 계산 여부 (true면 단순 연도 차이 사용)
 * @returns Profection 데이터
 */
export function calculateProfection(
  birthDate: Date,
  targetDate: Date,
  natalAscSign: string,
  isSolarReturn: boolean = true,
): ProfectionData {
  try {
    let age: number;

    if (isSolarReturn) {
      // Solar Return의 경우: 단순 연도 차이 (생일 도달 여부와 무관)
      // targetDate가 Solar Return 시점이므로, 그 해에 도달하는 나이를 사용
      age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear();
    } else {
      // 일반 만 나이 계산 (생일이 지났는지 체크)
      age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear();

      const birthdayThisYear = new Date(
        Date.UTC(
          targetDate.getUTCFullYear(),
          birthDate.getUTCMonth(),
          birthDate.getUTCDate(),
        ),
      );

      if (targetDate < birthdayThisYear) {
        age -= 1;
      }
    }

    // Profection House 계산 (Age를 12로 나눈 나머지 + 1)
    const profectionHouse = (age % 12) + 1;

    // Profection Sign 계산 (Natal Asc Sign에서 profectionHouse - 1만큼 이동)
    const natalAscIndex = SIGNS.indexOf(natalAscSign);
    if (natalAscIndex === -1) {
      throw new Error(`Invalid natal ascendant sign: ${natalAscSign}`);
    }

    const profectionSignIndex = (natalAscIndex + (profectionHouse - 1)) % 12;
    const profectionSign = SIGNS[profectionSignIndex];

    // Lord of the Year (Profection Sign의 지배 행성)
    const lordOfTheYear = getSignRuler(profectionSign);

    return {
      age,
      profectionHouse,
      profectionSign,
      lordOfTheYear,
    };
  } catch (error: any) {
    console.error("❌ Profection 계산 실패:", error);
    throw new Error(`Profection calculation failed: ${error.message}`);
  }
}

/**
 * Solar Return 차트의 행성들이 Natal 차트의 어느 하우스에 위치하는지 계산 (Overlay)
 *
 * @param natalChart - Natal 차트
 * @param solarReturnChart - Solar Return 차트
 * @returns Solar Return Overlay 정보
 */
export function getSolarReturnOverlays(
  natalChart: ChartData,
  solarReturnChart: ChartData,
): SolarReturnOverlay {
  try {
    const natalAscendant = natalChart.houses.angles.ascendant;

    // SR Ascendant가 Natal 차트의 몇 번째 하우스에 있는지
    const solarReturnAscendant = solarReturnChart.houses.angles.ascendant;
    const solarReturnAscendantInNatalHouse = getWholeSignHouse(
      solarReturnAscendant,
      natalAscendant,
    );

    // SR 행성들이 Natal 차트의 몇 번째 하우스에 있는지
    const planetsInNatalHouses: any = {};

    for (const [planetKey, planetData] of Object.entries(
      solarReturnChart.planets,
    )) {
      const planetLongitude = planetData.degree;
      const natalHouse = getWholeSignHouse(planetLongitude, natalAscendant);
      planetsInNatalHouses[planetKey] = natalHouse;
    }

    return {
      solarReturnAscendantInNatalHouse,
      planetsInNatalHouses,
    };
  } catch (error: any) {
    console.error("❌ Solar Return Overlay 계산 실패:", error);
    throw new Error(
      `Solar Return Overlay calculation failed: ${error.message}`,
    );
  }
}

// ========== Firdaria (피르다리) 계산 ==========

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** 낮 차트 피르다리 순서: [행성명, 연수] */
const DAY_FIRDARIA: Array<{ lord: string; years: number }> = [
  { lord: "Sun", years: 10 },
  { lord: "Venus", years: 8 },
  { lord: "Mercury", years: 13 },
  { lord: "Moon", years: 9 },
  { lord: "Saturn", years: 11 },
  { lord: "Jupiter", years: 12 },
  { lord: "Mars", years: 7 },
  { lord: "NorthNode", years: 3 },
  { lord: "SouthNode", years: 2 },
];

/** 밤 차트 피르다리 순서 */
const NIGHT_FIRDARIA: Array<{ lord: string; years: number }> = [
  { lord: "Moon", years: 9 },
  { lord: "Saturn", years: 11 },
  { lord: "Jupiter", years: 12 },
  { lord: "Mars", years: 7 },
  { lord: "Sun", years: 10 },
  { lord: "Venus", years: 8 },
  { lord: "Mercury", years: 13 },
  { lord: "NorthNode", years: 3 },
  { lord: "SouthNode", years: 2 },
];

/** 서브 로드 순서 (노드 제외, 7행성) */
const SUB_LORD_ORDER = [
  "Sun",
  "Venus",
  "Mercury",
  "Moon",
  "Saturn",
  "Jupiter",
  "Mars",
];

function nextInSubOrder(lord: string): string {
  const i = SUB_LORD_ORDER.indexOf(lord);
  if (i === -1) return SUB_LORD_ORDER[0];
  return SUB_LORD_ORDER[(i + 1) % 7];
}

/**
 * 출생 시각·위치에서 태양의 고도(Altitude)를 계산 (astronomy-engine 사용)
 * 고도 >= 0 이면 낮 차트(Diurnal), < 0 이면 밤 차트(Nocturnal)
 */
function getSunAltitudeAtBirth(
  birthDate: Date,
  lat: number,
  lng: number,
): number {
  const time = MakeTime(birthDate);
  const observer = new Observer(lat, lng, 0);
  const eq = Equator(Body.Sun, birthDate, observer, true, true);
  const hor = Horizon(birthDate, observer, eq.ra, eq.dec);
  return hor.altitude;
}

/**
 * 생일 기준 만 나이 계산 (UTC)
 */
function getAgeInFullYears(birthDate: Date, targetDate: Date): number {
  let age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();
  const targetMonth = targetDate.getUTCMonth();
  const targetDay = targetDate.getUTCDate();
  if (
    targetMonth < birthMonth ||
    (targetMonth === birthMonth && targetDay < birthDay)
  ) {
    age -= 1;
  }
  return Math.max(0, age);
}

/**
 * Date에 연수(소수 가능)를 더한 새 Date 반환 (UTC, 연평균 365.25일)
 */
function addYearsUTC(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR);
}

/**
 * 피르다리(Firdaria) 계산
 * Sect(낮/밤) → 메이저 로드 → 서브 로드 및 기간을 계산합니다.
 *
 * @param birthDate - 출생일시 (UTC)
 * @param location - 출생 위치 (위도, 경도)
 * @param targetDate - 계산 기준일 (기본값: 현재 시각)
 * @returns FirdariaResult
 */
export function calculateFirdaria(
  birthDate: Date,
  location: Location,
  targetDate: Date = new Date(),
): FirdariaResult {
  const { lat, lng } = location;

  if (!(birthDate instanceof Date) || isNaN(birthDate.getTime())) {
    throw new Error("Invalid birthDate provided.");
  }
  if (typeof lat !== "number" || isNaN(lat) || lat < -90 || lat > 90) {
    throw new Error("Invalid latitude.");
  }
  if (typeof lng !== "number" || isNaN(lng) || lng < -180 || lng > 180) {
    throw new Error("Invalid longitude.");
  }

  // 1. Sect: 태양 고도로 낮/밤 차트 판별
  const sunAltitude = getSunAltitudeAtBirth(birthDate, lat, lng);
  const isDayChart = sunAltitude >= 0;
  const sequence = isDayChart ? DAY_FIRDARIA : NIGHT_FIRDARIA;

  // 2. 만 나이 및 75년 주기 내 위치
  const age = getAgeInFullYears(birthDate, targetDate);
  const ageInCycle = age % 75;

  // 3. 메이저 로드 및 해당 기간 시작/종료
  let accumulatedYears = 0;
  let majorLord = "";
  let majorPeriodStart = new Date(birthDate.getTime());
  let majorPeriodEnd = new Date(birthDate.getTime());

  for (const { lord, years } of sequence) {
    if (accumulatedYears + years > ageInCycle) {
      majorLord = lord;
      majorPeriodStart = addYearsUTC(birthDate, accumulatedYears);
      majorPeriodEnd = addYearsUTC(birthDate, accumulatedYears + years);
      break;
    }
    accumulatedYears += years;
  }

  // 주기 끝까지 갔을 때 (ageInCycle === 0, 예: 75세·150세) → 새 주기 첫 기간
  if (!majorLord) {
    const cycles = Math.floor(age / 75);
    const first = sequence[0];
    majorLord = first.lord;
    majorPeriodStart = addYearsUTC(birthDate, 75 * cycles);
    majorPeriodEnd = addYearsUTC(birthDate, 75 * cycles + first.years);
  }

  const result: FirdariaResult = {
    isDayChart,
    age,
    majorLord,
    subLord: null,
    majorPeriodStart,
    majorPeriodEnd,
  };

  // 4. 서브 로드: 노드 기간이면 null, 아니면 7등분 후 순서대로
  const isNode = majorLord === "NorthNode" || majorLord === "SouthNode";
  if (!isNode) {
    const majorDurationMs =
      majorPeriodEnd.getTime() - majorPeriodStart.getTime();
    const subDurationMs = majorDurationMs / 7;
    const elapsedMs = targetDate.getTime() - majorPeriodStart.getTime();
    let subIndex = Math.floor(elapsedMs / subDurationMs);
    if (subIndex < 0) subIndex = 0;
    if (subIndex > 6) subIndex = 6;

    const subLords: string[] = [];
    let cur = majorLord;
    for (let i = 0; i < 7; i++) {
      subLords.push(cur);
      cur = nextInSubOrder(cur);
    }
    result.subLord = subLords[subIndex];
    result.subPeriodStart = new Date(
      majorPeriodStart.getTime() + subIndex * subDurationMs,
    );
    result.subPeriodEnd = new Date(
      majorPeriodStart.getTime() + (subIndex + 1) * subDurationMs,
    );
  }

  return result;
}

// ========== 메이저/서브 로드 상호작용 분석 ==========

/** 행성 표기명 → 차트 키 (natalChart.planets 키) */
const PLANET_NAME_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
};

const ASPECT_ORB_LORD = 5;

/**
 * 메이저 로드와 서브 로드 간의 관계 분석 (Reception, Aspect, House)
 * Gemini 프롬프트에 넣을 수 있는 요약 객체를 반환합니다.
 *
 * @param natalChart - 출생 차트
 * @param majorLordName - 메이저 로드 행성명 (예: "Sun", "Venus")
 * @param subLordName - 서브 로드 행성명 (예: "Mercury")
 * @returns InteractionResult
 */
export function analyzeLordInteraction(
  natalChart: ChartData,
  majorLordName: string,
  subLordName: string,
): InteractionResult {
  const majorKey = PLANET_NAME_TO_KEY[majorLordName];
  const subKey = PLANET_NAME_TO_KEY[subLordName];
  const majorData = majorKey
    ? natalChart.planets[majorKey as keyof typeof natalChart.planets]
    : undefined;
  const subData = subKey
    ? natalChart.planets[subKey as keyof typeof natalChart.planets]
    : undefined;

  let reception: string | null = null;
  let aspect: string | null = null;
  let houseContext: string;
  let summaryScore = 0;

  // 1. Reception (접대/도움): 별자리 주인(Rulership) 기준
  if (majorData && subData) {
    const rulerOfSubSign = getSignRuler(subData.sign);
    const rulerOfMajorSign = getSignRuler(majorData.sign);
    const majorHostsSub = rulerOfSubSign === majorLordName;
    const subHostsMajor = rulerOfMajorSign === subLordName;
    if (majorHostsSub && subHostsMajor) {
      reception = `Mutual reception (Both helpful)`;
      summaryScore += 1;
    } else if (majorHostsSub) {
      reception = `${majorLordName} hosts ${subLordName} (Helpful)`;
      summaryScore += 1;
    } else if (subHostsMajor) {
      reception = `${subLordName} hosts ${majorLordName} (Helpful)`;
      summaryScore += 1;
    }
  }

  // 2. Aspect (협력/갈등): 황경 차이, Orb ±5도
  if (majorData && subData) {
    const angleDiff = calculateAngleDifference(
      majorData.degree,
      subData.degree,
    );
    const aspects: Array<{ angle: number; label: string; tone: string }> = [
      { angle: 0, label: "Conjunction", tone: "United" },
      { angle: 60, label: "Sextile", tone: "Harmonious" },
      { angle: 90, label: "Square", tone: "Tension" },
      { angle: 120, label: "Trine", tone: "Harmonious" },
      { angle: 180, label: "Opposition", tone: "Tension" },
    ];
    let found = false;
    for (const { angle, label, tone } of aspects) {
      if (Math.abs(angleDiff - angle) <= ASPECT_ORB_LORD) {
        const tag =
          angle === 0
            ? "United (Intense)"
            : tone === "Harmonious"
              ? "Cooperative"
              : "Tension";
        aspect = `${label} (${tag})`;
        summaryScore += tone === "United" || tone === "Harmonious" ? 1 : -1;
        found = true;
        break;
      }
    }
    if (!found) aspect = "No Aspect";
  } else {
    aspect = null;
  }

  // 3. House Context (활동 무대)
  const majorH = majorData?.house != null ? `${majorData.house}H` : "?";
  const subH = subData?.house != null ? `${subData.house}H` : "?";
  houseContext = `Major(${majorH}) - Sub(${subH})`;

  // summaryScore: 긍정이면 +1, 부정이면 -1, 그 외 0으로 단순화
  const score = summaryScore > 0 ? 1 : summaryScore < 0 ? -1 : 0;

  return {
    majorPlanet: majorLordName,
    subPlanet: subLordName,
    reception,
    aspect,
    houseContext,
    summaryScore: score,
  };
}
