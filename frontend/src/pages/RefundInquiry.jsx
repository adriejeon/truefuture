import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

function RefundInquiry() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [paymentAmount, setPaymentAmount] = useState("");
  const [productName, setProductName] = useState("");
  const [paymentDateTime, setPaymentDateTime] = useState("");
  const [transactionId, setTransactionId] = useState(searchParams.get("transactionId") || "");
  const [refundReason, setRefundReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // URL 파라미터에서 거래 정보 가져오기
  useEffect(() => {
    const txId = searchParams.get("transactionId");
    const date = searchParams.get("purchaseDate");
    
    if (txId) {
      setTransactionId(txId);
    }
    if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      setPaymentDateTime(`${date.slice(0, 10)}T00:00`);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!paymentAmount.trim()) {
      alert("결제 금액을 입력해주세요.");
      return;
    }

    if (!productName.trim()) {
      alert("결제한 상품명을 입력해주세요.");
      return;
    }

    const dt = paymentDateTime.trim();
    if (!dt || Number.isNaN(Date.parse(dt))) {
      alert(
        "카드 결제 일시를 날짜와 시·분까지 모두 선택해 주세요."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: "jupiteradrie@gmail.com",
          subject: `[환불 문의] ${user?.email || "알 수 없음"}`,
          type: "refund",
          content: {
            userEmail: user?.email || "알 수 없음",
            userName: user?.user_metadata?.full_name || user?.email || "알 수 없음",
            paymentMethod: "국내카드 결제",
            paymentAmount: paymentAmount.trim(),
            productName: productName.trim(),
            paymentDateTime: dt,
            transactionId: transactionId || "미입력",
            refundReason: refundReason.trim() || "미입력",
          },
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "이메일 전송에 실패했습니다.");
      }

      alert("환불 요청이 접수되었습니다. 검토 후 빠른 시일 내에 처리해드리겠습니다.");
      navigate("/mypage");
    } catch (err) {
      console.error("환불 문의 오류:", err);
      alert(err.message || "환불 요청 전송 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-white">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            뒤로
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">환불 문의</h1>
        </div>

        {/* 환불 정책 안내 */}
        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-6">
          <ul className="space-y-2 text-sm text-gray-800">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>사용하지 않은 별만 환불 가능합니다.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-red-500">✗</span>
              <span>무료 혹은 보너스 별은 환불이 어렵습니다.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>
                결제 후 <span className="underline">7일 이내</span> 요청하셔야 환불이 가능해요.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>
                결제 금액의 <span className="underline">일부만</span> 환불받는 것도 가능해요.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>환불 시 구매하신 별은 차감됩니다.</span>
            </li>
          </ul>
        </div>

        {/* 환불 요청 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* 결제 금액 */}
          <div>
            <label className="block text-gray-900 font-medium mb-2">
              결제 금액 <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="예: 유성 패키지 (1,100원)"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 bg-white"
              required
            />
          </div>

          {/* 결제 상품명 */}
          <div>
            <label className="block text-gray-900 font-medium mb-2">
              결제한 상품명 <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="예: 유성 패키지"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 bg-white"
              required
            />
          </div>

          {/* 카드 결제 일시 */}
          <div>
            <label className="block text-gray-900 font-medium mb-2">
              카드 결제 일시 <span className="text-red-600">*</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">
              날짜와 시·분까지 선택해 주세요. (결제 시점이 정확할수록 확인이 빨라집니다.)
            </p>
            <input
              type="datetime-local"
              value={paymentDateTime}
              onChange={(e) => setPaymentDateTime(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-yellow-500 bg-white"
            />
          </div>

          {/* 거래 ID */}
          {transactionId && (
            <div>
              <label className="block text-gray-900 font-medium mb-2">
                거래 ID
              </label>
              <input
                type="text"
                value={transactionId}
                readOnly
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-600 bg-gray-100 cursor-not-allowed"
              />
            </div>
          )}

          {/* 환불 사유 */}
          <div>
            <label className="block text-gray-900 font-medium mb-2">환불 사유 (선택)</label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="사유를 입력해주시면 서비스 개선에 큰 도움이 됩니다."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 resize-none bg-white"
            />
          </div>

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-300 text-gray-900 font-bold py-4 text-lg rounded-lg transition-colors"
          >
            {isSubmitting ? "전송 중..." : "환불 요청하기"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default RefundInquiry;
