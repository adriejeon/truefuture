import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import useNoIndex from "../hooks/useNoIndex";
import { REFUND_WINDOW_DAYS } from "../constants/pricing";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STORE_LINKS = {
  apple: "https://reportaproblem.apple.com",
  google: "https://play.google.com/store/account/orderhistory",
};

// related_item_id 접두사로 결제 채널을 판정한다. (send-email의 판정과 동일 규칙)
//   웹  : purchase-stars     → PortOne merchant_uid / imp_uid
//   IAP : purchase-stars-iap → `iap_{platform}_{purchase_id}`
function resolvePaymentChannel(relatedItemId) {
  const id = (relatedItemId ?? "").toString();
  if (id.startsWith("iap_ios_")) return { key: "ios", store: "apple" };
  if (id.startsWith("iap_android_")) return { key: "android", store: "google" };
  return { key: "web", store: null };
}

function RefundInquiry() {
  const { t, i18n } = useTranslation();
  const { user, loadingAuth } = useAuth();
  // 로그인해야 볼 수 있는 화면(본인 결제 내역 기반) — 검색·AI 색인에서 제외
  useNoIndex();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [replyEmail, setReplyEmail] = useState(user?.email || "");
  const [emailError, setEmailError] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [transactions, setTransactions] = useState([]);
  // 선택 키: 운세권 결제는 "tx:{id}", 프리미엄 리포트 결제는 "rp:{id}"
  const [selectedKey, setSelectedKey] = useState(() => {
    const txParam = searchParams.get("transactionId");
    if (txParam) return `tx:${txParam}`;
    const reportParam = searchParams.get("reportId");
    if (reportParam) return `rp:${reportParam}`;
    return "";
  });
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!replyEmail && user?.email) {
      setReplyEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (loadingAuth) return;

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;

    const fetchTransactions = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const { data, error } = await supabase
          .from("star_transactions")
          .select(
            "id, created_at, description, related_item_id, amount, paid_amount, bonus_amount, probe_amount, expires_at, is_expired"
          )
          .eq("user_id", user.id)
          .eq("type", "CHARGE")
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const rows = data || [];
        setTransactions(rows);

        // 프리미엄 상세 리포트 결제 이력
        let reportRows = [];
        try {
          const { data: reportData } = await supabase
            .from("premium_reports")
            .select("id, created_at, status, amount, currency, merchant_uid")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          reportRows = reportData || [];
        } catch (_) {
          reportRows = [];
        }
        if (cancelled) return;
        setReports(reportRows);

        // 딥링크로 넘어온 건이 목록에 없으면 선택을 비운다.
        setSelectedKey((prev) => {
          if (prev) {
            const [kind, id] = prev.split(":");
            if (kind === "tx" && rows.some((tx) => tx.id === id)) return prev;
            if (kind === "rp" && reportRows.some((r) => r.id === id)) return prev;
          }
          if (rows.length === 1 && reportRows.length === 0) return `tx:${rows[0].id}`;
          if (rows.length === 0 && reportRows.length === 1) return `rp:${reportRows[0].id}`;
          return "";
        });
      } catch (err) {
        if (cancelled) return;
        console.error("❌ 결제 내역 조회 실패:", err);
        setLoadError(t("refund_inquiry.error_load"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTransactions();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loadingAuth]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const locale = i18n.language?.startsWith("ko") ? "ko-KR" : "en-US";
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getPackageName = (description) => {
    if (!description) return t("refund_inquiry.product_fallback");
    const name = description.replace(/(운세권\s*구매|IAP\s*구매)\s*:/gi, "").trim();
    return name || t("refund_inquiry.product_fallback");
  };

  const [selectedKind, selectedId] = selectedKey ? selectedKey.split(":") : [null, null];
  const selectedTx =
    selectedKind === "tx" ? transactions.find((tx) => tx.id === selectedId) || null : null;
  const selectedReport =
    selectedKind === "rp" ? reports.find((r) => r.id === selectedId) || null : null;
  const selectedChannel = selectedTx ? resolvePaymentChannel(selectedTx.related_item_id) : null;
  const isStorePurchase = !!selectedChannel?.store;
  const hasSelection = !!selectedTx || !!selectedReport;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEmailError("");

    const trimmedReply = replyEmail.trim();
    if (!trimmedReply || !EMAIL_REGEX.test(trimmedReply)) {
      setEmailError(t("refund_inquiry.email_error"));
      return;
    }

    if (!hasSelection) {
      alert(t("refund_inquiry.error_select"));
      return;
    }

    // 인앱결제는 애플/구글이 환불 주체다. 서버에서도 거부하지만 여기서 먼저 막는다.
    if (isStorePurchase) {
      return;
    }

    setIsSubmitting(true);

    try {
      // 결제 정보는 보내지 않는다. 서버가 transactionId/reportId로 DB에서 직접 조회한다.
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "refund",
          ...(selectedTx ? { transactionId: selectedTx.id } : {}),
          ...(selectedReport ? { reportId: selectedReport.id } : {}),
          replyTo: trimmedReply,
          content: {
            refundReason: refundReason.trim() || "미입력",
          },
        },
      });

      // 함수가 4xx를 반환하면 supabase-js는 FunctionsHttpError를 던지고 data는 null이 된다.
      // 서버가 담아 보낸 안내 문구는 error.context(Response) 본문에 있으므로 꺼내서 보여준다.
      if (error) {
        let serverMessage = "";
        try {
          const detail = await error.context?.json?.();
          serverMessage = detail?.error || "";
        } catch {
          serverMessage = "";
        }
        throw new Error(serverMessage || t("refund_inquiry.error_send"));
      }

      if (!data?.success) {
        throw new Error(data?.error || t("refund_inquiry.error_send"));
      }

      alert(t("refund_inquiry.success"));
      navigate("/mypage");
    } catch (err) {
      console.error("환불 문의 오류:", err);
      alert(err.message || t("refund_inquiry.error_send"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTransactionList = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      );
    }

    if (transactions.length === 0 && reports.length === 0) {
      return (
        <div className="border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-600 mb-4">{t("refund_inquiry.empty")}</p>
          <button
            type="button"
            onClick={() => navigate("/purchase")}
            className="text-sm font-semibold text-yellow-700 hover:text-yellow-800 underline"
          >
            {t("refund_inquiry.go_purchase")}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {reports.map((report) => {
          const key = `rp:${report.id}`;
          const isSelected = key === selectedKey;
          return (
            <label
              key={key}
              className={`block border rounded-lg p-4 cursor-pointer transition-colors ${
                isSelected
                  ? "border-yellow-500 bg-yellow-50"
                  : "border-gray-300 bg-white hover:border-gray-400"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="transaction"
                  value={key}
                  checked={isSelected}
                  onChange={() => setSelectedKey(key)}
                  className="mt-1 accent-yellow-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-gray-900 truncate">
                      {t("refund_inquiry.report_product_name")} (
                      {Number(report.amount || 0).toLocaleString()}
                      {t("common.unit_won")})
                    </span>
                    <span className="shrink-0 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                      {t("refund_inquiry.report_badge")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {t("refund_inquiry.purchased_at_label")} {formatDate(report.created_at)}
                  </p>
                  <p className="text-xs text-gray-600">
                    {t("refund_inquiry.channel_label")} {t("refund_inquiry.channel_web")}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 break-all">
                    {t("refund_inquiry.tx_id_label")} {report.merchant_uid || report.id}
                  </p>
                </div>
              </div>
            </label>
          );
        })}
        {transactions.map((tx) => {
          const channel = resolvePaymentChannel(tx.related_item_id);
          const key = `tx:${tx.id}`;
          const isSelected = key === selectedKey;
          return (
            <label
              key={key}
              className={`block border rounded-lg p-4 cursor-pointer transition-colors ${
                isSelected
                  ? "border-yellow-500 bg-yellow-50"
                  : "border-gray-300 bg-white hover:border-gray-400"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="transaction"
                  value={key}
                  checked={isSelected}
                  onChange={() => setSelectedKey(key)}
                  className="mt-1 accent-yellow-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-gray-900 truncate">
                      {getPackageName(tx.description)}
                    </span>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${
                        tx.is_expired
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {tx.is_expired
                        ? t("refund_inquiry.status_expired")
                        : t("refund_inquiry.status_valid")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {t("refund_inquiry.purchased_at_label")} {formatDate(tx.created_at)}
                  </p>
                  <p className="text-xs text-gray-600">
                    {t("refund_inquiry.channel_label")}{" "}
                    {t(`refund_inquiry.channel_${channel.key}`)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 break-all">
                    {t("refund_inquiry.tx_id_label")} {tx.related_item_id || tx.id}
                  </p>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-white">
      <div className="max-w-md mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("refund_inquiry.back")}
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("refund_inquiry.title")}</h1>
        </div>

        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-6">
          <ul className="space-y-2 text-sm text-gray-800">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_1")}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-red-500">✗</span>
              <span>{t("refund_inquiry.policy_2")}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_3", { days: REFUND_WINDOW_DAYS })}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_4")}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_5")}</span>
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-gray-900 font-medium mb-2">
              {t("refund_inquiry.select_label")} <span className="text-red-600">*</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">{t("refund_inquiry.select_hint")}</p>
            {renderTransactionList()}
          </div>

          {isStorePurchase && (
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
              <p className="font-semibold text-blue-900 mb-2">
                {t("refund_inquiry.iap_title")}
              </p>
              <p className="text-sm text-blue-800 mb-3">
                {t(`refund_inquiry.iap_desc_${selectedChannel.store}`)}
              </p>
              <a
                href={STORE_LINKS[selectedChannel.store]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {t(`refund_inquiry.iap_btn_${selectedChannel.store}`)}
              </a>
            </div>
          )}

          <div>
            <label className="block text-gray-900 font-medium mb-2">
              {t("refund_inquiry.email_label")} <span className="text-red-600">*</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">{t("refund_inquiry.email_hint")}</p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={replyEmail}
              onChange={(e) => {
                setReplyEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              placeholder={t("refund_inquiry.email_placeholder")}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 bg-white"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "refund-email-error" : undefined}
              required
            />
            {emailError && (
              <p id="refund-email-error" className="mt-2 text-sm text-red-600" role="alert">
                {emailError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-gray-900 font-medium mb-2">
              {t("refund_inquiry.reason_label")}
            </label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder={t("refund_inquiry.reason_placeholder")}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 resize-none bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || loading || !hasSelection || isStorePurchase}
            className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-200 disabled:text-gray-400 text-gray-900 font-bold py-4 text-lg rounded-lg transition-colors"
          >
            {isSubmitting ? t("refund_inquiry.submitting") : t("refund_inquiry.submit_btn")}
          </button>
        </form>
      </div>
    </div>
  );
}

export default RefundInquiry;
