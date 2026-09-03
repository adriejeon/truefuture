import { Helmet } from "react-helmet-async";
import { useJsonLd } from "../hooks/useJsonLd";
import { BRAND_NAME, DEFAULT_OG_IMAGE, absoluteUrl } from "../constants/siteSeo";
import { buildGraph } from "../utils/pageJsonLd";

/**
 * 페이지 SEO 단일 창구.
 * title/description/canonical/OG/Twitter 를 한 세트로만 렌더하고,
 * 페이지 JSON-LD 는 항상 같은 id 의 script 하나로만 넣는다.
 *
 * · 정적/프리렌더 HTML 의 같은 태그에는 data-rh="true" 가 붙어 있어 마운트 시 Helmet 이 인계한다
 *   → hydration 후 title/description/canonical/OG 가 두 벌로 남지 않는다.
 * · JSON-LD 는 프리렌더 HTML 과 동일한 id(PAGE_JSON_LD_ID)를 사용해 교체된다.
 * · nodes 를 주지 않으면 JSON-LD 를 건드리지 않는다(앱 전역 기본 SEO 용).
 * · 색인 제외(noindex)는 hooks/useNoIndex 가 담당한다 — 로그인 뒤 화면·결제 중간 화면에서 쓴다.
 */
export const PAGE_JSON_LD_ID = "page-ld-json";

function PageSeo({
  path,
  title,
  description,
  ogType = "website",
  ogImage = DEFAULT_OG_IMAGE,
  imageAlt = null,
  keywords = null,
  locale = "ko_KR",
  nodes = null,
}) {
  const canonical = absoluteUrl(path);
  const hasNodes = Array.isArray(nodes) && nodes.filter(Boolean).length > 0;
  useJsonLd(hasNodes ? PAGE_JSON_LD_ID : null, hasNodes ? buildGraph(nodes) : null);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords ? <meta name="keywords" content={keywords} /> : null}
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={BRAND_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      {imageAlt ? <meta property="og:image:alt" content={imageAlt} /> : null}
      <meta property="og:locale" content={locale} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={canonical} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {imageAlt ? <meta name="twitter:image:alt" content={imageAlt} /> : null}
    </Helmet>
  );
}

export default PageSeo;
