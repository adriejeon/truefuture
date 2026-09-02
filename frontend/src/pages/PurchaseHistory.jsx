import { useState, useEffect } from "react";
import useNoIndex from "../hooks/useNoIndex";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

function PurchaseHistory() {
  useNoIndex();
  const { t, i18n } = useTranslation();
  const { user, loadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [transactions, setTransactions] = useState([]);
  const [reportPurchases, setReportPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [consumedAmounts, setConsumedAmounts] = useState({});

  useEffect(() => {
    if (loadingAuth) {
      return;
    }

    if (!user && location.pathname === "/purchase/history") {
      navigate("/login", { replace: true });
      return;
    }

    if (user) {
      fetchTransactions();
    }
  }, [user, loadingAuth, location.pathname]);

  const fetchTransactions = async () => {
    if (!user?.id) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("star_transactions")
        .select("*, paid_amount, bonus_amount, expires_at, is_expired")
        .eq("user_id", user.id)
        .eq("type", "CHARGE")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setTransactions(data || []);

      // 프리미엄 상세 리포트 결제 이력 (별도 원장)
      try {
        const { data: reports } = await supabase
          .from("premium_reports")
          .select("id, created_at, status, sections_done, sections_total, amount, currency, merchant_uid")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        setReportPurchases(reports || []);
      } catch (_) {
        // 리포트 이력 조회 실패는 운세권 이력 표시를 막지 않음
      }

      if (data && data.length > 0) {
        const { data: allConsumed } = await supabase
          .from("star_transactions")
          .select("amount, created_at")
          .eq("user_id", user.id)
          .eq("type", "CONSUME")
          .order("created_at", { ascending: true });

        const consumedMap = {};
        
        const sortedCharges = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        for (const tx of sortedCharges) {
          const consumedAfterTx = allConsumed
            ?.filter(consume => new Date(consume.created_at) >= new Date(tx.created_at))
            .reduce((sum, item) => sum + Math.abs(item.amount || 0), 0) || 0;
          
          consumedMap[tx.id] = consumedAfterTx;
        }
        
        setConsumedAmounts(consumedMap);
      }
    } catch (err) {
      console.error("❌ 구매 내역 조회 실패:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
    if (!description) return t("purchase_history.purchase_fallback");
    
    let packageName = description.replace(/운세권\s*구매:/g, "").trim();
    
    const packageNames = ["망원경", "나침반", "종합 운세", "Telescope", "Compass", "Probe"];
    for (const name of packageNames) {
      if (packageName.includes(name)) {
        return packageName;
      }
    }
    
    return packageName || t("purchase_history.purchase_fallback");
  };

  const getStarStatus = (tx) => {
    const consumed = consumedAmounts[tx.id] || 0;
    const totalAmount = tx.amount || 0;
    
    if (tx.is_expired) {
      return { text: t("purchase_history.status_expired"), className: "bg-red-500/20 text-red-400" };
    }
    
    if (consumed >= totalAmount) {
      return { text: t("purchase_history.status_all_used"), className: "bg-gray-500/20 text-gray-400" };
    } else if (consumed > 0) {
      return { text: t("purchase_history.status_partial"), className: "bg-orange-500/20 text-orange-400" };
    } else {
      return { text: t("purchase_history.status_holding"), className: "bg-green-500/20 text-green-400" };
    }
  };

  // 결제 일시·상품명은 환불 문의 페이지가 DB에서 직접 읽는다. 거래 ID만 넘긴다.
  const handleRefundRequest = (tx) => {
    navigate(`/refund-inquiry?transactionId=${encodeURIComponent(tx.id)}`);
  };

  const getExpirationStatus = (tx) => {
    if (!tx.expires_at) {
      return { text: t("purchase_history.expire_unlimited"), className: "text-blue-400", badge: t("purchase_history.expire_badge_legacy") };
    }
    
    const expiresAt = new Date(tx.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (tx.is_expired || daysLeft <= 0) {
      return { text: t("purchase_history.status_expired"), className: "text-red-400", badge: t("purchase_history.expire_badge_expired") };
    } else if (daysLeft <= 30) {
      return { text: t("purchase_history.expire_days_left", { days: daysLeft }), className: "text-orange-400", badge: t("purchase_history.expire_badge_soon") };
    } else {
      return { text: formatDate(tx.expires_at), className: "text-green-400", badge: t("purchase_history.expire_badge_valid") };
    }
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center text-slate-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("purchase_history.back")}
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">
            {t("purchase_history.title")}
          </h1>
          <p className="text-slate-300 text-sm">
            {t("purchase_history.subtitle")}
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* 프리미엄 상세 리포트 결제 이력 */}
        {!loading && reportPurchases.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">
              {t("purchase_history.report_section_title")}
            </h2>
            <div className="space-y-4">
              {reportPurchases.map((report) => {
                const chip =
                  report.status === "DONE"
                    ? { text: t("purchase_history.report_status_done"), cls: "bg-green-500/20 text-green-400" }
                    : report.status === "FAILED"
                      ? { text: t("purchase_history.report_status_failed"), cls: "bg-red-500/20 text-red-400" }
                      : { text: t("purchase_history.report_status_generating"), cls: "bg-amber-500/20 text-amber-400" };
                return (
                  <div
                    key={report.id}
                    className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white">
                        {t("purchase_history.report_product_name")}
                      </h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${chip.cls}`}>
                        {chip.text}
                      </span>
                    </div>
                    <div className="space-y-1 mb-3">
                      <p className="text-xs text-slate-400">
                        {t("purchase_history.date_label")} {formatDate(report.created_at)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {t("purchase_history.report_amount_label")}{" "}
                        {Number(report.amount || 0).toLocaleString()}
                        {t("common.unit_won")}
                      </p>
                      <p className="text-xs text-slate-500 break-all">
                        {t("purchase_history.tx_id_label")} {report.merchant_uid || report.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => navigate(`/report?id=${encodeURIComponent(report.id)}`)}
                        className="text-xs font-medium underline transition-colors"
                        style={{ color: "#E1AC3F" }}
                      >
                        {t("purchase_history.report_view_btn")}
                      </button>
                      <button
                        onClick={() =>
                          navigate(`/refund-inquiry?reportId=${encodeURIComponent(report.id)}`)
                        }
                        className="text-xs text-slate-400 hover:text-slate-300 underline transition-colors"
                      >
                        {t("purchase_history.refund_btn")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 로딩 상태 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          </div>
        ) : transactions.length === 0 && reportPurchases.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-slate-400 text-lg mb-6">
              {t("purchase_history.empty")}
            </p>
            <button
              onClick={() => navigate("/purchase")}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-200"
            >
              {t("purchase_history.go_purchase")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((tx) => {
              const packageName = getPackageName(tx.description);
              return (
                <div
                  key={tx.id}
                  className={`bg-slate-800/50 backdrop-blur-sm rounded-xl p-5 border transition-all duration-200 ${
                    tx.is_expired ? "border-red-900/50 opacity-60" : "border-slate-700 hover:border-slate-600"
                  }`}
                >
                  {/* 패키지 이름과 상태 칩 */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-white">
                      {packageName}
                    </h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStarStatus(tx).className}`}>
                      {getStarStatus(tx).text}
                    </span>
                  </div>
                  
                  {/* 구매 일자, 거래 아이디 */}
                  <div className="space-y-1 mb-3">
                    <p className="text-xs text-slate-400">
                      {t("purchase_history.date_label")} {formatDate(tx.created_at)}
                    </p>
                    <p className="text-xs text-slate-500 break-all">
                      {t("purchase_history.tx_id_label")} {tx.id}
                    </p>
                  </div>

                  {/* 환불 요청 버튼 */}
                  <button
                    onClick={() => handleRefundRequest(tx)}
                    className="text-xs text-slate-400 hover:text-slate-300 underline transition-colors"
                  >
                    {t("purchase_history.refund_btn")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default PurchaseHistory;
