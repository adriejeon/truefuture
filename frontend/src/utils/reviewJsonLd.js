/**
 * 공개 후기 → schema.org 구조화 데이터 (AggregateRating / Review).
 * 홈(전체 후기)·리포트 랜딩(리포트 구매 후기)의 Product JSON-LD 에 얹어
 * 검색 리치 결과(별점)·GEO(LLM 인용)에 실제 평점을 노출한다.
 *
 * 원칙
 *  - 마크업은 화면에 보이는 후기 섹션과 같은 데이터(usePublishedReviews 결과)만 쓴다.
 *    섹션이 숨겨지면(후기 0건) 평점·리뷰도 넣지 않는다 — 보이지 않는 평점은 구조화 데이터 가이드 위반.
 *  - 총점·개수는 aggregateRating 이 전달하므로 개별 Review 는 첫 페이지 분량만 싣는다.
 */

export const RATING_BEST = 5;
export const RATING_WORST = 1;
/** JSON-LD 에 싣는 개별 리뷰 상한 (홈 첫 페이지 12건과 맞춤) */
export const MAX_JSON_LD_REVIEWS = 12;

function toIsoDateTime(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** usePublishedReviews 의 summary({count, avg}) → AggregateRating. 후기가 없으면 null */
export function buildAggregateRating(summary) {
  const count = Number(summary?.count) || 0;
  const avg = Number(summary?.avg) || 0;
  if (count <= 0 || avg <= 0) return null;
  return {
    "@type": "AggregateRating",
    ratingValue: Math.round(avg * 10) / 10,
    reviewCount: count,
    ratingCount: count,
    bestRating: RATING_BEST,
    worstRating: RATING_WORST,
  };
}

/** public_reviews 한 행 → Review. 필수값(별점·본문)이 없으면 null */
export function buildReviewJsonLd(review) {
  const rating = Number(review?.rating);
  const body = String(review?.content ?? "").trim();
  if (!Number.isFinite(rating) || !body) return null;
  const node = {
    "@type": "Review",
    // display_name 은 서버가 익명화한 표시명('김** (만 34세)', '달리***')
    author: { "@type": "Person", name: String(review.display_name ?? "").trim() || "익명" },
    reviewBody: body,
    reviewRating: {
      "@type": "Rating",
      ratingValue: rating,
      bestRating: RATING_BEST,
      worstRating: RATING_WORST,
    },
  };
  const date = toIsoDateTime(review.published_at || review.created_at);
  if (date) node.datePublished = date;
  if (review.language) node.inLanguage = review.language;
  return node;
}

/**
 * Product 등 리뷰 대상 노드에 aggregateRating·review 를 붙인 새 객체를 돌려준다.
 * 실을 후기가 없으면 base 를 그대로 반환한다(평점 없는 상품 마크업).
 * summary 를 못 받은 경우(RPC 실패)는 실린 리뷰만으로 평균을 계산한다.
 */
export function withReviewsJsonLd(base, { reviews = [], summary = null, max = MAX_JSON_LD_REVIEWS } = {}) {
  const list = (reviews || []).slice(0, max).map(buildReviewJsonLd).filter(Boolean);
  if (list.length === 0) return base;
  const aggregate =
    buildAggregateRating(summary) ??
    buildAggregateRating({
      count: list.length,
      avg: list.reduce((acc, r) => acc + r.reviewRating.ratingValue, 0) / list.length,
    });
  return { ...base, aggregateRating: aggregate, review: list };
}
