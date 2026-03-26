import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

const PACKAGE_BASE = [
  // priceUsd: null → 영문(PayPal) 노출 제외 (페이팔 고정 수수료 $0.30 방어)
  { id: "ticket_1", nameKey: "purchase_items.telescope_1_name", descKey: "purchase_items.telescope_1_desc", nameKo: "망원경 1개", nameEn: "Ticket_1", price: 1000, priceUsd: null, paid: 1, bonus: 0, color: "from-blue-400 to-cyan-500", iconType: "telescope" },
  { id: "ticket_3", nameKey: "purchase_items.telescope_3_name", descKey: "purchase_items.telescope_3_desc", nameKo: "망원경 3개", nameEn: "Ticket_3", price: 2900, priceUsd: 2.99, paid: 3, bonus: 1, color: "from-purple-400 to-pink-500", iconType: "telescope" },
  { id: "ticket_5", nameKey: "purchase_items.telescope_5_name", descKey: "purchase_items.telescope_5_desc", nameKo: "망원경 5개", nameEn: "Ticket_5", price: 4950, priceUsd: 4.99, paid: 5, bonus: 3, color: "from-yellow-400 to-orange-500", iconType: "telescope", badge: "BEST" },
  { id: "daily_7",  nameKey: "purchase_items.compass_7_name",   descKey: "purchase_items.compass_7_desc",   nameKo: "나침반 7개",  nameEn: "Daily_7",  price: 1900, priceUsd: null, paid: 0, bonus: 7,  color: "from-green-400 to-emerald-500", iconType: "compass" },
  { id: "daily_14", nameKey: "purchase_items.compass_14_name",  descKey: "purchase_items.compass_14_desc",  nameKo: "나침반 14개", nameEn: "Daily_14", price: 3500, priceUsd: 3.99, paid: 0, bonus: 14, color: "from-indigo-400 to-purple-600",  iconType: "compass", badgeKey: "purchase_items.badge_discount_14" },
  { id: "probe_1",  nameKey: "purchase_items.probe_1_name",     descKey: "purchase_items.probe_1_desc",     nameKo: "탐사선 1대",  nameEn: "Probe_1",  price: 2990, priceUsd: 2.99, paid: 0, bonus: 0, probe: 1, color: "from-amber-400 to-rose-500", iconType: "probe" },
];

function Purchase() {
  const { t, i18n } = useTranslation();

  const isEnglish = i18n.language === "en";

  const PACKAGES = PACKAGE_BASE
    // 영문(PayPal)일 때 priceUsd가 없는 소액 패키지 숨김 (페이팔 고정 수수료 방어)
    .filter((pkg) => !isEnglish || pkg.priceUsd !== null)
    .map((pkg) => ({
      ...pkg,
      name: t(pkg.nameKey),
      description: t(pkg.descKey),
      badge: pkg.badge === "BEST" ? "BEST" : pkg.badgeKey ? t(pkg.badgeKey) : undefined,
    }));
  const { user } = useAuth();
  const { stars, refetchStars } = useStars();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);

  const handlePackageClick = (pkg) => {
    if (!user) {
      alert(t("purchase.login_required"));
      navigate("/login");
      return;
    }

    setSelectedPackage(pkg);
    setShowOrderModal(true);
    setError(null);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedPackage) return;

    setLoading(true);
    setError(null);

    try {
      const merchantUid = `order_${Date.now()}_${user.id.slice(0, 8)}`;

      // 언어에 따라 결제 수단 분기: 영문 → PayPal(USD), 한국어 → KG이니시스(KRW)
      const paymentAmount = isEnglish ? selectedPackage.priceUsd : selectedPackage.price;
      const paymentCurrency = isEnglish ? "CURRENCY_USD" : "CURRENCY_KRW";
      const channelKey = isEnglish
        ? import.meta.env.VITE_PORTONE_PAYPAL_CHANNEL_KEY
        : import.meta.env.VITE_PORTONE_CHANNEL_KEY;
      const payMethod = isEnglish ? "PAYPAL" : "CARD";
      const trackCurrency = isEnglish ? "USD" : "KRW";

      const redirectBase = `${window.location.origin}/payment/complete`;
      // 모바일 리다이렉트 시 package_id를 URL 파라미터로 전달 (PaymentComplete에서 활용)
      const redirectUrl = `${redirectBase}?merchant_uid=${encodeURIComponent(merchantUid)}&package_id=${encodeURIComponent(selectedPackage.id)}`;
      try {
        sessionStorage.setItem("payment_merchant_uid", merchantUid);
        sessionStorage.setItem(
          "payment_checkout_items",
          JSON.stringify({
            merchantUid,
            id: selectedPackage.id,
            name: selectedPackage.name,
            price: paymentAmount,
            currency: trackCurrency,
            iconType: selectedPackage.iconType,
          })
        );
      } catch (_) {}

      const response = await PortOne.requestPayment({
        storeId: import.meta.env.VITE_PORTONE_STORE_ID,
        channelKey,
        paymentId: merchantUid,
        orderName: isEnglish
          ? `${selectedPackage.nameEn} Package`
          : `${selectedPackage.nameKo} (${selectedPackage.nameEn}) 패키지`,
        totalAmount: paymentAmount,
        currency: paymentCurrency,
        payMethod,
        customer: {
          customerId: user.id,
          fullName: isEnglish ? "Explorer" : "우주탐험가",
          phoneNumber: "010-0000-0000",
          email: prepareBuyerEmail(user),
        },
        redirectUrl: redirectUrl,
      });

      if (response?.code != null) {
        throw new Error(response.message || t("purchase.payment_failed"));
      }

      const { data, error: purchaseError } = await supabase.functions.invoke(
        "purchase-stars",
        {
          body: {
            user_id: user.id,
            amount: paymentAmount,
            merchant_uid: merchantUid,
            imp_uid: response?.paymentId || merchantUid,
            currency: trackCurrency,
            package_id: selectedPackage.id,
          },
        },
      );

      if (purchaseError) throw purchaseError;

      if (!data?.success) {
        throw new Error(data?.error || t("purchase.charge_failed"));
      }

      setShowOrderModal(false);
      const totalBought =
        (selectedPackage.paid ?? 0) +
        (selectedPackage.bonus ?? 0) +
        (selectedPackage.probe ?? 0);
      const newTotal =
        (data.data.new_balance?.paid_stars ?? 0) +
        (data.data.new_balance?.bonus_stars ?? 0) +
        (data.data.new_balance?.probe_stars ?? 0);
      alert(t("purchase.purchase_success", { count: totalBought, balance: newTotal }));
      await refetchStars();

      const itemCategory = selectedPackage.iconType;
      setTimeout(() => {
        trackPurchase({
          transaction_id: merchantUid,
          value: paymentAmount,
          currency: trackCurrency,
          items: [
            {
              item_id: selectedPackage.id,
              item_name: selectedPackage.name,
              price: paymentAmount,
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
      setError(err.message || t("purchase.payment_error"));
      setShowOrderModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{t("purchase.title")}</h1>
          <p className="text-slate-300 text-sm">
            {t("purchase.subtitle")}
          </p>
        </div>

        {/* 현재 보유 장비 */}
        <div className="p-4 min-[380px]:p-6 border border-slate-600 rounded-xl mb-6">
          <div className="text-center">
            <div className="flex flex-nowrap items-center justify-center gap-2 min-[380px]:gap-3">
              <div className="flex items-center justify-center gap-1 min-[380px]:gap-1.5 shrink-0">
                <TelescopeIcon className="w-4 h-4 min-[380px]:w-[18px] min-[380px]:h-[18px] text-white" />
                <span className="text-xs min-[380px]:text-base text-white whitespace-nowrap">
                  {t("purchase.telescope")}{" "}
                  <span className="font-bold text-white">
                    {stars.paid.toLocaleString()}{t("common.count_unit")}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 min-[380px]:gap-1.5 shrink-0">
                <CompassIcon className="w-4 h-4 min-[380px]:w-[18px] min-[380px]:h-[18px] text-white" />
                <span className="text-xs min-[380px]:text-base text-white whitespace-nowrap">
                  {t("purchase.compass")}{" "}
                  <span className="font-bold text-white">
                    {stars.bonus.toLocaleString()}{t("common.count_unit")}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 min-[380px]:gap-1.5 shrink-0">
                <ProbeIcon className="w-4 h-4 min-[380px]:w-[18px] min-[380px]:h-[18px] text-white" />
                <span className="text-xs min-[380px]:text-base text-white whitespace-nowrap">
                  {t("purchase.probe")}{" "}
                  <span className="font-bold text-white">
                    {stars.probe.toLocaleString()}{t("common.unit_ships")}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <EquipmentGuidePanel />

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
                <div className="flex-1">
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
                        style={{ backgroundColor: colors.primary }}
                      >
                        {pkg.badge === "BEST" ? t("purchase.badge_best") : pkg.badge}
                      </span>
                    )}
                  </div>

                  <div className="text-xs">
                    {pkg.paid > 0 && pkg.bonus > 0 ? (
                      <span className="text-slate-300">
                        {pkg.description.split(" + ")[0]}
                        <span className="font-bold" style={{ color: colors.primary }}>{" + "}</span>
                        <span className="font-bold" style={{ color: colors.primary }}>
                          {pkg.description.split(" + ")[1]}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-300">{pkg.description}</span>
                    )}
                  </div>
                </div>

                <div className="text-right ml-4">
                  <div className="text-xl font-bold text-white">
                    {isEnglish
                      ? `$${pkg.priceUsd}`
                      : `${pkg.price.toLocaleString()}${t("common.unit_won")}`}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={() => navigate("/purchase/history")}
            className="text-slate-400 hover:text-white text-sm underline transition-colors duration-200"
          >
            {t("purchase.history_link")}
          </button>
        </div>
      </div>

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
