import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import StarRating from "./StarRating";
import {
  fetchMyReviewForTarget,
  submitReview,
} from "../services/reviewService";
import {
  REVIEW_CONTENT_MAX,
  REVIEW_CONTENT_MIN,
  REVIEW_NICKNAME_MAX,
  REVIEW_SERVICES,
} from "../constants/reviewServices";
import { colors } from "../constants/colors";

const DISMISS_PREFIX = "tf_review_dismissed_";

function readDismissed(key) {
  try {
    return sessionStorage.getItem(DISMISS_PREFIX + key) === "1";
  } catch (_) {
    return false;
  }
}
function writeDismissed(key) {
  try {
    sessionStorage.setItem(DISMISS_PREFIX + key, "1");
  } catch (_) {
    /* noop */
  }
}

/** 소셜 로그인 이름/이메일에서 '달리***' 형태의 기본 표시 이름 생성 */
function defaultNickname(user) {
  const meta = user?.user_metadata || {};
  const raw =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    (typeof meta.nickname === "string" && meta.nickname.trim()) ||
    (typeof user?.email === "string" && user.email.split("@")[0]) ||
    "";
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return "";
  const head = Array.from(cleaned).slice(0, 2).join("");
  return `${head}***`;
}

/**
 * 결과 화면 하단에 붙는 후기 작성 카드.
 * - 결과를 다 본 로그인 사용자에게만 노출 ("결과는 어떠셨나요?")
 * - 별점을 누르면 텍스트 입력이 펼쳐지는 2단계 구조 (강요하지 않는 UX)
 * - 이미 이 결과에 후기를 남겼으면 상태 안내만 표시
 * - "다음에" 누르면 세션 동안 이 결과에 대해 숨김
 *
 * @param {{ service: string, resultId?: string|null, reportId?: string|null, className?: string }} props
 */
export default function ReviewPrompt({ service, resultId = null, reportId = null, className = "" }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const isReport = service === "report";
  const targetId = isReport ? reportId : resultId;
  const dismissKey = targetId ? `${service}_${targetId}` : null;

  const [existing, setExisting] = useState(null);
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const canRender = Boolean(user?.id && targetId && REVIEW_SERVICES.includes(service));

  // 대상(결과)이 바뀌면 폼 초기화 + 기존 후기 여부 조회
  useEffect(() => {
    setRating(0);
    setContent("");
    setError("");
    setSubmitted(false);
    setExisting(null);
    setChecked(false);
    setDismissed(dismissKey ? readDismissed(dismissKey) : false);
    if (!canRender) return;

    let cancelled = false;
    fetchMyReviewForTarget(isReport ? { reportId: targetId } : { resultId: targetId })
      .then((row) => {
        if (!cancelled) setExisting(row);
      })
      .catch((err) => {
        console.warn("기존 후기 조회 실패:", err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRender, service, targetId, user?.id]);

  // 로그인 계정이 바뀔 때만 기본 표시 이름을 채움 (사용자가 지운 값을 되살리지 않도록)
  useEffect(() => {
    setNickname(user ? defaultNickname(user) : "");
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const trimmedLen = useMemo(() => content.trim().length, [content]);
  const contentTooShort = trimmedLen < REVIEW_CONTENT_MIN;

  if (!canRender || !checked || dismissed) return null;

  const cardClass =
    "font-noto rounded-xl p-5 sm:p-6 bg-[#1E1E3A]/90 border border-[#2A2A4A]/80 shadow-lg";

  // 이미 후기를 남긴 결과 → 상태 안내
  if (existing || submitted) {
    const status = existing?.status || "pending";
    const desc =
      submitted || status === "pending"
        ? t("reviews.thanks_desc")
        : status === "published"
          ? t("reviews.already_published")
          : t("reviews.already_hidden");
    return (
      <section className={`${cardClass} ${className}`} aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden="true">🙏</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-[15px]">
              {submitted ? t("reviews.thanks_title") : t("reviews.already_title")}
            </p>
            <p className="mt-1 text-sm text-[#9CA3B8] leading-relaxed">{desc}</p>
            {(existing?.rating || rating) ? (
              <StarRating value={existing?.rating || rating} size={13} className="mt-2" />
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const handleDismiss = () => {
    if (dismissKey) writeDismissed(dismissKey);
    setDismissed(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!rating) {
      setError(t("reviews.error_rating"));
      return;
    }
    if (contentTooShort) {
      setError(t("reviews.error_content_short", { min: REVIEW_CONTENT_MIN }));
      return;
    }
    const name = nickname.trim() || defaultNickname(user) || t("reviews.anonymous");
    setSubmitting(true);
    try {
      await submitReview({
        userId: user.id,
        service,
        rating,
        content,
        displayName: name.slice(0, REVIEW_NICKNAME_MAX),
        resultId,
        reportId,
        language: i18n.language,
      });
      setSubmitted(true);
    } catch (err) {
      const code = err?.reviewCode;
      if (code === "duplicate") {
        // 다른 탭/기기에서 이미 남긴 경우 → 안내 상태로 전환
        setExisting({ status: "pending", rating });
      } else if (code === "rate_limit") {
        setError(t("reviews.error_rate_limit"));
      } else if (code === "auth") {
        setError(t("reviews.login_required"));
      } else {
        console.error("후기 등록 실패:", err);
        setError(t("reviews.error_generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={`${cardClass} ${className}`} aria-labelledby="review-prompt-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="review-prompt-title" className="text-white font-medium text-[16px] leading-snug">
            {t("reviews.prompt_title")}
          </h3>
          <p className="mt-1 text-sm text-[#9CA3B8] leading-relaxed">
            {t("reviews.prompt_subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 -mr-2 -mt-1 px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {t("reviews.prompt_later")}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <StarRating
          interactive
          value={rating}
          onChange={(v) => {
            setRating(v);
            setError("");
          }}
          size={28}
          ariaLabel={t("reviews.rating_aria")}
        />
        <span className="text-sm min-w-[4.5rem]" style={{ color: colors.primary }}>
          {rating ? t(`reviews.rating_${rating}`) : ""}
        </span>
      </div>

      {rating > 0 && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="review-content" className="block text-sm font-medium text-slate-300 mb-2">
              {t("reviews.content_label")}
            </label>
            <textarea
              id="review-content"
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, REVIEW_CONTENT_MAX))}
              placeholder={t("reviews.content_placeholder", { min: REVIEW_CONTENT_MIN })}
              rows={4}
              maxLength={REVIEW_CONTENT_MAX}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white text-[15px] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
            <div className="flex justify-end mt-1">
              <span className={`text-xs ${contentTooShort && trimmedLen > 0 ? "text-amber-400" : "text-slate-400"}`}>
                {trimmedLen}/{REVIEW_CONTENT_MAX}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="review-nickname" className="block text-sm font-medium text-slate-300 mb-2">
              {t("reviews.nickname_label")}
            </label>
            <input
              id="review-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, REVIEW_NICKNAME_MAX))}
              maxLength={REVIEW_NICKNAME_MAX}
              autoComplete="off"
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-lg text-white text-[15px] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="mt-1.5 text-xs text-slate-400">{t("reviews.nickname_hint")}</p>
          </div>

          {error && (
            <p className="text-sm text-red-300 bg-red-900/30 border border-red-700/60 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || contentTooShort}
            className="w-full py-3 rounded-lg text-[15px] font-semibold text-black transition-opacity disabled:opacity-50 touch-manipulation"
            style={{ backgroundColor: colors.primary }}
          >
            {submitting ? t("reviews.submitting") : t("reviews.submit")}
          </button>
          <p className="text-center text-xs text-slate-500">{t("reviews.moderation_notice")}</p>
        </form>
      )}
    </section>
  );
}
