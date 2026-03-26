import { useState } from "react";
import { useTranslation } from "react-i18next";
import PrimaryButton from "./PrimaryButton";
import { TelescopeIcon, CompassIcon, ProbeIcon } from "./EquipmentIcons";

/**
 * 주문 확인 모달 (PG사 심사 기준 충족)
 * @param {object} props
 * @param {boolean} props.isOpen - 모달 표시 여부
 * @param {function} props.onClose - 모달 닫기 콜백
 * @param {object} props.packageInfo - 선택한 패키지 정보
 * @param {function} props.onConfirm - 결제 진행 콜백
 * @param {boolean} props.loading - 로딩 상태
 * @param {boolean} props.isLifetimeFortune - 종합 운세 여부
 * @param {boolean} props.isPaypal - PayPal 결제 모드 여부
 * @param {boolean} props.paypalReady - PayPal 버튼 로딩 완료 여부
 */
function OrderCheckModal({ isOpen, onClose, packageInfo, onConfirm, loading = false, isLifetimeFortune = false, isPaypal = false, paypalReady = false }) {
  const { t, i18n } = useTranslation();
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;
  if (!isLifetimeFortune && !packageInfo) return null;

  const handleConfirm = () => {
    if (agreed && !loading) {
      onConfirm();
    }
  };

  const getUsageDescription = () => {
    if (isLifetimeFortune) {
      return t("order_modal.lifetime_usage");
    }
    if ((packageInfo.probe ?? 0) > 0) {
      return t("order_modal.probe_usage");
    }
    if (packageInfo.paid > 0) {
      return t("order_modal.telescope_usage");
    }
    return t("order_modal.compass_usage");
  };

  const displayInfo = isLifetimeFortune
    ? { name: "종합 운세", icon: "🌌", description: "진짜 인생 사용 설명서", price: 2990 }
    : packageInfo;

  const orderProductName = isLifetimeFortune
    ? "종합 운세"
    : (packageInfo.probe ?? 0) > 0
      ? packageInfo.name
      : packageInfo.paid > 0 && packageInfo.bonus > 0
        ? `${packageInfo.name} ${t("order_modal.bonus_suffix", { count: packageInfo.bonus })}`
        : packageInfo.name;

  const renderIcon = () => {
    if (isLifetimeFortune) {
      return <span className="text-3xl">{displayInfo.icon}</span>;
    }
    if (packageInfo.iconType === "telescope") {
      return <TelescopeIcon className="w-8 h-8 text-white" />;
    }
    if (packageInfo.iconType === "probe") {
      return <ProbeIcon className="w-8 h-8 text-white" />;
    }
    if (packageInfo.iconType === "compass") {
      return <CompassIcon className="w-8 h-8 text-white" />;
    }
    return <span className="text-3xl">{displayInfo.icon}</span>;
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="w-full h-full flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          {/* 헤더 */}
          <div className="px-4 py-4 pb-0 max-w-lg mx-auto">
            <button
              onClick={onClose}
              disabled={loading}
              className="mb-3 flex items-center text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t("order_modal.back")}
            </button>
            <h2 className="text-xl font-bold text-white">{t("order_modal.title")}</h2>
          </div>

          {/* 본문 */}
          <div className="px-4 py-4 pb-8 space-y-4 max-w-lg mx-auto">
            {/* 주문 상품 */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">{t("order_modal.order_item")}</h3>
              <h4 className="text-white font-semibold">{orderProductName}</h4>
            </div>

            {/* 상세 설명 */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">{t("order_modal.description")}</h3>
              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                <p className="text-slate-300 text-sm leading-relaxed flex items-start gap-2">
                  <svg className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{getUsageDescription()}</span>
                </p>
              </div>
            </div>

            {/* 결제 금액 */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">{t("order_modal.final_price")}</h3>
              <span className="text-xl font-bold text-white">
                {isPaypal
                  ? `$${displayInfo.priceUsd ?? displayInfo.price}`
                  : `${displayInfo.price.toLocaleString()}${t("common.unit_won")}`}
              </span>
            </div>

            {/* 카드 결제 제한 안내 */}
            <div className="rounded-xl p-4 border border-slate-700 bg-slate-900/50">
              <p className="text-slate-400 text-xs leading-relaxed flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-400/80 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{t("order_modal.card_restriction")}</span>
              </p>
            </div>

            {/* 약관 동의 */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">{t("order_modal.terms_title")}</h3>
              <label className="flex items-start gap-3 bg-slate-900/50 rounded-xl p-4 border border-slate-700 cursor-pointer hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  disabled={loading}
                  className="mt-1 w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 disabled:opacity-50"
                />
                <div className="flex-1">
                  <p className="text-slate-200 text-sm font-medium mb-1">
                    {t("order_modal.terms_required")}
                  </p>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {isLifetimeFortune
                      ? t("order_modal.terms_lifetime")
                      : t("order_modal.terms_regular")}
                  </p>
                </div>
              </label>
            </div>

            {/* 유효기간 */}
            {!isLifetimeFortune && (
              <div className="-mt-2">
                <p className="text-slate-500 text-xs text-center">
                  {t("order_modal.validity_note")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex-shrink-0 border-t border-slate-700 px-4 py-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="max-w-lg mx-auto">
            {isPaypal ? (
              <div className="space-y-3">
                {/* PayPal SPB 버튼 렌더 컨테이너 — PortOne SDK가 여기에 버튼을 주입 */}
                <div
                  className="portone-ui-container"
                  style={{ minHeight: 45, display: agreed ? "block" : "none" }}
                />
                {!agreed && (
                  <p className="text-center text-slate-400 text-sm">
                    {t("order_modal.terms_required_hint", { defaultValue: i18n.language === "en" ? "Please agree to the terms above to proceed." : "위 약관에 동의하시면 결제 버튼이 표시됩니다." })}
                  </p>
                )}
                {agreed && !paypalReady && (
                  <div className="flex items-center justify-center py-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent mr-2" />
                    <span className="text-slate-400 text-sm">
                      {i18n.language === "en" ? "Loading PayPal..." : "PayPal 로딩 중..."}
                    </span>
                  </div>
                )}
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("common.cancel")}
                </button>
                <PrimaryButton
                  variant="gold"
                  fullWidth
                  onClick={handleConfirm}
                  disabled={!agreed || loading}
                  className="flex-1"
                >
                  {loading ? t("order_modal.processing") : t("order_modal.pay_btn")}
                </PrimaryButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderCheckModal;
