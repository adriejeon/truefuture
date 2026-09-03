/**
 * 이용권 상품의 구조화 데이터.
 * 가격·구성은 constants/packages.js(단일 소스)에서만 읽는다 — 여기서 다시 하드코딩하지 않는다.
 *
 * 임의의 종료 예정일(priceValidUntil)은 넣지 않는다. 실제 종료 예정일이 정해지면 그때 추가한다.
 */
import { SITE_ORIGIN } from "./seoMeta.js";
import { TICKET_PACKAGES, findPackage } from "./packages.js";
import { organizationRef } from "./siteSeo.js";

const PURCHASE_URL = `${SITE_ORIGIN}/purchase`;

/** 이용권 묶음 상품(=/purchase 가 파는 것)의 @id */
export const TICKET_PRODUCT_ID = `${SITE_ORIGIN}/purchase#product`;

/**
 * 이용권 한 묶음 → Offer 노드.
 * @param {string} id            packages.js 의 상품 id
 * @param {object} [opts]
 * @param {string} [opts.nodeId] 이 Offer 의 @id (페이지 엔티티로 참조해야 할 때)
 * @param {object} [opts.itemOffered] itemOffered 값(@id 참조 또는 인라인 노드)
 * @param {string} [opts.url]    구매 가능한 URL (기본 /purchase)
 * @param {string} [opts.name]   오퍼 표시명 (기본: 상품표의 한글명)
 */
export function ticketOffer(id, { nodeId = null, itemOffered = null, url = PURCHASE_URL, name = null } = {}) {
  const pkg = findPackage(id);
  const node = {
    "@type": "Offer",
    name: name || pkg.nameKo,
    price: String(pkg.price),
    priceCurrency: "KRW",
    availability: "https://schema.org/InStock",
    url,
    seller: organizationRef(),
  };
  if (nodeId) node["@id"] = nodeId;
  if (itemOffered) node.itemOffered = itemOffered;
  return node;
}

/** /purchase 가 파는 이용권 전체 오퍼 목록 */
export const TICKET_OFFERS_JSON_LD = TICKET_PACKAGES.map((pkg) =>
  ticketOffer(pkg.id, { nodeId: `${TICKET_PRODUCT_ID}-${pkg.id}` })
);

export const TICKET_PRODUCT_JSON_LD = {
  "@type": "Product",
  "@id": TICKET_PRODUCT_ID,
  name: "진짜미래 디지털 이용권 (망원경/나침반/탐사선)",
  description:
    "진짜미래의 자유 질문 상담·궁합·오늘의 운세·종합 운세를 이용하기 위한 디지털 이용권입니다. 망원경은 자유 질문과 궁합, 나침반은 오늘의 운세, 탐사선은 종합 운세에 사용합니다.",
  url: PURCHASE_URL,
  image: [`${SITE_ORIGIN}/assets/1200x630.png`],
  brand: { "@type": "Brand", name: "진짜미래" },
  offers: TICKET_OFFERS_JSON_LD,
};
