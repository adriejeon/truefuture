/** SEO/GEO 메타 기본값 및 점성술 페이지용 상수 */

const SITE_ORIGIN = "https://truefuture.kr";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/1200x630.png`;

/** 앱 기본(폴백) 메타 - index.html과 동기화용 */
export const DEFAULT_META = {
  title: "진짜미래 | 더 나은 미래를 위한 운명 컨설팅",
  description:
    "운명에 끌려가지 마세요. 점성학 정밀 분석을 통해 미래의 흐름을 읽고, 더 나은 내일을 위한 확실한 전략을 제시합니다. 단순한 운세 풀이가 아닌, 삶을 변화시키는 운명 컨설팅 '진짜미래'를 지금 경험하세요.",
  keywords:
    "진짜미래, 점성학, 점성술, 운세, 타로, 사주, 별자리, 연애운, 금전운, 직장운, 결혼운, 자녀운, 건강운, 신년운세",
  ogImage: DEFAULT_OG_IMAGE,
};

/** 점성술/운세 결과 페이지 전용 메타 (동적 canonical/og:url과 함께 사용) */
export const ASTROLOGY_PAGE_META = {
  title: "진짜미래 정통 고전 점성술 | 더 나은 미래를 위한 운명 컨설팅",
  description:
    "정통 고전 점성술로 내 운명의 진짜 흐름을 찾고 계신가요? 서양 점성술의 깊이 있는 원리와 수천 년 검증된 천체 운행 데이터를 바탕으로 더 나은 미래를 위한 확실한 운명 컨설팅을 진짜미래에서 경험하세요.",
  keywords:
    "점성술, 고전 점성술, 서양 점성술, 점성술 원리, 진짜미래 점성술, 별자리 운세",
  ogImage: DEFAULT_OG_IMAGE,
};

export { SITE_ORIGIN, DEFAULT_OG_IMAGE };
