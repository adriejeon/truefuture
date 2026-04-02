/** SEO/GEO 메타 기본값 및 점성술 페이지용 상수 */

const SITE_ORIGIN = "https://truefuture.kr";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/1200x630.png`;

/** 앱 기본(폴백) 메타 - index.html과 동기화용 */
export const DEFAULT_META = {
  title: "진짜미래 | 정통 고전 점성술 · 출생 차트 분석",
  description:
    "진짜미래는 정통 고전 점성술과 출생 차트(Natal Chart) 자동 계산을 제공하는 웹 서비스입니다. 수천 년 검증된 천체 운행 데이터와 20년 경력 점성술 전문가 해석 로직을 활용하며, 자유 질문·궁합·연간 운세 등을 지원합니다. 300회 이상의 리뷰를 참고할 수 있습니다.",
  keywords:
    "점성술, 서양 점성술, 정통 점성술, 고전 점성술, 진짜미래, 점성학, 운세, 사주, 금전운, 재물운, 직업운, 연애운, 재회운, 자녀운, 건강운, 신년운세, 별자리, 별자리 운세",
  ogImage: DEFAULT_OG_IMAGE,
};

/** 점성술/운세 결과 페이지 전용 메타 (동적 canonical/og:url과 함께 사용) */
export const ASTROLOGY_PAGE_META = {
  title: "정통 점성술 컨설팅: 진짜미래",
  description:
    "정통 고전 점성술 원리와 수천 년 검증된 천체 운행 데이터를 사용합니다. 태어난 시각·장소 기준 출생 차트(Natal Chart) 자동 계산과, 20년 경력 점성술 전문가 해석 로직을 AI로 구현한 서비스입니다. 자유 질문·궁합·데일리 운세 등 텍스트 질의에 맞춘 분석을 제공합니다.",
  keywords:
    "점성술, 서양 점성술, 정통 점성술, 고전 점성술, 진짜미래, 점성학, 운세, 사주, 금전운, 재물운, 직업운, 연애운, 재회운, 자녀운, 건강운, 신년운세, 별자리, 별자리 운세",
  ogImage: DEFAULT_OG_IMAGE,
};

export { SITE_ORIGIN, DEFAULT_OG_IMAGE };
