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

  // 주문 상품 표시명: 망원경+보너스는 "망원경 N개 + 나침반 N개 보너스", 그 외는 상품명만
  const orderProductName = isLifetimeFortune
    ? "종합 운세"
    : packageInfo.paid > 0 && packageInfo.bonus > 0
      ? `${packageInfo.name} + 나침반 ${packageInfo.bonus}개 보너스`
      : packageInfo.name;

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
    <div className="fixed inset-0 z-[10000] bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="w-full h-full flex flex-col overflow-hidden">
        {/* 스크롤 가능한 컨텐츠 영역 (min-h-0으로 flex 자식이 줄어들어 스크롤 동작) */}
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
            뒤로
          </button>
          <h2 className="text-xl font-bold text-white">주문 확인 및 결제</h2>
        </div>

        {/* 본문 */}
        <div className="px-4 py-4 pb-8 space-y-4 max-w-lg mx-auto">
          {/* 주문 상품 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-1">주문 상품</h3>
            <h4 className="text-white font-semibold">{orderProductName}</h4>
          </div>

          {/* 상세 설명 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-1">상세 설명</h3>
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
            <h3 className="text-sm font-semibold text-slate-300">최종 결제 금액</h3>
            <span className="text-xl font-bold text-white">
              {displayInfo.price.toLocaleString()}
              <span className="text-slate-400 text-sm ml-1">원</span>
            </span>
          </div>

          {/* 약관 동의 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-1">취소/환불 규정 및 동의</h3>
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
                  (필수) 위 주문 내용을 확인하였으며, 구매 진행에 동의합니다.
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {isLifetimeFortune ? (
                    <>
                      본 상품은 교환권이 아닌 단건 구매 상품이며, 결제 완료 즉시 &apos;종합 운세&apos;를 확인하실 수 있습니다.<br />
                      결제 완료 시점에 이용이 시작되며, 이용 후에는 환불이 불가합니다. 결제 완료 전에는 주문을 취소할 수 있습니다.
                    </>
                  ) : (
                    <>
                      본 상품은 구매일로부터 90일(3개월)간 사용 가능한 모바일 교환권입니다.<br />
                      사용 기준: &apos;질문하기(결과보기)&apos;를 클릭하여 결과가 조회된 시점을 사용으로 간주하며, 사용 후에는 환불이 불가합니다.<br />
                      미사용 환불: 구매 후 7일 이내에는 전액 환불 가능합니다.<br />
                      유효기간 경과: 유효기간(90일)이 지난 후에는 사용이 불가능하며, 관련 법령에 따라 결제금액의 90%에 대해 환불을 요청하실 수 있습니다.
                    </>
                  )}
                </p>
              </div>
            </label>
          </div>

          {/* 유효기간 */}
          {!isLifetimeFortune && (
            <div className="-mt-2">
              <p className="text-slate-500 text-xs text-center">
                구매일로부터 90일간 유효합니다. 기간 내 미사용 시 자동 소멸됩니다.
              </p>
            </div>
          )}
        </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex-shrink-0 border-t border-slate-700 px-4 py-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="max-w-lg mx-auto flex gap-3">
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
