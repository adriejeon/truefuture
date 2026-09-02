import { useTranslation } from "react-i18next";
import StarRating from "./StarRating";
import { PAID_PRODUCT_SERVICES, reviewServiceLabelKey } from "../constants/reviewServices";

/** 후기 카드 하단 라벨: 이용/구매 인증 · 재구매 고객(이관) · 서비스명 */
export function reviewBadges(review, t) {
  const badges = [];
  if (review.source === "imported") {
    badges.push({ key: "imported", text: t("reviews.badge_imported") });
  } else if (review.is_verified) {
    badges.push({
      key: "verified",
      text: PAID_PRODUCT_SERVICES.includes(review.service)
        ? t("reviews.badge_verified_buyer")
        : t("reviews.badge_verified_user"),
    });
  }
  const labelKey = reviewServiceLabelKey(review.service);
  if (labelKey) badges.push({ key: "service", text: t(labelKey), muted: true });
  return badges;
}

export function ReviewCard({ review, className = "" }) {
  const { t } = useTranslation();
  const badges = reviewBadges(review, t);
  return (
    <blockquote
      className={`font-noto text-left rounded-xl p-[clamp(18px,4vw,24px)] bg-[#1E1E3A]/90 border border-[#2A2A4A]/80 shadow-lg ${className}`}
    >
      <p className="flex items-center gap-1.5 mb-3 text-primary">
        <StarRating value={review.rating} size={14} ariaLabel={t("reviews.rating_label", { rating: review.rating })} />
        <span className="text-[clamp(12px,2.8vw,14px)] font-medium text-primary/95">
          {Number(review.rating).toFixed(1)}
        </span>
      </p>
      <p className="text-[#F5F0E8] text-[clamp(14px,3.2vw,16px)] font-light leading-[1.65] tracking-[-0.01em] whitespace-pre-line break-words">
        &ldquo;{review.content}&rdquo;
      </p>
      <footer className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[clamp(12px,2.8vw,14px)]">
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

/**
 * 공개 후기 목록 (메인·서비스별 랜딩 공용).
 * 데이터는 usePublishedReviews 로 가져와 넘긴다.
 */
export default function ReviewList({ reviews = [], summary = null, className = "" }) {
  const { t } = useTranslation();
  if (!reviews.length) return null;
  return (
    <div className={`flex flex-col gap-[clamp(16px,3.5vw,22px)] w-full ${className}`}>
      {summary && summary.count > 0 && (
        <p className="text-center font-noto text-[clamp(12px,3vw,14px)] text-[#9CA3B8] -mt-2">
          {t("reviews.summary", { count: summary.count, avg: summary.avg.toFixed(1) })}
        </p>
      )}
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </div>
  );
}
