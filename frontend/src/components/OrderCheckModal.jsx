import { useState } from "react";
import PrimaryButton from "./PrimaryButton";

// 아이콘 컴포넌트
const TelescopeIcon = ({ className = "w-8 h-8" }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    {/* 별 아이콘 (망원경으로 별을 보는 의미) */}
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const CompassIcon = ({ className = "w-8 h-8" }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="12" r="10" strokeWidth={2} />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 2v4M12 18v4M2 12h4M18 12h4"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 6l-3 6 3 6 3-6-3-6z"
    />
  </svg>
);

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
    ? { name: "종합 운세", icon: "🌌", description: "진짜 인생 사용 설명서", price: 2990 }
    : packageInfo;

  // 아이콘 렌더링 함수
  const renderIcon = () => {
    if (isLifetimeFortune) {
      return <span className="text-3xl">{displayInfo.icon}</span>;
    }
    if (packageInfo.iconType === "telescope") {
      return <TelescopeIcon className="w-8 h-8 text-white" />;
    } else if (packageInfo.iconType === "compass") {
      return <CompassIcon className="w-8 h-8 text-white" />;
    }
    return <span className="text-3xl">{displayInfo.icon}</span>;
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[480px] border border-slate-700 flex flex-col overflow-hidden">
        {/* 스크롤 가능한 컨텐츠 영역 */}
        <div className="flex-1 overflow-y-auto modal-scrollbar">
        {/* 헤더 */}
        <div className="px-4 py-6 pb-0">
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
        <div className="px-4 py-6 space-y-6">
          {/* 주문 상품 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">주문 상품</h3>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
              <div className="flex flex-col">
                <h4 className="text-white font-semibold mb-1">{displayInfo.name}</h4>
                <p className="text-slate-400 text-sm">{displayInfo.description}</p>
              </div>
            </div>
          </div>

          {/* 상세 설명 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">상세 설명</h3>
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

          {/* 유효기간 */}
          {!isLifetimeFortune && (
            <div className="-mt-4">
              <p className="text-slate-500 text-xs text-center">
                구매일로부터 30일간 유효합니다. 기간 내 미사용 시 자동 소멸됩니다.
              </p>
            </div>
          )}
        </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex-shrink-0 bg-gradient-to-br from-slate-800 to-slate-900 border-t border-slate-700 px-4 py-6">
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
              {loading ? "처리 중..." : "결제"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderCheckModal;
