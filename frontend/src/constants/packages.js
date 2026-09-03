/**
 * 이용권(스타) 상품 표 — 가격의 단일 소스.
 *
 * 이 표를 읽는 곳:
 *   · 화면      : pages/Purchase.jsx (결제 카드)
 *   · 구조화데이터: constants/packageOffers.js → 각 페이지 JSON-LD Offer
 *   · 프리렌더  : scripts/prerender-pages.js (JS 미실행 크롤러용 최초 HTML)
 *
 * 서버(supabase/functions/purchase-stars 의 PACKAGES)와 id·price 가 일치해야 한다.
 * 가격을 바꿀 때는 이 파일과 서버 표만 고치면 화면·JSON-LD·프리렌더가 함께 따라온다.
 */

/** 운세권 종류: PAID=망원경, BONUS=나침반, PROBE=탐사선 */
export const TICKET_PACKAGES = Object.freeze([
  // priceUsd: null → 영문(PayPal) 노출 제외 (페이팔 고정 수수료 $0.30 방어)
  { id: "ticket_1", nameKey: "purchase_items.telescope_1_name", descKey: "purchase_items.telescope_1_desc", nameKo: "망원경 1개", nameEn: "Ticket_1", price: 1000, priceUsd: null, paid: 1, bonus: 0, color: "from-blue-400 to-cyan-500", iconType: "telescope" },
  { id: "ticket_3", nameKey: "purchase_items.telescope_3_name", descKey: "purchase_items.telescope_3_desc", nameKo: "망원경 3개", nameEn: "Ticket_3", price: 2900, priceUsd: 2.99, paid: 3, bonus: 1, color: "from-purple-400 to-pink-500", iconType: "telescope" },
  { id: "ticket_5", nameKey: "purchase_items.telescope_5_name", descKey: "purchase_items.telescope_5_desc", nameKo: "망원경 5개", nameEn: "Ticket_5", price: 4950, priceUsd: 4.99, paid: 5, bonus: 3, color: "from-yellow-400 to-orange-500", iconType: "telescope", badge: "BEST" },
  { id: "daily_7",  nameKey: "purchase_items.compass_7_name",   descKey: "purchase_items.compass_7_desc",   nameKo: "나침반 7개",  nameEn: "Daily_7",  price: 1900, priceUsd: null, paid: 0, bonus: 7,  color: "from-green-400 to-emerald-500", iconType: "compass" },
  { id: "daily_14", nameKey: "purchase_items.compass_14_name",  descKey: "purchase_items.compass_14_desc",  nameKo: "나침반 14개", nameEn: "Daily_14", price: 3500, priceUsd: 3.99, paid: 0, bonus: 14, color: "from-indigo-400 to-purple-600",  iconType: "compass", badgeKey: "purchase_items.badge_discount_14" },
  { id: "probe_1",  nameKey: "purchase_items.probe_1_name",     descKey: "purchase_items.probe_1_desc",     nameKo: "탐사선 1대",  nameEn: "Probe_1",  price: 2990, priceUsd: 2.99, paid: 0, bonus: 0, probe: 1, color: "from-amber-400 to-rose-500", iconType: "probe" },
]);

/** id 로 상품 한 건. 없는 id 는 빌드/렌더 시 바로 드러나도록 예외를 던진다 */
export function findPackage(id) {
  const found = TICKET_PACKAGES.find((p) => p.id === id);
  if (!found) throw new Error(`unknown ticket package: ${id}`);
  return found;
}

/** id 로 가격(원) */
export function packagePrice(id) {
  return findPackage(id).price;
}
