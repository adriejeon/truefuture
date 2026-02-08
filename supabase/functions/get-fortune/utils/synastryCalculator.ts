/**
 * 🌟 궁합(Synastry) 분석 계산 모듈 (고전 점성학 심화 버전)
 * 두 사람의 차트를 비교하여 핵심 인연 구조를 코드로 직접 계산합니다.
 * - 2단계 검증: 앵글 진입(예선) + 주요 감응점 애스펙트(본선)
 * - Detriment/Fall 추적을 통한 갈등 요소 계산
 */

import type { ChartData } from "../types.ts";
import {
  SIGNS,
  PLANET_NAMES,
  getSignRuler,
  getSignFromLongitude,
  calculateLotOfMarriage,
  calculateAngleDifference,
  normalizeDegrees,
  calculateFortuna,
} from "./astrologyCalculator.ts";

/** 행성 표기명 → 차트 키 (chart.planets 키) */
const PLANET_NAME_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
};

// ========== Lookup Tables ==========

/**
 * 12별자리별 Detriment(손상) 행성
 * Detriment = 해당 별자리의 반대 별자리의 Ruler
 */
const DETRIMENT_TABLE: Record<string, string[]> = {
  Aries: ["Venus"], // Libra의 Ruler
  Taurus: ["Mars"], // Scorpio의 Ruler
  Gemini: ["Jupiter"], // Sagittarius의 Ruler
  Cancer: ["Saturn"], // Capricorn의 Ruler
  Leo: ["Saturn"], // Aquarius의 Ruler (고전)
  Virgo: ["Jupiter"], // Pisces의 Ruler
  Libra: ["Mars"], // Aries의 Ruler
  Scorpio: ["Venus"], // Taurus의 Ruler
  Sagittarius: ["Mercury"], // Virgo의 Ruler
  Capricorn: ["Moon"], // Cancer의 Ruler
  Aquarius: ["Sun"], // Leo의 Ruler
  Pisces: ["Mercury"], // Gemini의 Ruler
};

/**
 * 12별자리별 Fall(추락) 행성
 * Fall = 해당 별자리의 반대 별자리의 Exaltation
 */
const FALL_TABLE: Record<string, string[]> = {
  Aries: ["Saturn"], // Libra의 Exaltation
  Taurus: ["Moon"], // Scorpio의 Exaltation
  Gemini: [], // 없음
  Cancer: ["Mars"], // Capricorn의 Exaltation
  Leo: [], // 없음
  Virgo: ["Venus"], // Pisces의 Exaltation
  Libra: ["Sun"], // Aries의 Exaltation
  Scorpio: ["Moon"], // Taurus의 Exaltation
  Sagittarius: [], // 없음
  Capricorn: ["Jupiter"], // Cancer의 Exaltation
  Aquarius: [], // 없음
  Pisces: ["Venus"], // Virgo의 Exaltation
};

// ========== 타입 정의 ==========

/**
 * 연결 타입
 */
export type ConnectionType = "None" | "Potential" | "Destiny";

/**
 * 연결 상세 정보
 */
export interface ConnectionDetail {
  /** 연결 타입 */
  type: ConnectionType;
  /** 설명 */
  description: string;
  /** 앵글 하우스에 있는지 */
  inAngle: boolean;
  /** 주요 감응점과의 애스펙트 (5도 이내) */
  keyPointAspects: SynastryAspect[];
  /** 점수 */
  score: number;
  /** 기준 (Asc 또는 POF) */
  reference: "Asc" | "POF";
  /** 하우스 번호 */
  house: number;
  /** Base Score (하우스 점수) */
  baseScore: number;
}

/**
 * 달의 룰러 연결 정보 (업그레이드)
 */
export interface MoonRulerConnection {
  /** A의 달의 룰러 연결 상세 */
  aToB: ConnectionDetail;
  /** B의 달의 룰러 연결 상세 */
  bToA: ConnectionDetail;
  /** A의 달의 룰러 행성명 */
  aMoonRuler: string;
  /** B의 달의 룰러 행성명 */
  bMoonRuler: string;
  /** 상호 연결 여부 (양방향 Destiny) */
  isMutual: boolean;
  /** 연결 강도 (0-2) */
  strength: number;
}

/**
 * 결혼의 랏 룰러 연결 정보 (업그레이드)
 */
export interface MarriageLotConnection {
  /** A의 결혼의 랏 룰러 연결 상세 */
  aToB: ConnectionDetail;
  /** B의 결혼의 랏 룰러 연결 상세 */
  bToA: ConnectionDetail;
  /** A의 결혼의 랏 룰러 행성명 */
  aLotRuler: string;
  /** B의 결혼의 랏 룰러 행성명 */
  bLotRuler: string;
  /** 상호 연결 여부 */
  isMutual: boolean;
  /** 연결 강도 (0-2) */
  strength: number;
}

/**
 * 애스펙트 정보
 */
export interface SynastryAspect {
  planetA: string;
  planetB: string;
  type: string; // "Conjunction" | "Trine" | "Square" | "Opposition" | "Sextile"
  orb: number;
}

/**
 * 갈등 요소 정보
 */
export interface ConflictFactor {
  /** 갈등을 일으키는 행성 */
  planet: string;
  /** 갈등 타입 (Detriment 또는 Fall) */
  type: "Detriment" | "Fall";
  /** A의 달이 위치한 별자리 */
  aMoonSign: string;
  /** 갈등 발생 위치/이유 */
  reason: string;
  /** 점수 (음수) */
  score: number;
}

/**
 * 길흉 보정 정보 (업그레이드)
 */
export interface BeneficMaleficAdjustment {
  /** 금성-화성 조화 (매력도) */
  venusMarsHarmony: {
    /** A의 금성과 B의 화성 각도 */
    aVenusBMars: SynastryAspect | null;
    /** B의 금성과 A의 화성 각도 */
    bVenusAMars: SynastryAspect | null;
    /** 조화 점수 (0-2) */
    score: number;
  };
  /** 토성 흉각 (장애물) */
  saturnHardAspects: {
    /** A의 토성이 B의 주요 감응점과 맺는 흉각 */
    aSaturnToBSensitive: SynastryAspect[];
    /** B의 토성이 A의 주요 감응점과 맺는 흉각 */
    bSaturnToASensitive: SynastryAspect[];
    /** 흉각 점수 (0-4, 높을수록 장애물 많음) */
    score: number;
  };
  /** Detriment/Fall 갈등 요소 */
  conflicts: ConflictFactor[];
  /** 총 갈등 점수 (음수) */
  conflictScore: number;
}

/**
 * 궁합 분석 결과 (업그레이드)
 */
export interface SynastryResult {
  /** 달의 룰러 연결 */
  moonRulerConnection: MoonRulerConnection;
  /** 결혼의 랏 룰러 연결 */
  marriageLotConnection: MarriageLotConnection;
  /** 길흉 보정 */
  beneficMaleficAdjustment: BeneficMaleficAdjustment;
  /** 종합 점수 (0-100) */
  overallScore: number;
}

// ========== 헬퍼 함수 ==========

/**
 * 특정 행성의 별자리(Sign)와 상대방의 상승점(Ascendant Sign)을 입력받아,
 * 그 행성이 상대방 차트에서 Whole Sign 기준 몇 번째 하우스에 위치하는지 계산
 */
export function getHouseInPartnerChart(
  planetSign: string,
  partnerAscSign: string
): number {
  const planetSignIndex = SIGNS.indexOf(planetSign);
  const partnerAscSignIndex = SIGNS.indexOf(partnerAscSign);

  if (planetSignIndex === -1 || partnerAscSignIndex === -1) {
    throw new Error(
      `Invalid sign: planetSign=${planetSign}, partnerAscSign=${partnerAscSign}`
    );
  }

  const house = ((planetSignIndex - partnerAscSignIndex + 12) % 12) + 1;
  return house;
}

/**
 * 하우스 번호에 따른 Base Score 계산
 * - Angle (1, 4, 7, 10): 10점
 * - Succedent (2, 5, 8, 11): 5점
 * - Cadent (3, 6, 9, 12): 0점
 */
function getHouseBaseScore(house: number): number {
  if (house === 1 || house === 4 || house === 7 || house === 10) {
    return 10; // Angle
  } else if (house === 2 || house === 5 || house === 8 || house === 11) {
    return 5; // Succedent
  } else {
    return 0; // Cadent
  }
}

/**
 * 앵글 하우스인지 확인 (1, 4, 7, 10하우스)
 */
function isAngleHouse(house: number): boolean {
  return house === 1 || house === 4 || house === 7 || house === 10;
}

/**
 * POF 기준으로 행성이 상대방 차트에서 몇 번째 하우스에 위치하는지 계산
 * 
 * @param planetSign - 행성이 위치한 별자리
 * @param partnerPofSign - 상대방의 POF 별자리
 * @returns 하우스 번호 (1-12)
 */
function getHouseInPartnerChartByPOF(
  planetSign: string,
  partnerPofSign: string
): number {
  const planetSignIndex = SIGNS.indexOf(planetSign);
  const partnerPofSignIndex = SIGNS.indexOf(partnerPofSign);

  if (planetSignIndex === -1 || partnerPofSignIndex === -1) {
    throw new Error(
      `Invalid sign: planetSign=${planetSign}, partnerPofSign=${partnerPofSign}`
    );
  }

  // POF 기준 하우스 계산: ((PlanetSignIndex - PofSignIndex + 12) % 12) + 1
  const house = ((planetSignIndex - partnerPofSignIndex + 12) % 12) + 1;
  return house;
}

/**
 * 두 행성 간의 메이저 애스펙트 계산 (5도 이내만, Orb 엄격)
 * 
 * @param lon1 - 첫 번째 행성의 황경
 * @param lon2 - 두 번째 행성의 황경
 * @param maxOrb - 최대 허용 Orb (기본 5도)
 * @returns 애스펙트 정보 또는 null
 */
function calculateMajorAspect(
  lon1: number,
  lon2: number,
  maxOrb: number = 5
): SynastryAspect | null {
  const angleDiff = calculateAngleDifference(lon1, lon2);

  // Conjunction (0도)
  if (angleDiff <= maxOrb) {
    return {
      planetA: "",
      planetB: "",
      type: "Conjunction",
      orb: angleDiff,
    };
  }

  // Square (90도)
  if (Math.abs(angleDiff - 90) <= maxOrb) {
    return {
      planetA: "",
      planetB: "",
      type: "Square",
      orb: Math.abs(angleDiff - 90),
    };
  }

  // Trine (120도)
  if (Math.abs(angleDiff - 120) <= maxOrb) {
    return {
      planetA: "",
      planetB: "",
      type: "Trine",
      orb: Math.abs(angleDiff - 120),
    };
  }

  // Opposition (180도)
  if (Math.abs(angleDiff - 180) <= maxOrb) {
    return {
      planetA: "",
      planetB: "",
      type: "Opposition",
      orb: Math.abs(angleDiff - 180),
    };
  }

  return null;
}

/**
 * 차트에서 행성의 황경을 가져옴
 */
function getPlanetLongitude(
  chart: ChartData,
  planetName: string
): number | null {
  const planetKey = PLANET_NAME_TO_KEY[planetName];
  if (!planetKey) return null;

  const planetData =
    chart.planets[planetKey as keyof typeof chart.planets];
  return planetData?.degree ?? null;
}

/**
 * 차트에서 행성의 별자리를 가져옴
 */
function getPlanetSign(chart: ChartData, planetName: string): string | null {
  const planetKey = PLANET_NAME_TO_KEY[planetName];
  if (!planetKey) return null;

  const planetData =
    chart.planets[planetKey as keyof typeof chart.planets];
  return planetData?.sign ?? null;
}

/**
 * 주요 감응점(Key Points): Asc, Dsc, Sun, Moon, IC, MC의 황경 배열 반환
 */
function getKeyPoints(chart: ChartData): Array<{
  name: string;
  longitude: number;
}> {
  const points: Array<{ name: string; longitude: number }> = [];

  // Ascendant
  const ascLon = chart.houses?.angles?.ascendant;
  if (ascLon != null) {
    points.push({ name: "Ascendant", longitude: ascLon });
  }

  // Descendant (Asc + 180)
  if (ascLon != null) {
    points.push({ name: "Descendant", longitude: normalizeDegrees(ascLon + 180) });
  }

  // MC (Midheaven)
  const mcLon = chart.houses?.angles?.midheaven;
  if (mcLon != null) {
    points.push({ name: "MC", longitude: mcLon });
  }

  // IC (Imum Coeli) = MC + 180
  if (mcLon != null) {
    points.push({ name: "IC", longitude: normalizeDegrees(mcLon + 180) });
  }

  // Sun
  const sunLon = chart.planets.sun?.degree;
  if (sunLon != null) {
    points.push({ name: "Sun", longitude: sunLon });
  }

  // Moon
  const moonLon = chart.planets.moon?.degree;
  if (moonLon != null) {
    points.push({ name: "Moon", longitude: moonLon });
  }

  return points;
}

/**
 * 2단계 검증을 통한 연결 상세 정보 계산 (Dual Reference System: Asc & POF)
 * 
 * @param rulerPlanet - 룰러 행성명
 * @param rulerChart - 룰러가 위치한 차트
 * @param targetChart - 대상 차트 (상대방)
 * @param targetKeyPoints - 대상 차트의 주요 감응점
 * @returns ConnectionDetail
 */
function calculateConnectionDetail(
  rulerPlanet: string,
  rulerChart: ChartData,
  targetChart: ChartData,
  targetKeyPoints: Array<{ name: string; longitude: number }>
): ConnectionDetail {
  const rulerSign = getPlanetSign(rulerChart, rulerPlanet);
  if (!rulerSign) {
    return {
      type: "None",
      description: `${rulerPlanet} 위치 정보 없음`,
      inAngle: false,
      keyPointAspects: [],
      score: 0,
      reference: "Asc",
      house: 0,
      baseScore: 0,
    };
  }

  const targetAscSign = getSignFromLongitude(
    targetChart.houses?.angles?.ascendant ?? 0
  ).sign;
  
  // POF 계산
  const targetAsc = targetChart.houses?.angles?.ascendant ?? 0;
  const targetSunLon = targetChart.planets.sun?.degree ?? 0;
  const targetMoonLon = targetChart.planets.moon?.degree ?? 0;
  const isDayChart = targetChart.planets.sun?.house
    ? targetChart.planets.sun.house >= 7 && targetChart.planets.sun.house <= 12
    : true;
  
  const targetPofLon = calculateFortuna(targetAsc, targetMoonLon, targetSunLon, isDayChart);
  const targetPofSign = getSignFromLongitude(targetPofLon).sign;

  // Reference A: Ascendant 기준
  const ascHouse = getHouseInPartnerChart(rulerSign, targetAscSign);
  const ascBaseScore = getHouseBaseScore(ascHouse);

  // Reference B: POF 기준
  const pofHouse = getHouseInPartnerChartByPOF(rulerSign, targetPofSign);
  const pofBaseScore = getHouseBaseScore(pofHouse);

  // 두 기준 중 더 높은 점수를 채택
  let finalHouse: number;
  let finalBaseScore: number;
  let reference: "Asc" | "POF";
  let referenceSign: string;

  if (pofBaseScore > ascBaseScore) {
    finalHouse = pofHouse;
    finalBaseScore = pofBaseScore;
    reference = "POF";
    referenceSign = targetPofSign;
  } else {
    finalHouse = ascHouse;
    finalBaseScore = ascBaseScore;
    reference = "Asc";
    referenceSign = targetAscSign;
  }

  // Base Score가 0점이면 None
  if (finalBaseScore === 0) {
    return {
      type: "None",
      description: `${rulerPlanet}가 상대방 ${reference} 기준 ${finalHouse}하우스(${finalBaseScore}점)에 위치`,
      inAngle: false,
      keyPointAspects: [],
      score: 0,
      reference,
      house: finalHouse,
      baseScore: finalBaseScore,
    };
  }

  // 주요 감응점과의 애스펙트 체크
  const rulerLon = getPlanetLongitude(rulerChart, rulerPlanet);
  const keyPointAspects: SynastryAspect[] = [];
  
  if (rulerLon != null) {
    for (const point of targetKeyPoints) {
      const aspect = calculateMajorAspect(rulerLon, point.longitude, 5);
      if (aspect) {
        keyPointAspects.push({
          ...aspect,
          planetA: rulerPlanet,
          planetB: point.name,
        });
      }
    }
  }

  // Type 결정 및 점수 계산
  let type: ConnectionType;
  let description: string;
  let score: number;

  if (keyPointAspects.length > 0) {
    // Destiny: Base Score 5점 이상 + 주요 감응점 애스펙트
    type = "Destiny";
    const aspectDesc = keyPointAspects
      .map((a) => `${a.planetB}와 ${a.type} (orb ${a.orb.toFixed(1)}°)`)
      .join(", ");
    
    const angleText = finalBaseScore === 10 ? "앵글" : "수세덴트";
    description = `${rulerPlanet}가 상대방 ${reference} 기준 ${finalHouse}하우스(${finalBaseScore}점, ${angleText})에 위치하며, ${aspectDesc}`;
    
    // Base Score + Aspect Bonus (+20)
    score = finalBaseScore + 20;
  } else if (finalBaseScore >= 5) {
    // Potential: Base Score 5점 이상, 애스펙트 없음
    type = "Potential";
    const angleText = finalBaseScore === 10 ? "앵글" : "수세덴트";
    description = `${rulerPlanet}가 상대방 ${reference} 기준 ${finalHouse}하우스(${finalBaseScore}점, ${angleText})에 위치`;
    
    score = finalBaseScore;
  } else {
    // None: Base Score 0점
    type = "None";
    description = `${rulerPlanet}가 상대방 ${reference} 기준 ${finalHouse}하우스(${finalBaseScore}점)에 위치`;
    score = 0;
  }

  return {
    type,
    description,
    inAngle: finalBaseScore === 10,
    keyPointAspects,
    score,
    reference,
    house: finalHouse,
    baseScore: finalBaseScore,
  };
}

/**
 * 달의 룰러 연결 분석 (업그레이드)
 */
function analyzeMoonRulerConnection(
  chartA: ChartData,
  chartB: ChartData
): MoonRulerConnection {
  const aMoonSign = chartA.planets.moon?.sign;
  const aMoonRuler = aMoonSign ? getSignRuler(aMoonSign) : "Unknown";

  const bMoonSign = chartB.planets.moon?.sign;
  const bMoonRuler = bMoonSign ? getSignRuler(bMoonSign) : "Unknown";

  const aKeyPoints = getKeyPoints(chartA);
  const bKeyPoints = getKeyPoints(chartB);

  // A -> B 연결
  const aToB = aMoonRuler !== "Unknown"
    ? calculateConnectionDetail(aMoonRuler, chartA, chartB, bKeyPoints)
    : {
        type: "None" as ConnectionType,
        description: "A의 달 룰러 정보 없음",
        inAngle: false,
        keyPointAspects: [],
        score: 0,
        reference: "Asc" as const,
        house: 0,
        baseScore: 0,
      };

  // B -> A 연결
  const bToA = bMoonRuler !== "Unknown"
    ? calculateConnectionDetail(bMoonRuler, chartB, chartA, aKeyPoints)
    : {
        type: "None" as ConnectionType,
        description: "B의 달 룰러 정보 없음",
        inAngle: false,
        keyPointAspects: [],
        score: 0,
        reference: "Asc" as const,
        house: 0,
        baseScore: 0,
      };

  // 상호 연결 여부 (양방향 Destiny)
  const isMutual = aToB.type === "Destiny" && bToA.type === "Destiny";

  // 연결 강도 계산
  let strength = 0;
  if (aToB.type !== "None") strength += 1;
  if (bToA.type !== "None") strength += 1;

  return {
    aToB,
    bToA,
    aMoonRuler,
    bMoonRuler,
    isMutual,
    strength,
  };
}

/**
 * 결혼의 랏 룰러 연결 분석 (업그레이드)
 */
function analyzeMarriageLotConnection(
  chartA: ChartData,
  chartB: ChartData,
  genderA: string,
  genderB: string
): MarriageLotConnection {
  const aLot = calculateLotOfMarriage(chartA, genderA);
  const aLotRuler = getSignRuler(aLot.sign);

  const bLot = calculateLotOfMarriage(chartB, genderB);
  const bLotRuler = getSignRuler(bLot.sign);

  const aKeyPoints = getKeyPoints(chartA);
  const bKeyPoints = getKeyPoints(chartB);

  // A -> B 연결
  const aToB = calculateConnectionDetail(aLotRuler, chartA, chartB, bKeyPoints);

  // B -> A 연결
  const bToA = calculateConnectionDetail(bLotRuler, chartB, chartA, aKeyPoints);

  // 상호 연결 여부
  const isMutual = aToB.type === "Destiny" && bToA.type === "Destiny";

  // 연결 강도 계산
  let strength = 0;
  if (aToB.type !== "None") strength += 1;
  if (bToA.type !== "None") strength += 1;

  return {
    aToB,
    bToA,
    aLotRuler,
    bLotRuler,
    isMutual,
    strength,
  };
}

/**
 * Detriment/Fall 갈등 요소 분석 (업그레이드)
 * 상대방의 Key Points와 애스펙트를 맺을 때만 갈등으로 판정
 */
function analyzeConflictFactors(
  chartA: ChartData,
  chartB: ChartData
): ConflictFactor[] {
  const conflicts: ConflictFactor[] = [];

  const aMoonSign = chartA.planets.moon?.sign;
  const bMoonSign = chartB.planets.moon?.sign;

  if (!aMoonSign || !bMoonSign) return conflicts;

  // A의 달이 싫어하는 행성들
  const aDetriments = DETRIMENT_TABLE[aMoonSign] || [];
  const aFalls = FALL_TABLE[aMoonSign] || [];

  // B의 달이 싫어하는 행성들
  const bDetriments = DETRIMENT_TABLE[bMoonSign] || [];
  const bFalls = FALL_TABLE[bMoonSign] || [];

  // 상대방(B)의 Key Points (Sun, Moon, Asc, Dsc, IC, MC)
  const bKeyPoints = getKeyPoints(chartB);
  
  // 상대방(A)의 Key Points (Sun, Moon, Asc, Dsc, IC, MC)
  const aKeyPoints = getKeyPoints(chartA);

  // A의 달이 싫어하는 행성이 B의 차트에서 문제를 일으키는지 체크
  // 조건: 상대방(B)의 Key Points와 5도 이내 메이저 애스펙트를 맺는 경우만
  for (const planet of [...aDetriments, ...aFalls]) {
    const planetLon = getPlanetLongitude(chartB, planet);
    if (planetLon == null) continue;

    // 상대방(B)의 Key Points와 애스펙트 체크
    for (const point of bKeyPoints) {
      const aspect = calculateMajorAspect(planetLon, point.longitude, 5);
      if (aspect) {
        const conflictType = aDetriments.includes(planet) ? "Detriment" : "Fall";
        const conflictTypeText = conflictType === "Detriment" ? "손상" : "추락";
        
        conflicts.push({
          planet,
          type: conflictType,
          aMoonSign,
          reason: `내담자의 달(${aMoonSign})은 ${planet}을 싫어하는데(${conflictTypeText}), 상대방의 ${planet}이 상대방의 ${point.name}와 ${aspect.type}하여 그 성향이 강하게 드러남 (내담자의 무의식과 충돌)`,
          score: -10,
        });
        break; // 한 번만 추가
      }
    }
  }

  // B의 달이 싫어하는 행성이 A의 차트에서 문제를 일으키는지 체크
  // 조건: 상대방(A)의 Key Points와 5도 이내 메이저 애스펙트를 맺는 경우만
  for (const planet of [...bDetriments, ...bFalls]) {
    const planetLon = getPlanetLongitude(chartA, planet);
    if (planetLon == null) continue;

    // 상대방(A)의 Key Points와 애스펙트 체크
    for (const point of aKeyPoints) {
      const aspect = calculateMajorAspect(planetLon, point.longitude, 5);
      if (aspect) {
        const conflictType = bDetriments.includes(planet) ? "Detriment" : "Fall";
        const conflictTypeText = conflictType === "Detriment" ? "손상" : "추락";
        
        conflicts.push({
          planet,
          type: conflictType,
          aMoonSign: bMoonSign,
          reason: `상대방의 달(${bMoonSign})은 ${planet}을 싫어하는데(${conflictTypeText}), 내담자님의 ${planet}이 내담자님의 ${point.name}와 ${aspect.type}하여 그 성향이 강하게 드러남 (상대방의 무의식과 충돌)`,
          score: -10,
        });
        break; // 한 번만 추가
      }
    }
  }

  return conflicts;
}

/**
 * 길흉 보정 분석 (업그레이드)
 */
function analyzeBeneficMaleficAdjustment(
  chartA: ChartData,
  chartB: ChartData
): BeneficMaleficAdjustment {
  // 금성-화성 조화
  const aVenusLon = getPlanetLongitude(chartA, "Venus");
  const bMarsLon = getPlanetLongitude(chartB, "Mars");
  const bVenusLon = getPlanetLongitude(chartB, "Venus");
  const aMarsLon = getPlanetLongitude(chartA, "Mars");

  const aVenusBMars =
    aVenusLon != null && bMarsLon != null
      ? calculateMajorAspect(aVenusLon, bMarsLon, 5) // 금성-화성 Orb 5도
      : null;
  const bVenusAMars =
    bVenusLon != null && aMarsLon != null
      ? calculateMajorAspect(bVenusLon, aMarsLon, 5)
      : null;

  // 조화 점수 계산
  let venusMarsScore = 0;
  if (aVenusBMars) {
    if (
      aVenusBMars.type === "Trine" ||
      aVenusBMars.type === "Conjunction"
    ) {
      venusMarsScore += 1;
    } else if (
      aVenusBMars.type === "Square" ||
      aVenusBMars.type === "Opposition"
    ) {
      venusMarsScore -= 1;
    }
  }
  if (bVenusAMars) {
    if (
      bVenusAMars.type === "Trine" ||
      bVenusAMars.type === "Conjunction"
    ) {
      venusMarsScore += 1;
    } else if (
      bVenusAMars.type === "Square" ||
      bVenusAMars.type === "Opposition"
    ) {
      venusMarsScore -= 1;
    }
  }

  // 토성 흉각 (Square, Opposition만)
  const aSaturnLon = getPlanetLongitude(chartA, "Saturn");
  const bSaturnLon = getPlanetLongitude(chartB, "Saturn");
  const bKeyPoints = getKeyPoints(chartB);
  const aKeyPoints = getKeyPoints(chartA);

  const aSaturnToBSensitive: SynastryAspect[] = [];
  if (aSaturnLon != null) {
    for (const point of bKeyPoints) {
      const aspect = calculateMajorAspect(aSaturnLon, point.longitude, 8);
      if (
        aspect &&
        (aspect.type === "Square" || aspect.type === "Opposition")
      ) {
        aSaturnToBSensitive.push({
          ...aspect,
          planetA: "Saturn (A)",
          planetB: point.name,
        });
      }
    }
  }

  const bSaturnToASensitive: SynastryAspect[] = [];
  if (bSaturnLon != null) {
    for (const point of aKeyPoints) {
      const aspect = calculateMajorAspect(bSaturnLon, point.longitude, 8);
      if (
        aspect &&
        (aspect.type === "Square" || aspect.type === "Opposition")
      ) {
        bSaturnToASensitive.push({
          ...aspect,
          planetA: "Saturn (B)",
          planetB: point.name,
        });
      }
    }
  }

  const saturnScore =
    aSaturnToBSensitive.length + bSaturnToASensitive.length;

  // Detriment/Fall 갈등 요소
  const conflicts = analyzeConflictFactors(chartA, chartB);
  const conflictScore = conflicts.reduce((sum, c) => sum + c.score, 0);

  return {
    venusMarsHarmony: {
      aVenusBMars: aVenusBMars
        ? {
            ...aVenusBMars,
            planetA: "Venus (A)",
            planetB: "Mars (B)",
          }
        : null,
      bVenusAMars: bVenusAMars
        ? {
            ...bVenusAMars,
            planetA: "Venus (B)",
            planetB: "Mars (A)",
          }
        : null,
      score: venusMarsScore,
    },
    saturnHardAspects: {
      aSaturnToBSensitive,
      bSaturnToASensitive,
      score: saturnScore,
    },
    conflicts,
    conflictScore,
  };
}

/**
 * 궁합(Synastry) 분석 메인 함수 (업그레이드)
 * 
 * @param chartA - 첫 번째 사람의 차트
 * @param chartB - 두 번째 사람의 차트
 * @param genderA - 첫 번째 사람의 성별 ("M" 또는 "F")
 * @param genderB - 두 번째 사람의 성별 ("M" 또는 "F")
 * @returns SynastryResult
 */
export function calculateSynastry(
  chartA: ChartData,
  chartB: ChartData,
  genderA: string = "M",
  genderB: string = "M"
): SynastryResult {
  // Step 1: 달의 룰러 연결 (2단계 검증)
  const moonRulerConnection = analyzeMoonRulerConnection(chartA, chartB);

  // Step 2: 결혼의 랏 룰러 연결 (2단계 검증)
  const marriageLotConnection = analyzeMarriageLotConnection(
    chartA,
    chartB,
    genderA,
    genderB
  );

  // Step 3: 길흉 보정 (갈등 요소 포함)
  const beneficMaleficAdjustment = analyzeBeneficMaleficAdjustment(
    chartA,
    chartB
  );

  // 종합 점수 계산 (업그레이드 로직 - 세분화된 점수 체계)
  let overallScore = 0;

  // 달의 룰러 연결 점수
  const moonScoreA = moonRulerConnection.aToB.score;
  const moonScoreB = moonRulerConnection.bToA.score;
  overallScore += moonScoreA + moonScoreB;
  
  // Mutual Bonus: 쌍방이 모두 5점 이상일 경우 가산점
  if (moonScoreA >= 5 && moonScoreB >= 5) {
    const mutualBonus = moonRulerConnection.isMutual ? 20 : 10; // 양방향 Destiny면 +20, 아니면 +10
    overallScore += mutualBonus;
  }

  // 결혼의 랏 연결 점수
  const lotScoreA = marriageLotConnection.aToB.score;
  const lotScoreB = marriageLotConnection.bToA.score;
  overallScore += lotScoreA + lotScoreB;
  
  // Mutual Bonus: 쌍방이 모두 5점 이상일 경우 가산점
  if (lotScoreA >= 5 && lotScoreB >= 5) {
    const mutualBonus = marriageLotConnection.isMutual ? 20 : 10; // 양방향 Destiny면 +20, 아니면 +10
    overallScore += mutualBonus;
  }

  // 금성-화성 조화 점수 (최대 +10)
  const venusMarsScore = beneficMaleficAdjustment.venusMarsHarmony.score;
  overallScore += Math.max(0, ((venusMarsScore + 2) / 4) * 10);

  // 토성 흉각 감점 (최대 -10점)
  const saturnScore = beneficMaleficAdjustment.saturnHardAspects.score;
  overallScore -= Math.min(10, saturnScore * 2.5);

  // Detriment/Fall 갈등 감점
  overallScore += beneficMaleficAdjustment.conflictScore;

  // 점수를 0-100 범위로 제한
  overallScore = Math.max(0, Math.min(100, Math.round(overallScore)));

  return {
    moonRulerConnection,
    marriageLotConnection,
    beneficMaleficAdjustment,
    overallScore,
  };
}
