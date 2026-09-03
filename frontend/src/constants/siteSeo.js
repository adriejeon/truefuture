/**
 * 사이트 전역 SEO/GEO 단일 소스.
 *
 * 여기 한 곳에서 정의하는 것:
 *   · 브랜드/운영주체/연락처 (푸터에 실제 표시되는 값과 동일해야 한다)
 *   · 공통 엔티티: Organization(#organization) · WebSite(#website)
 *   · 페이지별 엔티티 @id 규칙
 *   · 페이지별 title/description 출처 (i18n 키 또는 리터럴)
 *
 * 규칙
 *   1. Organization·WebSite 는 공통이므로 index.html(정적)에 한 번만 싣고,
 *      페이지 JSON-LD 에서는 새 객체로 다시 정의하지 않고 @id 로만 참조한다.
 *   2. Service/Product/Offer/FAQPage 는 그 페이지에만 넣는다.
 *   3. 검증할 수 없는 수치(리뷰 수 등)·홍보 표현은 description 에 넣지 않는다.
 *      리뷰 수·평점은 공개 후기 데이터에서 계산해 aggregateRating 으로만 표현한다.
 */
import { SITE_ORIGIN, DEFAULT_OG_IMAGE } from "./seoMeta.js";
import { REPORT_YEAR_COUNT, REPORT_YEAR_SPAN } from "./pricing.js";

export { SITE_ORIGIN, DEFAULT_OG_IMAGE };

export const BRAND_NAME = "진짜미래";
/** 운영 주체(사업자). 브랜드명 진짜미래와 구분해 legalName 으로 표기한다 */
export const LEGAL_NAME = "주피터";
export const LOGO_URL = `${SITE_ORIGIN}/assets/logo.png`;

/**
 * 실제 화면(푸터·문의 폼)에 공개된 연락처. JSON-LD 는 이 값만 쓴다.
 * 이메일은 푸터 링크·문의 폼 수신 주소(supabase/functions/send-email RECIPIENT)와 동일한 주소다.
 */
export const CONTACT = Object.freeze({
  email: "jupiteradrie@gmail.com",
  phone: "0507-1348-1257",
  phoneE164: "+82-507-1348-1257",
  streetAddress: "인헌16길 9-202",
  addressLocality: "관악구",
  addressRegion: "서울특별시",
  postalCode: "08800",
  addressCountry: "KR",
  businessNumber: "344-30-02017",
});

/** 사실 중심 서비스 설명 (검증 가능한 기능만 나열) */
export const SITE_DESCRIPTION =
  "출생 시각과 출생지를 기반으로 고전 점성술 출생 차트를 계산하고, 자유 질문 상담·궁합·연간 운세·10년 상세 리포트를 제공하는 비대면 AI 점성술 서비스입니다.";

/** 사주·타로와 혼동되지 않게 하는 짧은 구분 설명 */
export const SITE_DISAMBIGUATION =
  "사주·타로가 아닌 서양 정통 고전 점성술의 출생 차트를 바탕으로 개인별 질문에 답하는 유료 AI 상담 서비스입니다.";

/* ───────────────────────── @id 규칙 ───────────────────────── */

export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
/** 메인이 대표하는 서비스 전체(엄브렐라). 리포트 상품(#product)과 같은 개체로 취급하지 않는다 */
export const SITE_SERVICE_ID = `${SITE_ORIGIN}/#service`;

export const organizationRef = () => ({ "@id": ORGANIZATION_ID });
export const websiteRef = () => ({ "@id": WEBSITE_ID });

/** 경로 → 절대 URL. 루트만 슬래시로 끝나고 나머지는 후행 슬래시를 쓰지 않는다 */
export function absoluteUrl(path = "/") {
  if (!path || path === "/") return `${SITE_ORIGIN}/`;
  const clean = `/${String(path).replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return `${SITE_ORIGIN}${clean}`;
}

/** 페이지 엔티티 @id (예: nodeId('/report','product') → https://truefuture.kr/report#product) */
export function nodeId(path, fragment) {
  return `${absoluteUrl(path)}#${fragment}`;
}

/* ───────────────────────── 공통 엔티티 ───────────────────────── */

export const ORGANIZATION_JSON_LD = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: BRAND_NAME,
  legalName: LEGAL_NAME,
  url: `${SITE_ORIGIN}/`,
  logo: { "@type": "ImageObject", url: LOGO_URL },
  image: DEFAULT_OG_IMAGE,
  description: SITE_DESCRIPTION,
  disambiguatingDescription: SITE_DISAMBIGUATION,
  taxID: CONTACT.businessNumber,
  telephone: CONTACT.phoneE164,
  email: CONTACT.email,
  address: {
    "@type": "PostalAddress",
    streetAddress: CONTACT.streetAddress,
    addressLocality: CONTACT.addressLocality,
    addressRegion: CONTACT.addressRegion,
    postalCode: CONTACT.postalCode,
    addressCountry: CONTACT.addressCountry,
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: CONTACT.email,
    telephone: CONTACT.phoneE164,
    availableLanguage: "ko",
  },
};

export const WEBSITE_JSON_LD = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${SITE_ORIGIN}/`,
  name: BRAND_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: "ko",
  publisher: organizationRef(),
};

/** 모든 경로에 공통으로 노출해도 되는 엔티티 (index.html 정적 삽입용) */
export const COMMON_GRAPH = [ORGANIZATION_JSON_LD, WEBSITE_JSON_LD];

/* ───────────────────────── 페이지별 메타 출처 ───────────────────────── */

export const REPORT_PRODUCT_NAME = "프리미엄 상세 리포트";

/**
 * 리포트 상품 설명 — 화면 문구와 같은 사실만 담는다.
 * (기간 표현은 REPORT_YEAR_SPAN/COUNT 에서 만들어 화면·JSON-LD 가 어긋나지 않게 한다)
 */
export const REPORT_SPAN_SENTENCE = `현재 시점부터 앞으로 약 ${REPORT_YEAR_SPAN}년, 시작 연도와 마지막 연도를 포함한 총 ${REPORT_YEAR_COUNT}개 연도 구간을 풀이합니다.`;

export const REPORT_DESCRIPTION =
  `궁금한 질문에 먼저 답하고, 출생 시각과 출생지로 계산한 천체 위치를 바탕으로 앞으로 약 ${REPORT_YEAR_SPAN}년의 흐름을 연도별로 풀어 드리는 고전 점성술 서면 리포트입니다. ` +
  `${REPORT_SPAN_SENTENCE} 결제 후 5~10분 안에 완성되고, 텍스트 선택·검색이 되는 PDF로 소장할 수 있습니다.`;

export const FAQ_PAGE_DESCRIPTION =
  "무료 운세 사이트와의 차이, 자유 질문 상담에서 물어볼 수 있는 내용, 이용권 결제 방식 등 진짜미래에 대해 가장 많이 묻는 질문과 답변입니다.";

/**
 * 페이지별 title/description 출처.
 *   titleKey/descriptionKey : i18n 키 (ko/en 모두 제공되는 페이지)
 *   *_seo_title 은 검색·AI 결과용 제목이라 화면 헤딩(free_question.title 등)과 분리해 둔다 —
 *   화면은 짧은 제목을, 검색 결과는 무엇을 하는 페이지인지 드러나는 제목을 쓴다.
 *   title/description       : 리터럴 (한국어 전용 페이지)
 * PageSeo 와 프리렌더 스크립트가 같은 표를 읽는다.
 */
export const PAGE_SEO = Object.freeze({
  home: {
    path: "/",
    title: "진짜미래 | 1:1 맞춤형 정통 고전 점성술 AI 상담소",
    description: SITE_DESCRIPTION,
    ogType: "website",
  },
  report: {
    path: "/report",
    title: `${REPORT_PRODUCT_NAME} | 진짜미래 - 질문 상담과 ${REPORT_YEAR_SPAN}년 시기 리포트`,
    description: REPORT_DESCRIPTION,
    ogType: "product",
  },
  consultation: {
    path: "/consultation",
    titleKey: "free_question.seo_title",
    descriptionKey: "free_question.description",
    ogType: "website",
  },
  compatibility: {
    path: "/compatibility",
    titleKey: "compatibility.seo_title",
    descriptionKey: "compatibility.description",
    ogType: "website",
  },
  yearly: {
    path: "/yearly",
    title: "연간·데일리 운세 | 진짜미래 정통 점성술 컨설팅",
    description:
      "출생 차트를 기준으로 오늘의 운세(데일리)와 종합 운세를 제공합니다. 태어난 시각·장소로 계산한 천체 위치에 고전 점성술 해석 규칙을 적용해, 시기별 흐름과 주의할 구간을 텍스트로 안내합니다.",
    ogType: "website",
  },
  faq: {
    path: "/faq",
    titleKey: "faq.seo_title",
    description: FAQ_PAGE_DESCRIPTION,
    ogType: "website",
  },
  terms: {
    path: "/terms",
    title: "이용약관 | 진짜미래",
    description:
      "진짜미래 서비스 이용약관입니다. 운세 교환권(망원경·나침반·탐사선)의 구매와 이용, 청약철회와 환불, 교환권의 유효기간과 소멸, AI 서비스의 특성과 면책, 회원의 의무를 조항별로 안내합니다.",
    ogType: "website",
  },
  privacy: {
    path: "/privacy-policy",
    title: "개인정보처리방침 | 진짜미래",
    description:
      "진짜미래 개인정보처리방침입니다. 출생 정보를 포함한 수집 항목과 이용 목적, 보유·이용 기간, 제3자 제공과 국외 이전, 파기 절차, 이용자의 권리 행사 방법과 개인정보 보호책임자를 안내합니다.",
    ogType: "website",
  },
  contact: {
    path: "/contact",
    title: "문의하기 | 진짜미래 고객센터",
    description:
      "진짜미래 고객센터 문의 페이지입니다. 답변 받을 이메일과 제목, 문의 내용을 남기면 운영자가 확인 후 회신합니다. 결제·리포트·계정 관련 문의를 접수합니다.",
    ogType: "website",
  },
});


/** i18n 키가 있으면 t()로, 없으면 리터럴로 해석한다 (t 는 i18n 의 t 또는 프리렌더의 ko.json 조회 함수) */
export function resolvePageSeo(key, t) {
  const cfg = PAGE_SEO[key];
  if (!cfg) throw new Error(`unknown PAGE_SEO key: ${key}`);
  const title = cfg.titleKey && typeof t === "function" ? t(cfg.titleKey) : cfg.title;
  const description =
    cfg.descriptionKey && typeof t === "function" ? t(cfg.descriptionKey) : cfg.description;
  return {
    ...cfg,
    title: title || cfg.title || PAGE_SEO.home.title,
    description: description || cfg.description || SITE_DESCRIPTION,
    canonical: absoluteUrl(cfg.path),
  };
}
