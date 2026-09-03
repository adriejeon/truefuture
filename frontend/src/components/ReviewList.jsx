import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import StarRating from "./StarRating";
import { reviewServiceLabelKey } from "../constants/reviewServices";

// 접힌 상태 본문은 3줄까지. Tailwind JIT 이 클래스를 스캔해야 하므로 line-clamp-3 은 리터럴로 둔다
const CLAMP_LINE_HEIGHT = 1.65;
const CLAMP_LINES = 3;

/**
 * 후기 카드 하단 칩: 재구매 고객 · 이용/구매 인증 · 이용 서비스
 *  - is_repeat  : 작성 시점 누적 이용 2회 이상
 *  - is_verified: 이용/구매 기록과 대조됨 (사이트 작성분은 트리거가, 이관분은 운영자가 확인)
 *  - service    : 어떤 서비스를 이용한 고객의 후기인지
 * 이관 후기도 사이트 작성 후기와 같은 칩 구성으로 보이도록 source 로 구분하지 않는다.
 */
export function reviewBadges(review, t) {
  const badges = [];
  if (review.is_repeat) {
    badges.push({ key: "repeat", text: t("reviews.badge_repeat") });
  }
  if (review.is_verified) {
    // 상품 종류와 무관하게 같은 문구로 통일 (어떤 상품인지는 서비스 칩이 보여준다)
    badges.push({ key: "verified", text: t("reviews.badge_verified_user") });
  }
  const labelKey = reviewServiceLabelKey(review.service);
  if (labelKey) badges.push({ key: "service", text: t("reviews.badge_service_used", { service: t(labelKey) }), muted: true });
  return badges;
}

/**
 * 후기 카드.
 * 본문은 기본 3줄까지만 보이고(넘치면 '모두 보기'), 펼치기는 이 카드에만 적용된다.
 * 캐러셀 트랙이 items-start 이므로 한 장을 펼쳐도 다른 카드 높이는 그대로다.
 */
export function ReviewCard({ review, className = "" }) {
  const { t } = useTranslation();
  const badges = reviewBadges(review, t);
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // 접힌 상태에서만 실제 넘침을 측정한다. 펼친 뒤에는 scrollHeight == clientHeight 가 되어
  // 다시 재면 버튼이 사라지므로 측정을 건너뛴다. (글꼴이 clamp() 라 리사이즈도 관찰)
  useLayoutEffect(() => {
    if (expanded) return undefined;
    const el = textRef.current;
    if (!el) return undefined;
    const measure = () => setOverflowing(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, review.content]);

  return (
    <blockquote
      className={`font-noto text-left flex flex-col rounded-2xl p-[clamp(18px,4vw,22px)] bg-[#1E1E3A]/90 border border-[#2A2A4A]/80 shadow-lg ${className}`}
    >
      <p className="flex items-center gap-1.5 mb-3 text-primary">
        <StarRating value={review.rating} size={14} ariaLabel={t("reviews.rating_label", { rating: review.rating })} />
        <span className="text-[clamp(12px,2.8vw,14px)] font-medium text-primary/95">
          {Number(review.rating).toFixed(1)}
        </span>
      </p>
      <p
        ref={textRef}
        className={`flex-1 text-[#F5F0E8] text-[clamp(14px,3.2vw,15px)] font-light leading-[1.65] tracking-[-0.01em] whitespace-pre-line break-words ${
          expanded ? "" : "line-clamp-3"
        }`}
        // 짧은 후기도 카드 높이가 들쭉날쭉하지 않도록 접힌 상태의 최소 높이를 3줄로 맞춘다
        style={expanded ? undefined : { minHeight: `calc(${CLAMP_LINE_HEIGHT}em * ${CLAMP_LINES})` }}
      >
        &ldquo;{review.content}&rdquo;
      </p>
      {/* 3줄 안에 들어가는 후기도 자리(invisible)를 남겨 카드 높이가 들쭉날쭉해지지 않게 한다 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-hidden={!(overflowing || expanded)}
        tabIndex={overflowing || expanded ? 0 : -1}
        className={`self-start mt-2 text-[clamp(12px,2.8vw,13px)] font-medium text-primary/90 hover:text-primary underline underline-offset-2 decoration-primary/40 transition-colors ${
          overflowing || expanded ? "" : "invisible pointer-events-none"
        }`}
      >
        {t(expanded ? "reviews.collapse" : "reviews.expand")}
      </button>
      <footer className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[clamp(12px,2.8vw,14px)]">
        <span className="text-primary/95 font-medium">{review.display_name}</span>
        {badges.map((b) => (
          <span
            key={b.key}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-[1.4] border ${
              b.muted
                ? "border-[#3A3A5C] text-[#9CA3B8]"
                : "border-primary/40 text-primary/90 bg-primary/10"
            }`}
          >
            {b.text}
          </span>
        ))}
      </footer>
    </blockquote>
  );
}

function ArrowButton({ direction, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full border border-[#3A3A5C] bg-[#1E1E3A]/90 text-slate-300 hover:text-white hover:border-primary/60 transition-colors disabled:opacity-30 disabled:hover:border-[#3A3A5C] disabled:hover:text-slate-300"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={direction === "prev" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
        />
      </svg>
    </button>
  );
}

/** 점 인디케이터는 후기가 적을 때만. 많아지면 'n / 전체' 카운터로 대체한다 */
const MAX_DOTS = 8;

/**
 * 공개 후기 카드 캐러셀 (메인·서비스별 랜딩 공용).
 * - 가로 스크롤 + 스냅. 모바일은 손가락 스와이프, 데스크톱은 좌우 버튼/트랙패드.
 * - 끝에 가까워지면 onLoadMore 로 다음 페이지를 이어붙여 공개 후기를 전부 볼 수 있다(무한 가로 스크롤).
 * - 카드 폭 고정, 다음 카드가 살짝 보이도록 컨테이너 좌우 여백은 부모 px-4 를 음수 마진으로 상쇄.
 * 데이터는 usePublishedReviews 로 가져와 넘긴다.
 */
export default function ReviewList({
  reviews = [],
  summary = null,
  hasMore = false,
  loadingMore = false,
  onLoadMore = null,
  className = "",
}) {
  const { t } = useTranslation();
  const scrollerRef = useRef(null);
  const [active, setActive] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // 스크롤 핸들러가 매번 새 콜백을 붙잡지 않도록 최신 값을 ref 로 들고 있는다
  const loadMoreRef = useRef(null);
  loadMoreRef.current = hasMore && !loadingMore ? onLoadMore : null;

  const updateState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
    const first = el.firstElementChild;
    if (first) {
      const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || "0");
      if (step > 0) setActive(Math.min(reviews.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
    }
    // 남은 스크롤이 한 화면 이하로 줄면 다음 페이지를 미리 불러온다.
    // (아직 넘치지 않는 경우 max <= 0 이므로 첫 렌더에서도 바로 채워진다)
    if (el.scrollLeft >= max - el.clientWidth) loadMoreRef.current?.();
  }, [reviews.length]);

  useEffect(() => {
    updateState();
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onResize = () => updateState();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateState]);

  const scrollByCard = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const first = el.firstElementChild;
    const step = first ? first.offsetWidth + 12 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const scrollToIndex = (idx) => {
    const el = scrollerRef.current;
    const card = el?.children?.[idx];
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  if (!reviews.length) return null;

  const total = Math.max(reviews.length, Number(summary?.count) || 0);
  const showDots = !hasMore && reviews.length <= MAX_DOTS;

  return (
    <div className={`w-full ${className}`}>
      {summary && summary.count > 0 && (
        <p className="text-center font-noto text-[clamp(12px,3vw,14px)] text-[#9CA3B8] mb-4 -mt-1">
          {t("reviews.summary", { count: summary.count, avg: summary.avg.toFixed(1) })}
        </p>
      )}

      {/* 부모 컨테이너(px-4)를 음수 마진으로 상쇄해 카드가 화면 가장자리까지 흐르도록 */}
      <div className="-mx-4">
        <div
          ref={scrollerRef}
          onScroll={updateState}
          className="chip-scrollbar-hide flex items-start gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-1 scroll-smooth"
          style={{ WebkitOverflowScrolling: "touch", scrollPaddingLeft: "1rem", scrollPaddingRight: "1rem" }}
          aria-label={t("reviews.carousel_aria")}
        >
          {reviews.map((r) => (
            <div
              key={r.id}
              className="snap-start shrink-0 w-[min(82vw,320px)] flex"
            >
              <ReviewCard review={r} className="w-full" />
            </div>
          ))}
          {hasMore && (
            <div
              className="shrink-0 w-[min(40vw,140px)] flex items-center justify-center py-8 text-[#9CA3B8]"
              aria-hidden="true"
            >
              <span className="w-5 h-5 rounded-full border-2 border-[#3A3A5C] border-t-primary animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* 인디케이터 + 좌우 버튼(데스크톱) */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <ArrowButton direction="prev" onClick={() => scrollByCard(-1)} disabled={!canPrev} label={t("reviews.carousel_prev")} />
        {showDots ? (
          <div className="flex items-center gap-1.5" role="tablist" aria-label={t("reviews.carousel_aria")}>
            {reviews.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`${i + 1} / ${reviews.length}`}
                onClick={() => scrollToIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? "w-5 bg-primary" : "w-1.5 bg-[#3A3A5C] hover:bg-[#55557A]"
                }`}
              />
            ))}
          </div>
        ) : (
          <p className="font-noto text-[clamp(11px,2.6vw,13px)] tabular-nums text-[#9CA3B8]" aria-live="polite">
            <span className="text-primary font-medium">{Math.min(active + 1, total)}</span>
            {" / "}
            {total}
          </p>
        )}
        <ArrowButton direction="next" onClick={() => scrollByCard(1)} disabled={!canNext && !hasMore} label={t("reviews.carousel_next")} />
      </div>
    </div>
  );
}
