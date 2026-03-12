import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";
import PrimaryButton from "../components/PrimaryButton";
import OrderCheckModal from "../components/OrderCheckModal";
import EquipmentGuidePanel from "../components/EquipmentGuidePanel";
import BottomNavigation from "../components/BottomNavigation";
import * as PortOne from "@portone/browser-sdk/v2";
import { prepareBuyerEmail } from "../utils/paymentUtils";
import { colors } from "../constants/colors";
import { TelescopeIcon, CompassIcon, ProbeIcon } from "../components/EquipmentIcons";
import { trackPurchase } from "../utils/analytics";

const PACKAGES = [
  {
    id: "ticket_1",
    name: "망원경 1개",
    nameEn: "Ticket_1",
    price: 1000,
    paid: 1,
    bonus: 0,
    color: "from-blue-400 to-cyan-500",
    iconType: "telescope",
    description: "망원경 1개",
  },
  {
    id: "ticket_3",
    name: "망원경 3개",
    nameEn: "Ticket_3",
    price: 2900,
    paid: 3,
    bonus: 1,
    color: "from-purple-400 to-pink-500",
    iconType: "telescope",
    description: "망원경 3개 + 나침반 1개",
  },
  {
    id: "ticket_5",
    name: "망원경 5개",
    nameEn: "Ticket_5",
    price: 4950,
    paid: 5,
    bonus: 3,
    color: "from-yellow-400 to-orange-500",
    iconType: "telescope",
    badge: "BEST",
    description: "망원경 5개 + 나침반 3개",
  },
  {
    id: "daily_7",
    name: "나침반 7개",
    nameEn: "Daily_7",
    price: 1900,
    paid: 0,
    bonus: 7,
    color: "from-green-400 to-emerald-500",
    iconType: "compass",
    description: "나침반 7개",
  },
  {
    id: "daily_14",
    name: "나침반 14개",
    nameEn: "Daily_14",
    price: 3500,
    paid: 0,
    bonus: 14,
    color: "from-indigo-400 to-purple-600",
    iconType: "compass",
    description: "나침반 14개",
    badge: "8% 할인",
  },
  {
    id: "probe_1",
    name: "탐사선 1대",
    nameEn: "Probe_1",
    price: 2990,
    paid: 0,
    bonus: 0,
    probe: 1,
    color: "from-amber-400 to-rose-500",
    iconType: "probe",
    description: "종합운세 1회 열람권",
  },
];

function Purchase() {
  const { user } = useAuth();
  const { stars, refetchStars } = useStars();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);

  // 상품 클릭 시 주문 확인 모달 표시
  const handlePackageClick = (pkg) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      navigate("/login");
      return;
    }

    setSelectedPackage(pkg);
    setShowOrderModal(true);
    setError(null);
  };

  // 모달에서 결제 확인 시 실제 결제 진행
  const handleConfirmPurchase = async () => {
    if (!selectedPackage) return;

    setLoading(true);
    setError(null);

    try {
      const merchantUid = `order_${Date.now()}_${user.id.slice(0, 8)}`;

      // 모바일 리다이렉트 후 URL 파라미터가 유실될 수 있어, 복구용으로 저장
      const redirectBase = `${window.location.origin}/payment/complete`;
      const redirectUrl = `${redirectBase}?merchant_uid=${encodeURIComponent(merchantUid)}`;
      try {
        sessionStorage.setItem("payment_merchant_uid", merchantUid);
        sessionStorage.setItem(
          "payment_checkout_items",
          JSON.stringify({
            merchantUid,
            id: selectedPackage.id,
            name: selectedPackage.name,
            price: selectedPackage.price,
            iconType: selectedPackage.iconType,
          })
        );
      } catch (_) {}

      // 포트원 결제 요청 (모바일: redirectUrl로 돌아올 때 imp_uid, imp_success 등이 쿼리로 붙음)
      const response = await PortOne.requestPayment({
        storeId: import.meta.env.VITE_PORTONE_STORE_ID,
        channelKey: import.meta.env.VITE_PORTONE_CHANNEL_KEY,
        paymentId: merchantUid,
        orderName: `${selectedPackage.name} (${selectedPackage.nameEn}) 패키지`,
        totalAmount: selectedPackage.price,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          customerId: user.id,
          fullName: "우주탐험가",
          phoneNumber: "010-0000-0000",
          email: prepareBuyerEmail(user),
        },
        // 모바일 결제 시 리다이렉트 URL (없으면 현재 페이지 기준으로 결제 완료 페이지로 복귀)
        redirectUrl: redirectUrl,
      });

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
            amount: selectedPackage.price,
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
      setShowOrderModal(false);
      const totalBought =
        (selectedPackage.paid ?? 0) +
        (selectedPackage.bonus ?? 0) +
        (selectedPackage.probe ?? 0);
      const newTotal =
        (data.data.new_balance?.paid_stars ?? 0) +
        (data.data.new_balance?.bonus_stars ?? 0) +
        (data.data.new_balance?.probe_stars ?? 0);
      alert(
        `🎉 운세권 구매 완료!\n\n구매한 운세권: ${totalBought}장\n새로운 잔액: ${newTotal}장`,
      );
      await refetchStars();

      // GA4 purchase: 결제·쿠폰 지급이 모두 끝난 직후, 비동기로만 전송 (서비스 영향 0%)
      const itemCategory =
        selectedPackage.iconType === "telescope"
          ? "망원경"
          : selectedPackage.iconType === "compass"
            ? "나침반"
            : "탐사선";
      setTimeout(() => {
        trackPurchase({
          transaction_id: merchantUid,
          value: selectedPackage.price,
          currency: "KRW",
          items: [
            {
              item_id: selectedPackage.id,
              item_name: selectedPackage.name,
              price: selectedPackage.price,
              quantity: 1,
              item_category: itemCategory,
            },
          ],
        });
        try {
          sessionStorage.removeItem("payment_checkout_items");
        } catch (_) {}
      }, 0);
    } catch (err) {
      console.error("결제 오류:", err);
      setError(err.message || "결제 처리 중 오류가 발생했습니다.");
      setShowOrderModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 pb-24">
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">미래 관측 장비</h1>
          <p className="text-slate-300 text-sm">
            나침반으로 오늘의 길을, 망원경으로 다가올 미래를, 탐사선으로 내
            삶의 전체를 탐험하세요
          </p>
        </div>

        {/* 현재 보유 장비 */}
        <div className="p-4 min-[380px]:p-6 border border-slate-600 rounded-xl mb-6">
          <div className="text-center">
            <div className="flex flex-nowrap items-center justify-center gap-2 min-[380px]:gap-3">
              <div className="flex items-center justify-center gap-1 min-[380px]:gap-1.5 shrink-0">
                <TelescopeIcon className="w-4 h-4 min-[380px]:w-[18px] min-[380px]:h-[18px] text-white" />
                <span className="text-xs min-[380px]:text-base text-white whitespace-nowrap">
                  망원경{" "}
                  <span className="font-bold text-white">
                    {stars.paid.toLocaleString()}개
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 min-[380px]:gap-1.5 shrink-0">
                <CompassIcon className="w-4 h-4 min-[380px]:w-[18px] min-[380px]:h-[18px] text-white" />
                <span className="text-xs min-[380px]:text-base text-white whitespace-nowrap">
                  나침반{" "}
                  <span className="font-bold text-white">
                    {stars.bonus.toLocaleString()}개
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 min-[380px]:gap-1.5 shrink-0">
                <ProbeIcon className="w-4 h-4 min-[380px]:w-[18px] min-[380px]:h-[18px] text-white" />
                <span className="text-xs min-[380px]:text-base text-white whitespace-nowrap">
                  탐사선{" "}
                  <span className="font-bold text-white">
                    {stars.probe.toLocaleString()}대
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <EquipmentGuidePanel />

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
              onClick={() => handlePackageClick(pkg)}
              disabled={loading}
              className="w-full bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-all duration-200 hover:shadow-xl hover:shadow-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <div className="flex items-center justify-between">
                {/* 왼쪽: 아이콘 + 패키지명 + 칩 */}
                <div className="flex-1">
                  {/* 첫 번째 줄: 아이콘 + 패키지명 + 칩 */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-white">
                      {pkg.iconType === "telescope" ? (
                        <TelescopeIcon className="w-5 h-5" />
                      ) : pkg.iconType === "probe" ? (
                        <ProbeIcon className="w-5 h-5" />
                      ) : (
                        <CompassIcon className="w-5 h-5" />
                      )}
                    </div>
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

                  {/* 두 번째 줄: 상품 설명 */}
                  <div className="text-xs">
                    {pkg.paid > 0 && pkg.bonus > 0 ? (
                      <span className="text-slate-300">
                        {pkg.description.split(" + ")[0]}
                        <span
                          className="font-bold"
                          style={{
                            color: colors.primary,
                          }}
                        >
                          {" + "}
                        </span>
                        <span
                          className="font-bold"
                          style={{
                            color: colors.primary,
                          }}
                        >
                          {pkg.description.split(" + ")[1]}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-300">{pkg.description}</span>
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

      {/* 주문 확인 모달 */}
      <OrderCheckModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        packageInfo={selectedPackage}
        onConfirm={handleConfirmPurchase}
        loading={loading}
      />
      {user && <BottomNavigation />}
    </div>
  );
}

export default Purchase;
