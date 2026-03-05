/**
 * 타임존 오프셋 유틸리티
 * lng/15(LMT) 공식 대신, IANA 타임존 또는 위경도로부터
 * 해당 시점의 표준/일광절약 적용 오프셋(시간 단위)을 구합니다.
 */

// @ts-ignore Deno npm specifier
import { find as geoFind } from "npm:geo-tz";

export type TimezoneResolutionInput = {
  lat: number;
  lng: number;
  /** DB 등에 저장된 IANA 타임존(예: 'Asia/Seoul'). 있으면 lat/lng 무시하고 이 값 사용 */
  timezone?: string;
};

/**
 * IANA 타임존과 UTC 시각에 대해, 해당 지역의 UTC 오프셋(시간 단위)을 반환합니다.
 * Local Time = UTC + offsetHours (예: KST = UTC+9 → 9 반환)
 * Intl API 사용으로 일광절약(DST)이 반영됩니다.
 */
export function getTimezoneOffsetHoursFromIANA(
  ianaTimeZone: string,
  date: Date,
): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimeZone,
      timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (!tzPart?.value) {
      return 0;
    }
    // "GMT+9", "GMT-5", "GMT+5:30" 등 파싱
    const match = tzPart.value.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) {
      return 0;
    }
    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10) || 0;
    const minutes = match[3] ? parseInt(match[3], 10) : 0;
    const totalHours = sign * (hours + minutes / 60);
    return totalHours;
  } catch {
    return 0;
  }
}

/**
 * 위경도로 IANA 타임존 식별자를 조회합니다.
 * geo-tz 사용. 실패 시 null.
 */
export function getIANATimezoneFromLatLng(
  lat: number,
  lng: number,
): string | null {
  try {
    const result = geoFind(lat, lng);
    if (Array.isArray(result) && result.length > 0) {
      return result[0];
    }
    if (typeof result === "string") {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 요청 데이터(lat/lng 또는 timezone)와 차트 시각(date)을 바탕으로
 * 하우스 계산에 쓸 타임존 오프셋(시간 단위)을 반환합니다.
 * - timezone이 있으면 해당 IANA 구역의 오프셋 사용.
 * - 없으면 lat/lng로 IANA를 조회한 뒤 오프셋 사용.
 * - 조회 실패 시 0(UTC)을 반환하되, 로그로 경고합니다.
 */
export async function resolveTimezoneOffsetHours(
  options: TimezoneResolutionInput,
  date: Date,
): Promise<number> {
  const { lat, lng, timezone } = options;

  if (timezone && typeof timezone === "string" && timezone.trim()) {
    return getTimezoneOffsetHoursFromIANA(timezone.trim(), date);
  }

  const iana = getIANATimezoneFromLatLng(lat, lng);
  if (iana) {
    return getTimezoneOffsetHoursFromIANA(iana, date);
  }

  // Fallback 1: 위경도가 한국 범위 내인지 확인
  const isKorea = lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
  if (isKorea) {
    console.warn(`[timezoneUtils] IANA 조회 실패. 한국 좌표 추정(lat=${lat}, lng=${lng}). Asia/Seoul(+9) 사용.`);
    return getTimezoneOffsetHoursFromIANA("Asia/Seoul", date);
  }

  // Fallback 2: 경도 기반 근사치 계산 (LMT 기반 표준시)
  const approximateOffset = Math.round(lng / 15);
  console.warn(
    `[timezoneUtils] IANA 조회 실패 (lat=${lat}, lng=${lng}). 경도 기반 근사치(UTC${approximateOffset > 0 ? '+' : ''}${approximateOffset}) 사용.`,
  );
  return approximateOffset;
}
