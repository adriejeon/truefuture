import { SITE_ORIGIN } from "./seoMeta";

/**
 * 이용권 상품의 구조화 데이터 단일 소스.
 * /purchase(WebPage.mainEntity)와 /yearly(AstrologyPageHelmet Product)가 같은 @id·같은 오퍼를 쓰도록 해
 * 페이지마다 가격·설명이 어긋나는 것을 막는다. 가격은 Purchase.jsx PACKAGE_BASE / 서버 PACKAGES 표와 동일해야 한다.
 */
export const TICKET_PRODUCT_ID = `${SITE_ORIGIN}/#product-tickets`;
const PURCHASE_URL = `${SITE_ORIGIN}/purchase`;
const PRICE_VALID_UNTIL = "2027-12-31";

const OFFERS = [
  { name: "망원경 1개", description: "1:1 자유 질문 1회 (망원경 1개)", price: 1000 },
  { name: "망원경 3개", description: "1:1 자유 질문 3회 + 오늘의 운세 1회 (망원경 3개 + 나침반 1개)", price: 2900 },
  { name: "망원경 5개", description: "1:1 자유 질문 5회 + 오늘의 운세 3회 (망원경 5개 + 나침반 3개)", price: 4950 },
  { name: "나침반 7개", description: "오늘의 운세 7회 (나침반 7개)", price: 1900 },
  { name: "나침반 14개", description: "오늘의 운세 14회 (나침반 14개)", price: 3500 },
  { name: "탐사선 1대", description: "종합운세 1회 열람권 (탐사선 1대)", price: 2990 },
];

export const TICKET_OFFERS_JSON_LD = OFFERS.map((o) => ({
  "@type": "Offer",
  ...o,
  priceCurrency: "KRW",
  priceValidUntil: PRICE_VALID_UNTIL,
  availability: "https://schema.org/InStock",
  url: PURCHASE_URL,
}));

export const TICKET_PRODUCT_JSON_LD = {
  "@type": "Product",
  "@id": TICKET_PRODUCT_ID,
  name: "진짜미래 디지털 이용권 (망원경/나침반/탐사선)",
  url: PURCHASE_URL,
  image: [`${SITE_ORIGIN}/assets/1200x630.png`],
  brand: { "@type": "Brand", name: "진짜미래" },
  offers: TICKET_OFFERS_JSON_LD,
};
