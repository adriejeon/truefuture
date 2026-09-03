/**
 * 페이지별 JSON-LD 그래프 빌더 (화면·프리렌더 공용).
 *
 * 원칙
 *   · Organization/WebSite 는 index.html 정적 그래프에서 한 번만 정의하고 여기서는 @id 로만 참조한다.
 *   · 한 페이지에는 그 페이지에 실제로 존재하는 엔티티만 넣는다.
 *   · 평점·후기는 그 페이지 화면에 보이는 데이터(usePublishedReviews 결과)만 쓴다.
 *   · 가격은 constants/pricing.js·packages.js 에서만 가져온다.
 *
 * React 페이지(PageSeo)와 빌드 시 프리렌더 스크립트가 같은 함수를 호출하므로
 * 최초 HTML 과 hydration 후 DOM 의 구조화 데이터가 동일하다.
 */
import {
  BRAND_NAME,
  DEFAULT_OG_IMAGE,
  FAQ_PAGE_DESCRIPTION,
  PAGE_SEO,
  REPORT_DESCRIPTION,
  REPORT_PRODUCT_NAME,
  SITE_DESCRIPTION,
  SITE_SERVICE_ID,
  absoluteUrl,
  nodeId,
  organizationRef,
  websiteRef,
} from "../constants/siteSeo.js";
import {
  COMPATIBILITY_PRICE,
  CONSULTATION_PRICE,
  DAILY_PACK_QUANTITY,
  REPORT_PRICE,
} from "../constants/pricing.js";
import { TICKET_PRODUCT_ID, TICKET_PRODUCT_JSON_LD, ticketOffer } from "../constants/packageOffers.js";
import { withReviewsJsonLd } from "./reviewJsonLd.js";

/** 후기 캐러셀 첫 페이지 크기 = JSON-LD 에 싣는 개별 Review 상한 (화면에서 바로 볼 수 있는 만큼만) */
export const HOME_REVIEW_PAGE_SIZE = 12;
export const REPORT_REVIEW_PAGE_SIZE = 8;

const KR = { "@type": "Country", name: "KR" };

export function buildGraph(nodes) {
  return { "@context": "https://schema.org", "@graph": (nodes || []).filter(Boolean) };
}

/** 페이지 엔티티(WebPage/FAQPage 등) 공통 골격 */
export function buildWebPage({
  path,
  name,
  description,
  mainEntityId = null,
  type = "WebPage",
  inLanguage = "ko",
  extra = null,
}) {
  const node = {
    "@type": type,
    "@id": nodeId(path, "webpage"),
    url: absoluteUrl(path),
    name,
    description,
    inLanguage,
    isPartOf: websiteRef(),
    about: organizationRef(),
  };
  if (mainEntityId) node.mainEntity = { "@id": mainEntityId };
  return extra ? { ...node, ...extra } : node;
}

function questionNode(item) {
  return {
    "@type": "Question",
    name: item.title,
    acceptedAnswer: { "@type": "Answer", text: item.content },
  };
}

/* ───────────────────────── 자유 질문 상담 (메인·/consultation 공용 엔티티) ───────────────────────── */

const CONSULTATION_SERVICE_ID = nodeId("/consultation", "service");
const CONSULTATION_OFFER_ID = nodeId("/consultation", "offer");

function consultationServiceNode(description) {
  return {
    "@type": "Service",
    "@id": CONSULTATION_SERVICE_ID,
    name: "진짜미래 자유 질문 상담",
    serviceType: "고전 점성술 출생 차트 기반 1:1 질문 상담",
    description,
    provider: organizationRef(),
    areaServed: KR,
    offers: { "@id": CONSULTATION_OFFER_ID },
  };
}

/** 자유 질문 1회 = 망원경 1개. 가격은 상품표에서 파생된다 */
function consultationOfferNode() {
  return ticketOffer("ticket_1", {
    nodeId: CONSULTATION_OFFER_ID,
    name: `자유 질문 상담 1회 (망원경 1개, ${CONSULTATION_PRICE.toLocaleString("ko-KR")}원)`,
    url: absoluteUrl("/consultation"),
    itemOffered: { "@id": CONSULTATION_SERVICE_ID },
  });
}

/* ───────────────────────── 페이지별 그래프 ───────────────────────── */

/**
 * 메인 `/`.
 * 대표 서비스(#service)에 메인 화면에 표시되는 공개 후기 평점을 연결한다.
 * 후기 섹션이 보이지 않을 때(후기 0건)는 평점을 붙이지 않는다.
 */
export function buildHomeGraph({ reviews = [], summary = null, consultationDescription = "" } = {}) {
  const service = withReviewsJsonLd(
    {
      "@type": "Service",
      "@id": SITE_SERVICE_ID,
      name: "진짜미래 AI 점성술 상담",
      serviceType: "고전 점성술 출생 차트 분석 및 1:1 질문 상담",
      description: SITE_DESCRIPTION,
      provider: organizationRef(),
      areaServed: KR,
      offers: [{ "@id": CONSULTATION_OFFER_ID }],
    },
    { reviews, summary, max: HOME_REVIEW_PAGE_SIZE }
  );

  return [
    buildWebPage({
      path: "/",
      name: PAGE_SEO.home.title,
      description: SITE_DESCRIPTION,
      mainEntityId: SITE_SERVICE_ID,
    }),
    service,
    consultationOfferNode(),
    consultationServiceNode(consultationDescription || SITE_DESCRIPTION),
  ];
}

/** `/consultation` — 상담 서비스와 그 오퍼 */
export function buildConsultationGraph({ title, description }) {
  return [
    buildWebPage({
      path: "/consultation",
      name: title,
      description,
      mainEntityId: CONSULTATION_SERVICE_ID,
    }),
    consultationServiceNode(description),
    consultationOfferNode(),
  ];
}

/** `/compatibility` — 궁합 서비스(망원경 1개 소비) */
export function buildCompatibilityGraph({ title, description }) {
  const serviceId = nodeId("/compatibility", "service");
  const offerId = nodeId("/compatibility", "offer");
  return [
    buildWebPage({
      path: "/compatibility",
      name: title,
      description,
      mainEntityId: serviceId,
    }),
    {
      "@type": "Service",
      "@id": serviceId,
      name: "진짜미래 궁합 분석",
      serviceType: "고전 점성술 시너스트리 궁합 분석",
      description,
      provider: organizationRef(),
      areaServed: KR,
      offers: { "@id": offerId },
    },
    ticketOffer("ticket_1", {
      nodeId: offerId,
      name: `궁합 분석 1회 (망원경 1개, ${COMPATIBILITY_PRICE.toLocaleString("ko-KR")}원)`,
      itemOffered: { "@id": serviceId },
    }),
  ];
}

/** `/yearly` — 데일리(나침반)·종합운세(탐사선) 두 오퍼를 하나로 뭉치지 않고 각각 표기 */
export function buildYearlyGraph({ title, description }) {
  const serviceId = nodeId("/yearly", "service");
  const dailyOfferId = nodeId("/yearly", "offer-daily");
  const lifetimeOfferId = nodeId("/yearly", "offer-lifetime");
  return [
    buildWebPage({ path: "/yearly", name: title, description, mainEntityId: serviceId }),
    {
      "@type": "Service",
      "@id": serviceId,
      name: "진짜미래 데일리·종합 운세",
      serviceType: "고전 점성술 트랜짓 기반 시기 안내 및 출생 차트 종합 해석",
      description,
      provider: organizationRef(),
      areaServed: KR,
      offers: [{ "@id": dailyOfferId }, { "@id": lifetimeOfferId }],
    },
    ticketOffer("daily_7", {
      nodeId: dailyOfferId,
      name: `오늘의 운세 ${DAILY_PACK_QUANTITY}회 (나침반 ${DAILY_PACK_QUANTITY}개)`,
      itemOffered: { "@id": serviceId },
    }),
    ticketOffer("probe_1", {
      nodeId: lifetimeOfferId,
      name: "종합 운세 1회 (탐사선 1대)",
      itemOffered: { "@id": serviceId },
    }),
  ];
}

/**
 * `/report` — 고정 가격으로 구매하고 PDF 결과물을 받는 디지털 상품.
 * mainEntity = Product, 평점·후기는 이 페이지에 노출되는 리포트 구매 후기만.
 * 기준 가격 100,000원(수기 서면 분석 비교값)은 정가·할인으로 구조화하지 않는다.
 */
export function buildReportGraph({ reviews = [], summary = null, faqItems = [] } = {}) {
  const productId = nodeId("/report", "product");
  const offerId = nodeId("/report", "offer");
  const faqId = nodeId("/report", "faq");

  const product = withReviewsJsonLd(
    {
      "@type": "Product",
      "@id": productId,
      name: REPORT_PRODUCT_NAME,
      url: absoluteUrl("/report"),
      image: [DEFAULT_OG_IMAGE],
      description: REPORT_DESCRIPTION,
      category: "고전 점성술 서면 상담 리포트",
      brand: { "@type": "Brand", name: BRAND_NAME },
      offers: { "@id": offerId },
    },
    { reviews, summary, max: REPORT_REVIEW_PAGE_SIZE }
  );

  const offer = {
    "@type": "Offer",
    "@id": offerId,
    url: absoluteUrl("/report"),
    price: String(REPORT_PRICE),
    priceCurrency: "KRW",
    availability: "https://schema.org/InStock",
    seller: organizationRef(),
    itemOffered: { "@id": productId },
  };

  const faqNode = faqItems.length
    ? {
        "@type": "FAQPage",
        "@id": faqId,
        name: `${REPORT_PRODUCT_NAME} 자주 묻는 질문`,
        inLanguage: "ko",
        mainEntity: faqItems.map(questionNode),
      }
    : null;

  const webPage = buildWebPage({
    path: "/report",
    name: PAGE_SEO.report.title,
    description: REPORT_DESCRIPTION,
    mainEntityId: productId,
    extra: faqNode ? { hasPart: { "@id": faqId } } : null,
  });

  return [webPage, product, offer, faqNode];
}

/** `/faq` — 페이지 자체가 FAQPage */
export function buildFaqPageGraph({ title, items = [] }) {
  return [
    {
      "@type": "FAQPage",
      "@id": nodeId("/faq", "webpage"),
      url: absoluteUrl("/faq"),
      name: title,
      description: FAQ_PAGE_DESCRIPTION,
      inLanguage: "ko",
      isPartOf: websiteRef(),
      about: organizationRef(),
      mainEntity: items.map(questionNode),
    },
  ];
}

/** `/purchase` — 이용권을 파는 페이지. 상품(Product)과 오퍼 전체가 화면에 표시된다 */
export function buildPurchaseGraph({ title, description, disambiguating = null }) {
  const webPage = buildWebPage({
    path: "/purchase",
    name: title,
    description,
    mainEntityId: TICKET_PRODUCT_ID,
    extra: {
      potentialAction: {
        "@type": "BuyAction",
        target: absoluteUrl("/purchase"),
        name: "진짜미래 이용권 결제하기",
      },
      ...(disambiguating ? { disambiguatingDescription: disambiguating } : {}),
    },
  });
  return [webPage, TICKET_PRODUCT_JSON_LD];
}

/** `/daily-tarot` — 하루 1회 무료. 무료임을 price 0 으로 명시한다 */
export function buildDailyTarotGraph({ title, description, about = [], inLanguage = "ko" }) {
  const serviceId = nodeId("/daily-tarot", "service");
  const offerId = nodeId("/daily-tarot", "offer");
  return [
    buildWebPage({
      path: "/daily-tarot",
      name: title,
      description,
      mainEntityId: serviceId,
      inLanguage,
      extra: about.length ? { about: [organizationRef(), ...about] } : null,
    }),
    {
      "@type": "Service",
      "@id": serviceId,
      name: title,
      serviceType: inLanguage === "en" ? "Daily tarot and oracle card reading" : "데일리 타로·오라클 카드 리딩",
      description,
      provider: organizationRef(),
      areaServed: KR,
      offers: { "@id": offerId },
    },
    {
      "@type": "Offer",
      "@id": offerId,
      name: inLanguage === "en" ? "Free Daily Tarot & Oracle Card Draw" : "무료 데일리 타로·오라클 카드 뽑기",
      price: "0",
      priceCurrency: "KRW",
      availability: "https://schema.org/InStock",
      url: absoluteUrl("/daily-tarot"),
      seller: organizationRef(),
      itemOffered: { "@id": serviceId },
    },
  ];
}
