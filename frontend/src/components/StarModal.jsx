import { useNavigate } from "react-router-dom";
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
  // 하위 호환: required/current 로 넘어온 경우
  required,
  current,
}) {
  const navigate = useNavigate();

  const requiredAmount = Number(requiredAmountProp ?? required ?? 0);
  const currentBalance = Number(currentBalanceProp ?? current ?? 0);

  // fortuneType에 따라 장비 이름 결정
  const equipmentName = fortuneType === "오늘 운세" ? "나침반" : "망원경";

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

  // Confirm 타입: 운세권 차감 확인
  if (type === "confirm") {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl max-w-md w-full px-4 py-6 border border-slate-700 animate-[scale-in_0.2s_ease-out]">
          {/* 헤더 */}
          <div className="text-left mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              {equipmentName}을 사용하시겠습니까?
            </h2>
            <p className="text-slate-300 text-sm">
              {fortuneType}를 확인하려면 {equipmentName}이 필요합니다
            </p>
          </div>

          {/* 정보 */}
          <div className="bg-slate-900/50 rounded-xl p-4 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">필요한 {equipmentName}</span>
              <span className="text-white font-semibold text-lg">
                {requiredAmount}개
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">
                보유 중인 {equipmentName}
              </span>
              <span className="text-white font-semibold text-lg">
                {currentBalance}개
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">사용 후 {equipmentName}</span>
              <span className="text-white font-semibold text-lg">
                {currentBalance - requiredAmount}개
              </span>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold transition-all duration-200"
            >
              취소
            </button>
            <PrimaryButton
              variant="gold"
              fullWidth
              onClick={handleConfirmClick}
              className="flex-1"
            >
              사용
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  // Alert 타입: 잔액 부족
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl max-w-md w-full px-4 py-6 border border-red-500/30 animate-[scale-in_0.2s_ease-out]">
        {/* 헤더 */}
        <div className="text-left mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">{equipmentName}이 부족합니다</h2>
          <p className="text-slate-300 text-sm">
            {fortuneType}를 보려면 {equipmentName}을 구매해주세요
          </p>
        </div>

        {/* 정보 */}
        <div className="bg-slate-900/50 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">필요한 {equipmentName}</span>
            <span className="text-white font-semibold text-lg">{requiredAmount}개</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">
              현재 보유 {equipmentName}
            </span>
            <span className="text-red-400 font-semibold text-lg">{currentBalance}개</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">부족한 {equipmentName}</span>
            <span className="text-red-400 font-semibold text-lg">
              {requiredAmount - currentBalance}개
            </span>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold transition-all duration-200"
          >
            취소
          </button>
          <PrimaryButton
            variant="gold"
            fullWidth
            onClick={handleCharge}
            className="flex-1"
          >
            구매
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export default StarModal;
