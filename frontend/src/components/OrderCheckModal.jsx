import { useState } from "react";
import PrimaryButton from "./PrimaryButton";

/**
 * 주문 확인 모달 (PG사 심사 기준 충족)
 * @param {object} props
 * @param {boolean} props.isOpen - 모달 표시 여부
 * @param {function} props.onClose - 모달 닫기 콜백
 * @param {object} props.packageInfo - 선택한 패키지 정보
 * @param {function} props.onConfirm - 결제 진행 콜백
 * @param {boolean} props.loading - 로딩 상태
 * @param {boolean} props.isLifetimeFortune - 종합 운세 여부
 */
function OrderCheckModal({ isOpen, onClose, packageInfo, onConfirm, loading = false, isLifetimeFortune = false }) {
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;
  if (!isLifetimeFortune && !packageInfo) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (agreed && !loading) {
      onConfirm();
    }
  };

  // 패키지 타입에 따른 사용처 설명
  const getUsageDescription = () => {
    if (isLifetimeFortune) {
      return `이 상품은 프로필당 1회만 구매 가능한 '종합 운세' 1회 관람권입니다. 구매 즉시 운세를 확인하실 수 있습니다.`;
    }
    if (packageInfo.paid > 0) {
      // 망원경 패키지
      return `망원경 1개로 '자유 질문', '진짜 궁합' 1회를 관측할 수 있습니다.`;
    } else {
      // 나침반 패키지
      return `나침반 1개로 '데일리 운세' 1회를 확인할 수 있습니다.`;
    }
  };

  // 표시할 정보 (종합 운세인 경우 고정값 사용)
  const displayInfo = isLifetimeFortune 
    ? { name: "종합 운세", icon: "🌌", description: "진짜 인생 사용 설명서", price: 1990 }
    : packageInfo;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-700">
        {/* 헤더 */}
        <div className="sticky top-0 bg-gradient-to-br from-slate-800 to-slate-900 border-b border-slate-700 p-6 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">주문 확인 및 결제</h2>
            <button
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-6">
          {/* 주문 상품 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">주문 상품</h3>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
              <div className="flex items-start gap-3">
                <span className="text-3xl">{displayInfo.icon}</span>
                <div className="flex-1">
                  <h4 className="text-white font-semibold mb-1">{displayInfo.name}</h4>
                  <p className="text-slate-400 text-sm">{displayInfo.description}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 상세 설명 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">상세 설명</h3>
            <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/30">
              <p className="text-blue-200 text-sm leading-relaxed">
                💡 {getUsageDescription()}
              </p>
            </div>
          </div>

          {/* 유효기간 */}
          {!isLifetimeFortune && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">유효기간</h3>
              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                <p className="text-slate-300 text-sm">
                  📅 구매일로부터 <span className="text-yellow-400 font-semibold">30일간 유효</span>
                </p>
                <p className="text-slate-400 text-xs mt-2">
                  * 기간 내 미사용 시 자동 소멸됩니다.
                </p>
              </div>
            </div>
          )}

          {/* 결제 금액 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">결제 금액</h3>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">최종 결제 금액</span>
                <span className="text-2xl font-bold text-white">
                  {displayInfo.price.toLocaleString()}
                  <span className="text-slate-400 text-base ml-1">원</span>
                </span>
              </div>
            </div>
          </div>

          {/* 카드 안내 */}
          <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/30">
            <p className="text-red-300 text-sm font-medium">
              ⚠️ 현대카드, 삼성카드는 결제사 정책으로 지원되지 않습니다.
            </p>
          </div>

          {/* 약관 동의 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">취소/환불 규정 및 동의</h3>
            <label className="flex items-start gap-3 bg-slate-900/50 rounded-xl p-4 border border-slate-700 cursor-pointer hover:border-slate-600 transition-colors">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={loading}
                className="mt-1 w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 disabled:opacity-50"
              />
              <div className="flex-1">
                <p className="text-slate-200 text-sm font-medium mb-2">
                  (필수) 위 주문 내용을 확인하였으며, 구매 진행에 동의합니다.
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  • 디지털 콘텐츠 특성상 사용 후 환불이 불가합니다.<br />
                  • 구매일로부터 7일 이내 미사용 시 전액 환불 가능합니다.<br />
                  • 일부 사용한 경우 환불 수수료(잔액의 10% 또는 최소 1,000원)를 공제 후 환불됩니다.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="sticky bottom-0 bg-gradient-to-br from-slate-800 to-slate-900 border-t border-slate-700 p-6">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소
            </button>
            <PrimaryButton
              variant="gold"
              fullWidth
              onClick={handleConfirm}
              disabled={!agreed || loading}
              className="flex-1"
            >
              {loading ? "처리 중..." : "결제하기"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderCheckModal;
