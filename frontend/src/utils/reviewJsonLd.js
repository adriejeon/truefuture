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

/**
 * 구글 리뷰 스니펫이 aggregateRating/review 를 인정하는 개체 유형(itemReviewed 허용 목록).
 * https://developers.google.com/search/docs/appearance/structured-data/review-snippet
 * Service 는 없다 — 목록 밖 유형에 평점을 달면 서치 콘솔에
 * "입력란의 개체 유형이 잘못되었습니다" 오류가 나고 리치 결과에서 제외된다(2026-09-07 실제 통지).
 */
export const REVIEWABLE_TYPES = Object.freeze([
  "Book",
  "Course",
  "CreativeWorkSeason",
  "CreativeWorkSeries",
  "Episode",
  "Event",
  "Game",
  "HowTo",
  "LocalBusiness",
  "MediaObject",
  "Movie",
  "MusicPlaylist",
  "MusicRecording",
  "Organization",
  "Product",
  "Recipe",
  "SoftwareApplication",
]);

/**
 * 허용 목록에 있어도 이 사이트에서는 쓰지 않는 유형.
 * 후기를 운영자가 직접 수집·검수하므로 Organization/LocalBusiness 에 평점을 달면
 * 구글 self-serving 리뷰 정책에 걸려 별점 부적격이 된다.
 */
export const SELF_SERVING_TYPES = Object.freeze(["Organization", "LocalBusiness"]);

/**
 * 평점을 얹을 노드의 @type 검증. 어긋나면 throw —
 * 프리렌더(scripts/prerender-pages.js)가 같은 빌더를 호출하므로 잘못된 유형은 빌드 단계에서 배포가 막힌다.
 */
export function assertReviewable(base) {
  const types = [].concat(base?.["@type"] ?? []).map(String);
  if (!types.some((t) => REVIEWABLE_TYPES.includes(t))) {
    throw new Error(
      `[reviewJsonLd] aggregateRating/review 는 ${REVIEWABLE_TYPES.join("/")} 유형에만 붙일 수 있습니다. 받은 @type: ${types.join(",") || "(없음)"}`
    );
  }
  if (types.some((t) => SELF_SERVING_TYPES.includes(t))) {
    throw new Error(
      `[reviewJsonLd] ${types.join(",")} 에는 평점을 달지 않습니다(구글 self-serving 리뷰 정책). Product 등 다른 유형을 쓰세요.`
    );
  }
}

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
  // 후기 유무와 무관하게 먼저 검사한다 — 빌드 시점에 후기를 못 받아도 유형 오류는 잡혀야 한다.
  assertReviewable(base);
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
