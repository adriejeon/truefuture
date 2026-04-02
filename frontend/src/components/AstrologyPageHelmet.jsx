import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import i18n from "../i18n";
import {
  ASTROLOGY_PAGE_META,
  SITE_ORIGIN,
  getBrandImageAlt,
} from "../constants/seoMeta";

/** 점성술 페이지용 JSON-LD Product 스키마 (GEO/리치 결과용) */
const ASTROLOGY_PRODUCT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "정통 점성술 컨설팅: 진짜미래",
  image: ["https://truefuture.kr/assets/1200x630.png"],
  description:
    "정통 고전 점성술 원리와 수천 년 검증된 천체 운행 데이터를 사용합니다. 태어난 시각·장소 기준 출생 차트(Natal Chart) 자동 계산과, 20년 경력 점성술 전문가 해석 로직을 AI로 구현한 서비스입니다. 자유 질문·궁합·데일리 운세 등 텍스트 질의에 맞춘 분석을 제공합니다. 망원경·나침반·탐사선 단위로 이용권을 구매해 사용합니다.",
  category: "운세 > 서양 점성술",
  brand: {
    "@type": "Brand",
    name: "진짜미래",
  },
  offers: [
    {
      "@type": "Offer",
      name: "망원경 1개",
      priceCurrency: "KRW",
      price: "1000",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "망원경 3개",
      priceCurrency: "KRW",
      price: "2900",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "망원경 5개",
      priceCurrency: "KRW",
      price: "4950",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "나침반 7개",
      priceCurrency: "KRW",
      price: "1900",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "나침반 14개",
      priceCurrency: "KRW",
      price: "3500",
      availability: "https://schema.org/InStock",
    },
  ],
};

const JSON_LD_SCRIPT_ID = "astrology-product-ld-json";

/**
 * 점성술/운세 결과 페이지 전용 SEO 메타.
 * og:url / canonical은 현재 라우트 기준으로 동적 할당 (프로덕션 도메인 사용).
 * JSON-LD는 react-helmet-async가 script 본문을 head에 넣지 않는 이슈가 있어
 * useEffect로 document.head에 직접 삽입/제거하여 확실히 렌더되도록 함.
 */
function AstrologyPageHelmet() {
  const location = useLocation();
  const canonicalUrl = `${SITE_ORIGIN}${location.pathname}`;
  const { title, description, keywords, ogImage } = ASTROLOGY_PAGE_META;
  const shareImageAlt = getBrandImageAlt(i18n.language);

  useEffect(() => {
    const existing = document.getElementById(JSON_LD_SCRIPT_ID);
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = JSON_LD_SCRIPT_ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(ASTROLOGY_PRODUCT_JSON_LD);
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById(JSON_LD_SCRIPT_ID);
      if (el) el.remove();
    };
  }, [location.pathname]);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={shareImageAlt} />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={shareImageAlt} />
    </Helmet>
  );
}

export default AstrologyPageHelmet;
