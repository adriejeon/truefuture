import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PrimaryButton from "./PrimaryButton";

/**
 * 운세권 차감/부족 알림 모달
 * @param {object} props
 * @param {boolean} props.isOpen - 모달 표시 여부
 * @param {function} props.onClose - 모달 닫기 콜백
 * @param {"confirm"|"alert"} props.type - 모달 타입 (confirm: 차감 확인, alert: 잔액 부족)
 * @param {number} props.requiredAmount - 필요한 운세권 개수 (운세 1회당)
 * @param {number} props.currentBalance - 현재 보유 운세권 개수 (user_wallets 합계)
 * @param {function} props.onConfirm - 확인 버튼 클릭 시 콜백 (type="confirm"일 때만)
 * @param {string} props.fortuneType - 운세 타입 (표시용)
 */
function StarModal({
  isOpen,
  onClose,
  type = "confirm",
  requiredAmount: requiredAmountProp = 0,
  currentBalance: currentBalanceProp = 0,
  onConfirm,
  fortuneType = "운세",
  required,
  current,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const requiredAmount = Number(requiredAmountProp ?? required ?? 0);
  const currentBalance = Number(currentBalanceProp ?? current ?? 0);

  const equipmentName =
    fortuneType === "오늘 운세"
      ? t("equipment_guide.compass_name")
      : fortuneType === "종합 운세"
        ? t("equipment_guide.probe_name")
        : t("equipment_guide.telescope_name");

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCharge = () => {
    onClose();
    navigate("/purchase");
  };

  const handleConfirmClick = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  if (type === "confirm") {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl max-w-md w-full px-4 py-6 border border-slate-700 animate-[scale-in_0.2s_ease-out]">
          <div className="text-left mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              {t("star_modal.confirm_title", { equipment: equipmentName })}
            </h2>
            <p className="text-slate-300 text-sm">
              {t("star_modal.confirm_subtitle", { fortuneType, equipment: equipmentName })}
            </p>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-4 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">{t("star_modal.required", { equipment: equipmentName })}</span>
              <span className="text-white font-semibold text-lg">{requiredAmount}{t("common.count_unit")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">{t("star_modal.current", { equipment: equipmentName })}</span>
              <span className="text-white font-semibold text-lg">{currentBalance}{t("common.count_unit")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">{t("star_modal.after", { equipment: equipmentName })}</span>
              <span className="text-white font-semibold text-lg">{currentBalance - requiredAmount}{t("common.count_unit")}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold transition-all duration-200"
            >
              {t("common.cancel")}
            </button>
            <PrimaryButton
              variant="gold"
              fullWidth
              onClick={handleConfirmClick}
              className="flex-1"
              data-testid="star-modal-confirm"
            >
              {t("star_modal.use_btn")}
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl max-w-md w-full px-4 py-6 border border-red-500/30 animate-[scale-in_0.2s_ease-out]">
        <div className="text-left mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            {t("star_modal.alert_title", { equipment: equipmentName })}
          </h2>
          <p className="text-slate-300 text-sm">
            {t("star_modal.alert_subtitle", { fortuneType, equipment: equipmentName })}
          </p>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">{t("star_modal.required", { equipment: equipmentName })}</span>
            <span className="text-white font-semibold text-lg">{requiredAmount}{t("common.count_unit")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">{t("star_modal.current_alert", { equipment: equipmentName })}</span>
            <span className="text-red-400 font-semibold text-lg">{currentBalance}{t("common.count_unit")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">{t("star_modal.shortage", { equipment: equipmentName })}</span>
            <span className="text-red-400 font-semibold text-lg">{requiredAmount - currentBalance}{t("common.count_unit")}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold transition-all duration-200"
          >
            {t("common.cancel")}
          </button>
          <PrimaryButton
            variant="gold"
            fullWidth
            onClick={handleCharge}
            className="flex-1"
          >
            {t("star_modal.buy_btn")}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export default StarModal;
