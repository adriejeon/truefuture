import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

function PurchaseHistory() {
  const { user, loadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [consumedAmounts, setConsumedAmounts] = useState({});

  useEffect(() => {
    // 로딩 중이면 대기
    if (loadingAuth) {
      return;
    }

    // 로그인하지 않은 경우에만 리다이렉트 (현재 경로가 purchase/history일 때만)
    if (!user && location.pathname === "/purchase/history") {
      navigate("/login", { replace: true });
      return;
    }

    // 사용자가 있으면 거래 내역 조회
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

      // 모든 CONSUME 거래를 한 번에 가져오기
      if (data && data.length > 0) {
        const { data: allConsumed } = await supabase
          .from("star_transactions")
          .select("amount, created_at")
          .eq("user_id", user.id)
          .eq("type", "CONSUME")
          .order("created_at", { ascending: true });

        // 각 CHARGE 거래별로 사용된 별 개수 계산 (FIFO 방식)
        const consumedMap = {};
        let totalConsumed = 0;
        
        // 시간순으로 정렬된 CHARGE 거래
        const sortedCharges = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        for (const tx of sortedCharges) {
          // 해당 거래 이후의 CONSUME 거래만 계산
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
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatDateForRefund = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getPackageName = (description) => {
    if (!description) return "별 충전";
    
    // "패키지 구매" 텍스트 제거
    let packageName = description.replace(/패키지\s*구매/g, "").trim();
    
    // 패키지 이름만 추출 (예: "유성 패키지 구매" -> "유성")
    const packageNames = ["유성", "혜성", "행성", "은하수"];
    for (const name of packageNames) {
      if (packageName.includes(name)) {
        return name;
      }
    }
    
    return packageName || "별 충전";
  };

  const getStarStatus = (tx) => {
    const consumed = consumedAmounts[tx.id] || 0;
    const totalAmount = tx.amount || 0;
    
    // 만료된 경우
    if (tx.is_expired) {
      return { text: "만료됨", className: "bg-red-500/20 text-red-400" };
    }
    
    // 사용 여부 확인
    if (consumed >= totalAmount) {
      return { text: "모두 사용", className: "bg-gray-500/20 text-gray-400" };
    } else if (consumed > 0) {
      return { text: "일부 사용", className: "bg-orange-500/20 text-orange-400" };
    } else {
      return { text: "보유 중", className: "bg-green-500/20 text-green-400" };
    }
  };

  const handleRefundRequest = (tx) => {
    const purchaseDate = formatDateForRefund(tx.created_at);
    navigate(`/refund-inquiry?transactionId=${tx.id}&purchaseDate=${encodeURIComponent(purchaseDate)}`);
  };

  const getExpirationStatus = (tx) => {
    if (!tx.expires_at) {
      return { text: "무제한", className: "text-blue-400", badge: "기존 정책" };
    }
    
    const expiresAt = new Date(tx.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (tx.is_expired || daysLeft <= 0) {
      return { text: "만료됨", className: "text-red-400", badge: "만료" };
    } else if (daysLeft <= 30) {
      return { text: `${daysLeft}일 남음`, className: "text-orange-400", badge: "곧 만료" };
    } else {
      return { text: formatDate(tx.expires_at), className: "text-green-400", badge: "유효" };
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
            뒤로
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">
            구매 내역
          </h1>
          <p className="text-slate-300 text-sm">
            별 충전 내역을 확인하세요
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* 로딩 상태 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          </div>
        ) : transactions.length === 0 ? (
          /* 내역 없음 */
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-slate-400 text-lg mb-6">
              아직 구매 내역이 없습니다
            </p>
            <button
              onClick={() => navigate("/purchase")}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-200"
            >
              별 충전하러 가기 →
            </button>
          </div>
        ) : (
          /* 내역 리스트 */
          <div className="space-y-4">
            {transactions.map((tx) => {
              const expirationStatus = getExpirationStatus(tx);
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
                      구매 일자: {formatDate(tx.created_at)}
                    </p>
                    <p className="text-xs text-slate-500 break-all">
                      거래 ID: {tx.id}
                    </p>
                  </div>

                  {/* 환불 요청 버튼 */}
                  <button
                    onClick={() => handleRefundRequest(tx)}
                    className="text-xs text-slate-400 hover:text-slate-300 underline transition-colors"
                  >
                    환불 요청
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
