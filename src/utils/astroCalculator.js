/**
 * True Future - 점성술 계산 유틸리티
 * astronomy-engine 라이브러리를 사용한 차트 계산
 */

import { MakeTime, Body, GeoVector, Ecliptic } from 'astronomy-engine';

// 별자리 이름 배열 (0 = Aries, 11 = Pisces)
const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

// 행성 매핑
const PLANETS = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
};

/**
 * 각도를 0-360 범위로 정규화
 * @param {number} degrees - 각도
 * @returns {number} 정규화된 각도
 */
function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

/**
 * 황도 경도로부터 별자리 정보 계산
 * @param {number} longitude - 황도 경도 (0-360)
 * @returns {Object} 별자리 정보 {sign, degreeInSign}
 */
function getSignFromLongitude(longitude) {
  const normalized = normalizeDegrees(longitude);
  const signIndex = Math.floor(normalized / 30);
  const degreeInSign = normalized % 30;

  return {
    sign: SIGNS[signIndex],
    degreeInSign: degreeInSign,
  };
}

/**
 * Whole Sign 하우스 시스템: 별자리가 곧 하우스
 * @param {number} longitude - 황도 경도 (0-360)
 * @param {number} ascendantLon - 상승점 경도 (0-360)
 * @returns {number} 하우스 번호 (1-12)
 */
function getWholeSignHouse(longitude, ascendantLon) {
  const normalized = normalizeDegrees(longitude);
  const ascNormalized = normalizeDegrees(ascendantLon);
  
  // 상승점의 별자리 인덱스 (이것이 1하우스)
  const ascSignIndex = Math.floor(ascNormalized / 30);
  
  // 행성의 별자리 인덱스
  const planetSignIndex = Math.floor(normalized / 30);
  
  // 하우스 계산: 상승점 별자리를 기준으로 상대적 위치
  let house = planetSignIndex - ascSignIndex + 1;
  
  // 1-12 범위로 정규화
  if (house < 1) house += 12;
  if (house > 12) house -= 12;
  
  return house;
}

/**
 * 상승점(Ascendant) 계산
 * Whole Sign 시스템에서는 상승점의 별자리 시작점이 1하우스의 시작
 * 간단하게 상승점 경도를 계산 (정확한 계산은 복잡하므로 근사값 사용)
 * @param {Date} date - UTC 날짜/시간
 * @param {number} lat - 위도
 * @param {number} lng - 경도
 * @returns {number} 상승점 경도 (0-360)
 */
function calculateAscendant(date, lat, lng) {
  // 간단한 근사 계산: 시간과 위치 기반
  // 정확한 계산은 복잡하므로, 시간대와 위도를 기반으로 근사값 계산
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  
  // 시간을 각도로 변환 (24시간 = 360도)
  const timeAngle = (hour / 24) * 360;
  
  // 위도 보정 (간단한 근사)
  const latCorrection = lat * 0.5;
  
  // 경도 보정
  const lngCorrection = lng;
  
  // 상승점 경도 계산 (근사값)
  let ascendant = timeAngle + lngCorrection + latCorrection;
  
  return normalizeDegrees(ascendant);
}

/**
 * 포르투나(Fortune) 위치 계산
 * 전통적인 공식: Fortune = Ascendant + Moon - Sun
 * @param {number} ascendant - 상승점 경도
 * @param {number} moonLon - 달의 경도
 * @param {number} sunLon - 태양의 경도
 * @returns {number} 포르투나 경도
 */
function calculateFortuna(ascendant, moonLon, sunLon) {
  let fortuna = ascendant + moonLon - sunLon;
  return normalizeDegrees(fortuna);
}

/**
 * 행성의 황도 경도 계산
 * @param {Body} body - astronomy-engine의 Body 상수
 * @param {Time} time - astronomy-engine의 Time 객체
 * @returns {number} 황도 경도 (0-360)
 */
function getPlanetLongitude(body, time) {
  // 지구 중심 벡터 가져오기
  const vector = GeoVector(body, time, true);
  
  // 황도 좌표로 변환
  const ecliptic = Ecliptic(vector);
  
  // 경도 반환 (라디안을 도로 변환)
  const longitude = ecliptic.elon * (180 / Math.PI);
  
  return normalizeDegrees(longitude);
}

/**
 * 점성술 차트 계산
 * @param {Date} date - UTC 날짜/시간
 * @param {number} lat - 위도 (도 단위, 북위는 양수)
 * @param {number} lng - 경도 (도 단위, 동경은 양수)
 * @returns {Promise<Object>} 차트 데이터 또는 에러 객체
 */
export async function calculateChart(date, lat, lng) {
  try {
    // 입력값 검증
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date provided. Date must be a valid Date object.');
    }

    if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error('Invalid latitude. Must be a number between -90 and 90.');
    }

    if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
      throw new Error('Invalid longitude. Must be a number between -180 and 180.');
    }

    // astronomy-engine의 Time 객체 생성
    const time = MakeTime(date);

    // 상승점 계산
    const ascendant = calculateAscendant(date, lat, lng);
    const ascendantSignInfo = getSignFromLongitude(ascendant);

    // 행성 위치 계산
    const planetsData = {};

    for (const [planetName, body] of Object.entries(PLANETS)) {
      const longitude = getPlanetLongitude(body, time);
      const signInfo = getSignFromLongitude(longitude);
      const house = getWholeSignHouse(longitude, ascendant);

      planetsData[planetName] = {
        sign: signInfo.sign,
        degree: longitude,
        degreeInSign: signInfo.degreeInSign,
        house: house,
      };
    }

    // 포르투나 계산
    const moonLon = planetsData.moon.degree;
    const sunLon = planetsData.sun.degree;
    const fortunaLon = calculateFortuna(ascendant, moonLon, sunLon);
    const fortunaSignInfo = getSignFromLongitude(fortunaLon);
    const fortunaHouse = getWholeSignHouse(fortunaLon, ascendant);

    // 천정(Midheaven) 근사 계산 (간단한 근사값)
    const midheaven = normalizeDegrees(ascendant + 90);

    // 결과 객체 구성
    const result = {
      date: date.toISOString(),
      location: {
        lat: lat,
        lng: lng,
      },
      houses: {
        // Whole Sign 시스템에서는 별자리가 곧 하우스
        system: 'Whole Sign',
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
      },
    };

    return result;
  } catch (error) {
    // 에러 처리: 명확한 에러 메시지 반환
    return {
      error: true,
      message: error.message || 'Unknown error occurred during chart calculation.',
      details: error.toString(),
    };
  }
}
