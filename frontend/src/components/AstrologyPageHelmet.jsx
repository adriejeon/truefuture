import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { ASTROLOGY_PAGE_META, SITE_ORIGIN } from "../constants/seoMeta";

/** 점성술 페이지용 JSON-LD Product 스키마 (GEO/리치 결과용) */
const ASTROLOGY_PRODUCT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "진짜미래 정통 고전 점성술 분석",
  description:
    "정통 고전 점성술로 내 운명의 진짜 흐름을 찾고 계신가요? 단순한 별자리 풀이를 넘어 서양 점성술의 깊이 있는 원리로 삶의 방향을 명확히 알고 싶을 때, 진짜미래는 수천 년간 검증된 천체 운행 데이터를 바탕으로 당신만의 정확한 인생 지도를 그려드립니다. 이미 수백 명의 내담자가 실제 상담을 통해 소름 돋는 정확도를 증명했으며, 태어난 시간과 장소에 맞춘 고전 점성술의 정교한 연산 알고리즘을 통해 가장 확실한 해답을 제공합니다.",
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

/**
 * 점성술/운세 결과 페이지 전용 SEO 메타.
 * og:url / canonical은 현재 라우트 기준으로 동적 할당 (프로덕션 도메인 사용).
 * JSON-LD Product 스키마를 head에 동적 삽입하여 GEO/리치 결과 노출을 지원.
 */
function AstrologyPageHelmet() {
  const location = useLocation();
  const canonicalUrl = `${SITE_ORIGIN}${location.pathname}`;
  const { title, description, keywords, ogImage } = ASTROLOGY_PAGE_META;

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
      <meta property="og:image:alt" content={title} />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={title} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(ASTROLOGY_PRODUCT_JSON_LD),
        }}
      />
    </Helmet>
  );
}

export default AstrologyPageHelmet;
