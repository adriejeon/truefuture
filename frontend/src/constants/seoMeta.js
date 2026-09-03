/** SEO/GEO 메타 기본값 및 점성술 페이지용 상수 */

const SITE_ORIGIN = "https://truefuture.kr";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/1200x630.png`;

/** 앱 기본(폴백) 메타 - index.html과 동기화용 */
export const DEFAULT_META = {
  siteName: "진짜미래",
  title: "진짜미래 | 1:1 맞춤형 정통 고전 점성술 AI 상담소",
  description:
    "출생 시각과 출생지를 기반으로 고전 점성술 출생 차트를 계산하고, 자유 질문 상담·궁합·연간 운세·10년 상세 리포트를 제공하는 비대면 AI 점성술 서비스입니다.",
  keywords:
    "점성술, 서양 점성술, 정통 점성술, 고전 점성술, 진짜미래, 점성학, 운세, 사주, 금전운, 재물운, 직업운, 연애운, 재회운, 자녀운, 건강운, 신년운세, 별자리, 별자리 운세",
  ogImage: DEFAULT_OG_IMAGE,
};

/** GNB 로고 등 소형 브랜드 마크용 — 짧은 팩트 문구(키워드 스터핑 완화) */
export const BRAND_LOGO_ALT_KO =
  "진짜미래 로고: 정통 고전 점성술 AI 서비스";

export const BRAND_LOGO_ALT_EN =
  "True Future logo: classical Western astrology AI service";

/**
 * 히어로 그래픽·환영 모달·og:image 대체 텍스트용 — meta·JSON-LD와 키워드 정합(GEO 3-Way).
 * 로고에는 BRAND_LOGO_ALT_* / getBrandLogoAlt 사용.
 */
export const BRAND_HERO_IMAGE_ALT_KO =
  "진짜미래: 정통 고전 점성술 기반 AI 출생 차트(Natal Chart) 분석 — 자유 질문 상담·궁합·연간 운세·10년 상세 리포트";

export const BRAND_HERO_IMAGE_ALT_EN =
  "True Future: classical Western astrology, AI-assisted natal chart analysis, free-form question consultations, compatibility, yearly fortune and a 10-year written report";

/** @deprecated 히어로용 상수명 — BRAND_HERO_IMAGE_ALT_KO 사용 권장 */
export const BRAND_IMAGE_ALT_KO = BRAND_HERO_IMAGE_ALT_KO;

/** @deprecated 히어로용 상수명 — BRAND_HERO_IMAGE_ALT_EN 사용 권장 */
export const BRAND_IMAGE_ALT_EN = BRAND_HERO_IMAGE_ALT_EN;

/** 히어로·환영 모달·공유 이미지 메타 alt */
export function getBrandHeroImageAlt(language) {
  return typeof language === "string" && language.toLowerCase().startsWith("en")
    ? BRAND_HERO_IMAGE_ALT_EN
    : BRAND_HERO_IMAGE_ALT_KO;
}

/** @param {string | undefined} language i18n.language */
export function getBrandImageAlt(language) {
  return getBrandHeroImageAlt(language);
}

/** GNB 로고 alt */
export function getBrandLogoAlt(language) {
  return typeof language === "string" && language.toLowerCase().startsWith("en")
    ? BRAND_LOGO_ALT_EN
    : BRAND_LOGO_ALT_KO;
}

export { SITE_ORIGIN, DEFAULT_OG_IMAGE };
