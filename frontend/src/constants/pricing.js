/**
 * 화면·구조화 데이터·프리렌더가 공유하는 가격/수량 상수.
 * 이용권 가격은 constants/packages.js(단일 소스)에서 파생시키고,
 * 단건 결제 상품(프리미엄 상세 리포트)만 여기서 직접 정의한다.
 */
import { packagePrice } from "./packages.js";

/** 프리미엄 상세 리포트 판매가 (단건 결제, supabase/functions/premium-report 의 결제 금액과 동일) */
export const REPORT_PRICE = 18000;

/**
 * 운영자가 사람이 직접 써서 제공하던 1:1 서면 분석의 '기준 가격'.
 * 리포트의 정가·할인 전 가격이 아니다 — 구조화 데이터의 Offer/priceSpecification 에 쓰지 않는다.
 */
export const LEGACY_WRITTEN_ANALYSIS_PRICE = 100000;

/** 리포트가 다루는 기간: 발행일부터 약 10년 = 시작·마지막 해를 포함한 11개 달력 연도 */
export const REPORT_YEAR_SPAN = 10;
export const REPORT_YEAR_COUNT = REPORT_YEAR_SPAN + 1;

/** 자유 질문 상담 1회 = 망원경 1개 (get-fortune: consultation → PAID 1) */
export const CONSULTATION_PRICE = packagePrice("ticket_1");

/** 궁합 1회 = 망원경 1개 (get-fortune: compatibility → PAID 1) */
export const COMPATIBILITY_PRICE = packagePrice("ticket_1");

/** 종합운세 1회 = 탐사선 1대 (get-fortune: lifetime → PROBE 1) */
export const LIFETIME_PRICE = packagePrice("probe_1");

/** 결제 후 환불을 신청할 수 있는 기간(일). 화면 안내와 프리렌더가 같은 값을 쓴다 (이용약관 제7조) */
export const REFUND_WINDOW_DAYS = 7;

/** 유료 운세 교환권의 유효기간(일). 결제일 기준 (이용약관 제8조) */
export const TICKET_VALIDITY_DAYS = 90;

/** 리포트 완성 소요 시간 안내 문구에 쓰는 범위(분) */
export const REPORT_ETA_MINUTES = Object.freeze({ min: 5, max: 10 });

/** 오늘의 운세 1회 = 나침반 1개. 나침반은 개별 판매가 없어 최소 구성(7개 묶음) 가격을 함께 표기한다 */
export const DAILY_PACK_ID = "daily_7";
export const DAILY_PACK_PRICE = packagePrice(DAILY_PACK_ID);
export const DAILY_PACK_QUANTITY = 7;
