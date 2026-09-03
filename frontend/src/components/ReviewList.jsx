import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import StarRating from "./StarRating";
import { reviewServiceLabelKey } from "../constants/reviewServices";

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

export function ReviewCard({ review, className = "" }) {
  const { t } = useTranslation();
  const badges = reviewBadges(review, t);
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
      <p className="flex-1 text-[#F5F0E8] text-[clamp(14px,3.2vw,15px)] font-light leading-[1.65] tracking-[-0.01em] whitespace-pre-line break-words">
        &ldquo;{review.content}&rdquo;
      </p>
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

/**
 * 공개 후기 카드 캐러셀 (메인·서비스별 랜딩 공용).
 * - 가로 스크롤 + 스냅. 모바일은 손가락 스와이프, 데스크톱은 좌우 버튼/트랙패드.
 * - 카드 폭 고정, 다음 카드가 살짝 보이도록 컨테이너 좌우 여백은 부모 px-4 를 음수 마진으로 상쇄.
 * 데이터는 usePublishedReviews 로 가져와 넘긴다.
 */
export default function ReviewList({ reviews = [], summary = null, className = "" }) {
  const { t } = useTranslation();
  const scrollerRef = useRef(null);
  const [active, setActive] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

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
          className="chip-scrollbar-hide flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-1 scroll-smooth"
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
        </div>
      </div>

      {/* 인디케이터 + 좌우 버튼(데스크톱) */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <ArrowButton direction="prev" onClick={() => scrollByCard(-1)} disabled={!canPrev} label={t("reviews.carousel_prev")} />
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
        <ArrowButton direction="next" onClick={() => scrollByCard(1)} disabled={!canNext} label={t("reviews.carousel_next")} />
      </div>
    </div>
  );
}
