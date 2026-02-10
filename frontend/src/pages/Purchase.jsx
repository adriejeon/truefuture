import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";
import PrimaryButton from "../components/PrimaryButton";
import * as PortOne from "@portone/browser-sdk/v2";
import { prepareBuyerEmail } from "../utils/paymentUtils";
import { colors } from "../constants/colors";

const PACKAGES = [
  {
    id: "meteor",
    name: "유성",
    nameEn: "Meteor",
    price: 1100,
    paid: 10,
    bonus: 0,
    color: "from-blue-400 to-cyan-500",
    icon: "☄️",
  },
  {
    id: "comet",
    name: "혜성",
    nameEn: "Comet",
    price: 3300,
    paid: 30,
    bonus: 1,
    color: "from-purple-400 to-pink-500",
    icon: "💫",
  },
  {
    id: "planet",
    name: "행성",
    nameEn: "Planet",
    price: 5500,
    paid: 50,
    bonus: 3,
    color: "from-yellow-400 to-orange-500",
    icon: "🪐",
    badge: "BEST",
  },
  {
    id: "galaxy",
    name: "은하수",
    nameEn: "Galaxy",
    price: 11000,
    paid: 100,
    bonus: 15,
    color: "from-indigo-400 to-purple-600",
    icon: "🌌",
    badge: "15% 혜택",
  },
];

function Purchase() {
  const { user } = useAuth();
  const { stars, refetchStars } = useStars();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePurchase = async (pkg) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      navigate("/login");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const merchantUid = `order_${Date.now()}_${user.id.slice(0, 8)}`;

      // 포트원 결제 요청
      const response = await PortOne.requestPayment({
        storeId: import.meta.env.VITE_PORTONE_STORE_ID,
        channelKey: import.meta.env.VITE_PORTONE_CHANNEL_KEY,
        paymentId: merchantUid,
        orderName: `${pkg.name} (${pkg.nameEn}) 패키지`,
        totalAmount: pkg.price,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          customerId: user.id,
          fullName: "우주탐험가",
          phoneNumber: "010-0000-0000",
          email: prepareBuyerEmail(user),
        },
        // 모바일 결제 시 리다이렉트 URL (필수)
        redirectUrl: `${window.location.origin}/payment/complete?merchant_uid=${merchantUid}`,
      });

      console.log("포트원 결제 응답:", response);

      // 결제 실패 처리
      if (response?.code != null) {
        throw new Error(response.message || "결제에 실패했습니다.");
      }

      // 결제 성공 → 백엔드 함수 호출하여 별 충전
      const { data, error: purchaseError } = await supabase.functions.invoke(
        "purchase-stars",
        {
          body: {
            user_id: user.id,
            amount: pkg.price,
            merchant_uid: merchantUid,
            imp_uid: response?.paymentId || merchantUid,
          },
        },
      );

      if (purchaseError) throw purchaseError;

      if (!data?.success) {
        throw new Error(data?.error || "별 충전에 실패했습니다.");
      }

      // 성공 알림 및 잔액 새로고침
      alert(
        `🎉 별 충전 완료!\n\n충전된 별: ${pkg.paid + pkg.bonus}개\n새로운 잔액: ${data.data.new_balance.paid_stars + data.data.new_balance.bonus_stars}개`,
      );
      await refetchStars();
    } catch (err) {
      console.error("결제 오류:", err);
      setError(err.message || "결제 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">별 충전하기</h1>
          <p className="text-slate-300 text-sm">
            별을 충전하고 진짜미래를 확인하세요
          </p>
        </div>

        {/* 현재 보유 별 - 마이페이지와 동일 스타일 */}
        <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl mb-6">
          <div className="text-center">
            <p className="text-slate-300 text-sm mb-3">보유 별</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl">⭐</span>
              <span className="text-3xl font-bold text-white">
                {stars.total.toLocaleString()}
              </span>
            </div>
            <div className="flex gap-4 justify-center text-xs text-slate-400 mb-4">
              <span>유료: {stars.paid}개</span>
              <span>보너스: {stars.bonus}개</span>
            </div>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* 패키지 목록 */}
        <div className="space-y-3 mb-8">
          {PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => handlePurchase(pkg)}
              disabled={loading}
              className="w-full bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-all duration-200 hover:shadow-xl hover:shadow-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <div className="flex items-center justify-between">
                {/* 왼쪽: 아이콘 + 패키지명 + 칩 */}
                <div className="flex-1">
                  {/* 첫 번째 줄: 아이콘 + 패키지명 + 칩 */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{pkg.icon}</span>
                    <h3 className="text-base font-bold text-white">
                      {pkg.name}
                    </h3>
                    {pkg.badge && (
                      <span
                        className="inline-block text-black text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: colors.primary,
                        }}
                      >
                        {pkg.badge}
                      </span>
                    )}
                  </div>

                  {/* 두 번째 줄: 기본 별 + 보너스 별 */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-300">
                      기본 별{" "}
                      <span className="text-white font-semibold">
                        {pkg.paid}개
                      </span>
                    </span>
                    {pkg.bonus > 0 && (
                      <>
                        <span className="text-slate-600">|</span>
                        <span className="text-yellow-400">
                          보너스 별{" "}
                          <span className="font-semibold">+{pkg.bonus}개</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* 오른쪽: 가격 */}
                <div className="text-right ml-4">
                  <div className="text-xl font-bold text-white">
                    {pkg.price.toLocaleString()}
                    <span className="text-slate-400 text-sm ml-0.5">원</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* 하단 링크 */}
        <div className="text-center">
          <button
            onClick={() => navigate("/purchase/history")}
            className="text-slate-400 hover:text-white text-sm underline transition-colors duration-200"
          >
            이전 구매 내역 보기 →
          </button>
        </div>
      </div>
    </div>
  );
}

export default Purchase;
