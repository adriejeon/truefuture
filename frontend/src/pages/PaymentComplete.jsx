import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";

function PaymentComplete() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetchStars } = useStars();
  const [status, setStatus] = useState("processing"); // processing, success, error
  const [message, setMessage] = useState("결제 결과를 확인하는 중입니다...");

  useEffect(() => {
    const processPayment = async () => {
      try {
        // URL 파라미터에서 결제 정보 추출
        const paymentId = searchParams.get("paymentId");
        const code = searchParams.get("code");
        const message = searchParams.get("message");

        console.log("결제 완료 페이지 진입:", { paymentId, code, message });

        // 결제 실패한 경우
        if (code) {
          setStatus("error");
          setMessage(message || "결제가 취소되었거나 실패했습니다.");
          return;
        }

        // paymentId가 없는 경우
        if (!paymentId) {
          setStatus("error");
          setMessage("결제 정보를 찾을 수 없습니다.");
          return;
        }

        // 사용자 로그인 확인
        if (!user) {
          setStatus("error");
          setMessage("로그인 정보를 확인할 수 없습니다.");
          return;
        }

        // 백엔드 함수 호출하여 별 충전 처리
        setMessage("결제를 완료하고 별을 충전하고 있습니다...");

        const { data, error: purchaseError } = await supabase.functions.invoke(
          "purchase-stars",
          {
            body: {
              user_id: user.id,
              imp_uid: paymentId,
              merchant_uid: paymentId,
            },
          }
        );

        if (purchaseError) {
          console.error("별 충전 오류:", purchaseError);
          setStatus("error");
          setMessage("별 충전 처리 중 오류가 발생했습니다.");
          return;
        }

        if (!data?.success) {
          console.error("별 충전 실패:", data);
          setStatus("error");
          setMessage(data?.error || "별 충전에 실패했습니다.");
          return;
        }

        // 성공 처리
        console.log("별 충전 성공:", data);
        setStatus("success");
        setMessage(
          `🎉 별 충전이 완료되었습니다!\n\n새로운 잔액: ${
            data.data.new_balance.paid_stars + data.data.new_balance.bonus_stars
          }개`
        );

        // 별 잔액 새로고침
        await refetchStars();

        // 3초 후 구매 페이지로 이동
        setTimeout(() => {
          navigate("/purchase", { replace: true });
        }, 3000);
      } catch (err) {
        console.error("결제 처리 오류:", err);
        setStatus("error");
        setMessage("결제 처리 중 오류가 발생했습니다.");
      }
    };

    processPayment();
  }, [searchParams, user, navigate, refetchStars]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 text-center">
          {/* 로딩 상태 */}
          {status === "processing" && (
            <div className="space-y-6">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto"></div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  결제 처리중
                </h2>
                <p className="text-slate-300 text-sm whitespace-pre-line">
                  {message}
                </p>
              </div>
            </div>
          )}

          {/* 성공 상태 */}
          {status === "success" && (
            <div className="space-y-6">
              <div className="text-6xl">✅</div>
              <div>
                <h2 className="text-2xl font-bold text-green-400 mb-2">
                  결제 완료
                </h2>
                <p className="text-slate-300 text-sm whitespace-pre-line">
                  {message}
                </p>
                <p className="text-slate-400 text-xs mt-4">
                  잠시 후 자동으로 이동합니다...
                </p>
              </div>
            </div>
          )}

          {/* 오류 상태 */}
          {status === "error" && (
            <div className="space-y-6">
              <div className="text-6xl">❌</div>
              <div>
                <h2 className="text-2xl font-bold text-red-400 mb-2">
                  결제 실패
                </h2>
                <p className="text-slate-300 text-sm whitespace-pre-line">
                  {message}
                </p>
              </div>
              <button
                onClick={() => navigate("/purchase", { replace: true })}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                구매 페이지로 돌아가기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaymentComplete;
