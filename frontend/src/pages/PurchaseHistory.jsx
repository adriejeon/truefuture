import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

function PurchaseHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    fetchTransactions();
  }, [user, navigate]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("star_transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("type", "CHARGE")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setTransactions(data || []);
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

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              구매 내역
            </h1>
            <p className="text-slate-300 text-sm sm:text-base">
              별 충전 내역을 확인하세요
            </p>
          </div>
          <button
            onClick={() => navigate("/purchase")}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
          >
            ← 돌아가기
          </button>
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
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">⭐</span>
                      <h3 className="text-lg font-semibold text-white">
                        {tx.description || "별 충전"}
                      </h3>
                    </div>
                    <p className="text-slate-400 text-sm">
                      {formatDate(tx.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-yellow-400">
                      +{tx.amount}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {tx.related_item_id ? `주문번호: ${tx.related_item_id.slice(0, 12)}...` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                  <span className="text-xs text-slate-500">
                    거래 ID: {tx.id.slice(0, 8)}...
                  </span>
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                    완료
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PurchaseHistory;
