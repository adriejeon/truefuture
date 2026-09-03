import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useNoIndex from "../hooks/useNoIndex";
import { useIsAdmin } from "../hooks/useIsAdmin";
import StarRating from "../components/StarRating";
import { deleteReview, fetchReviewsForAdmin, updateReviewStatus } from "../services/reviewService";
import { PAID_PRODUCT_SERVICES, reviewServiceLabelKey } from "../constants/reviewServices";
import { colors } from "../constants/colors";

const TABS = [
  { id: "pending", statuses: ["pending"] },
  { id: "published", statuses: ["published"] },
  { id: "hidden", statuses: ["hidden", "rejected"] },
  { id: "all", statuses: null },
];

const STATUS_STYLE = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  hidden: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  rejected: "bg-red-500/15 text-red-300 border-red-500/40",
};

function formatDateTime(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang?.startsWith("en") ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReviewAdminCard({ review, onChangeStatus, onDelete, busy }) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState(review.admin_note || "");
  useEffect(() => setNote(review.admin_note || ""), [review.admin_note, review.id]);

  const serviceKey = reviewServiceLabelKey(review.service);
  const statusText = t(`reviews.admin.status_${review.status}`);
  const noteDirty = (note || "") !== (review.admin_note || "");

  const act = (status) => onChangeStatus(review.id, status, note);

  return (
    <article className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 sm:p-5">
      {/* 메타 라인 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${STATUS_STYLE[review.status] || STATUS_STYLE.hidden}`}>
          {statusText}
        </span>
        <span className="inline-flex items-center rounded-full border border-slate-600 px-2 py-0.5 text-slate-200">
          {serviceKey ? t(serviceKey) : "—"}
        </span>
        {review.source === "imported" ? (
          <span className="inline-flex items-center rounded-full border border-slate-600 px-2 py-0.5 text-slate-300">
            {t("reviews.admin.source_imported")}
          </span>
        ) : review.is_verified ? (
          <span className="inline-flex items-center rounded-full border px-2 py-0.5" style={{ borderColor: `${colors.primary}66`, color: colors.primary }}>
            {PAID_PRODUCT_SERVICES.includes(review.service)
              ? t("reviews.badge_verified_buyer")
              : t("reviews.admin.verified")}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-red-500/40 px-2 py-0.5 text-red-300">
            {t("reviews.admin.unverified")}
          </span>
        )}
        {review.is_repeat && (
          <span className="inline-flex items-center rounded-full border border-slate-600 px-2 py-0.5 text-slate-200">
            {t("reviews.badge_repeat")}
          </span>
        )}
        {review.source !== "imported" && (
          <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-slate-400">
            {t("reviews.admin.usage_count", { count: review.usage_count ?? 0 })}
          </span>
        )}
        <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-slate-400 uppercase">
          {review.language}
        </span>
        <span className="ml-auto text-slate-400">{formatDateTime(review.created_at, i18n.language)}</span>
      </div>

      {/* 별점 + 이름 */}
      <div className="mt-3 flex items-center gap-2">
        <StarRating value={review.rating} size={14} />
        <span className="text-sm font-medium" style={{ color: colors.primary }}>{review.rating}.0</span>
        <span className="text-sm text-white ml-1">{review.display_name}</span>
      </div>

      {/* 본문 */}
      <p className="mt-2 text-[15px] text-slate-100 leading-relaxed whitespace-pre-line break-words">
        {review.content}
      </p>

      {/* 식별 정보 */}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-slate-500 font-mono break-all">
        <dt>{t("reviews.admin.user_label")}</dt>
        <dd>{review.user_id || "—"}</dd>
        <dt>profile</dt>
        <dd>{review.profile_id || "—"}</dd>
        <dt>result</dt>
        <dd>{review.result_id || "—"}</dd>
        <dt>report</dt>
        <dd>{review.report_id || "—"}</dd>
      </dl>

      {/* 관리 메모 */}
      <div className="mt-3">
        <label className="block text-xs text-slate-400 mb-1" htmlFor={`note-${review.id}`}>
          {t("reviews.admin.note_label")}
        </label>
        <input
          id={`note-${review.id}`}
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("reviews.admin.note_placeholder")}
          className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* 액션 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {review.status !== "published" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("published")}
            className="flex-1 min-w-[6rem] py-2.5 rounded-lg text-sm font-semibold text-black disabled:opacity-50 touch-manipulation"
            style={{ backgroundColor: colors.primary }}
          >
            {t("reviews.admin.action_publish")}
          </button>
        )}
        {review.status !== "hidden" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("hidden")}
            className="flex-1 min-w-[6rem] py-2.5 rounded-lg text-sm font-medium text-slate-200 border border-slate-600 hover:border-slate-400 disabled:opacity-50 touch-manipulation"
          >
            {t("reviews.admin.action_hide")}
          </button>
        )}
        {review.status !== "rejected" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("rejected")}
            className="flex-1 min-w-[6rem] py-2.5 rounded-lg text-sm font-medium text-red-300 border border-red-500/50 hover:border-red-400 disabled:opacity-50 touch-manipulation"
          >
            {t("reviews.admin.action_reject")}
          </button>
        )}
        {review.status !== "pending" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("pending")}
            className="flex-1 min-w-[6rem] py-2.5 rounded-lg text-sm text-slate-400 border border-slate-700 hover:text-white disabled:opacity-50 touch-manipulation"
          >
            {t("reviews.admin.action_pending")}
          </button>
        )}
        {noteDirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(review.status)}
            className="w-full py-2 rounded-lg text-xs text-slate-300 border border-dashed border-slate-600 hover:border-slate-400 disabled:opacity-50"
          >
            {t("reviews.admin.save_note")}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("reviews.admin.delete_confirm"))) onDelete(review.id);
          }}
          className="w-full py-2 rounded-lg text-xs text-slate-500 hover:text-red-300 disabled:opacity-50"
        >
          {t("reviews.admin.action_delete")}
        </button>
      </div>
    </article>
  );
}

/**
 * /admin/reviews — 후기 검수 페이지.
 * 접근: admin_users 에 등록된 계정만 (서버 RLS 가 실제 권한을 판정하며, 여기서는 UI 진입만 제어)
 */
export default function AdminReviews() {
  useNoIndex();
  const { t } = useTranslation();
  const { isAdmin, checking, user, loadingAuth } = useIsAdmin();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchReviewsForAdmin({ limit: 500 });
      setReviews(list);
    } catch (err) {
      console.error("후기 목록 조회 실패:", err);
      setError(t("reviews.admin.error_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const counts = useMemo(() => {
    const c = { pending: 0, published: 0, hidden: 0, all: reviews.length };
    for (const r of reviews) {
      if (r.status === "pending") c.pending += 1;
      else if (r.status === "published") c.published += 1;
      else c.hidden += 1;
    }
    return c;
  }, [reviews]);

  const visible = useMemo(() => {
    const def = TABS.find((x) => x.id === tab) || TABS[0];
    if (!def.statuses) return reviews;
    return reviews.filter((r) => def.statuses.includes(r.status));
  }, [reviews, tab]);

  const handleChangeStatus = async (id, status, note) => {
    setBusyId(id);
    setError("");
    try {
      const updated = await updateReviewStatus(id, status, note);
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (err) {
      console.error("후기 상태 변경 실패:", err);
      setError(t("reviews.admin.error_update"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    setBusyId(id);
    setError("");
    try {
      await deleteReview(id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("후기 삭제 실패:", err);
      setError(t("reviews.admin.error_update"));
    } finally {
      setBusyId(null);
    }
  };

  if (loadingAuth || checking) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen py-8 px-4 pb-28">
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-2xl font-bold text-white">{t("reviews.admin.title")}</h1>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-sm text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 hover:border-slate-400 disabled:opacity-50"
          >
            {t("reviews.admin.refresh")}
          </button>
        </div>
        <p className="text-sm text-slate-400 mb-6">{t("reviews.admin.subtitle")}</p>

        {/* 탭 */}
        <div className="flex gap-1 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
          {TABS.map((x) => {
            const active = tab === x.id;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setTab(x.id)}
                className={`shrink-0 px-3.5 py-2 rounded-full text-sm border transition-colors touch-manipulation ${
                  active
                    ? "text-black border-transparent"
                    : "text-slate-300 border-slate-600 hover:border-slate-400"
                }`}
                style={active ? { backgroundColor: colors.primary } : undefined}
              >
                {t(`reviews.admin.tab_${x.id}`)}
                <span className={`ml-1.5 text-xs ${active ? "text-black/70" : "text-slate-500"}`}>
                  {counts[x.id]}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 text-sm bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-slate-400 text-sm">{t("reviews.admin.loading")}</p>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-slate-400 text-sm">{t("reviews.admin.empty")}</p>
        ) : (
          <div className="space-y-4">
            {visible.map((r) => (
              <ReviewAdminCard
                key={r.id}
                review={r}
                busy={busyId === r.id}
                onChangeStatus={handleChangeStatus}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
