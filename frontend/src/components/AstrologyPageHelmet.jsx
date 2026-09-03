import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import i18n from "../i18n";
import {
  ASTROLOGY_PAGE_META,
  SITE_ORIGIN,
  getBrandImageAlt,
} from "../constants/seoMeta";
import { ASTROLOGY_PRODUCT_JSON_LD } from "../constants/packageOffers";
import { useJsonLd } from "../hooks/useJsonLd";

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

  // Product JSON-LD (평점 없는 기본형). 홈은 같은 개체에 후기 평점을 얹어 내보낸다
  useJsonLd(JSON_LD_SCRIPT_ID, ASTROLOGY_PRODUCT_JSON_LD);

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
