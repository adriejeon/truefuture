/**
 * 리뷰 대상 서비스 식별자 (reviews.service 컬럼 값과 1:1)
 *  - consultation : 상담소 (/consultation)
 *  - compatibility: 궁합 (/compatibility)
 *  - daily        : 데일리 운세 (/yearly 데일리 탭)
 *  - lifetime     : 종합운세 (/yearly 종합운세 탭)
 *  - report       : 프리미엄 상세 리포트 (/report, 단건 결제)
 */
export const REVIEW_SERVICES = Object.freeze([
  "consultation",
  "compatibility",
  "daily",
  "lifetime",
  "report",
]);

/** 결제 상품(구매 인증 배지 대상). 나머지는 운세권 소비 서비스(이용 인증 배지). */
export const PAID_PRODUCT_SERVICES = Object.freeze(["report"]);

/** 서비스별 i18n 라벨 키. service 가 null(이관 후기)이면 null */
export function reviewServiceLabelKey(service) {
  return REVIEW_SERVICES.includes(service) ? `reviews.service_${service}` : null;
}

/** 후기 내용 길이 제한 (DB CHECK 와 동일하게 유지) */
export const REVIEW_CONTENT_MIN = 10;
export const REVIEW_CONTENT_MAX = 500;
export const REVIEW_NICKNAME_MAX = 20;
