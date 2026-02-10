import { useEffect, useState, useRef } from "react";
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
  const isProcessing = useRef(false); // 중복 호출 방지

  useEffect(() => {
    const processPayment = async () => {
      // 1. 중복 호출 방지: 이미 처리 중이면 즉시 종료
      if (isProcessing.current) {
        console.log("⚠️ 이미 처리 중인 결제 요청이 있습니다. 중복 호출 방지.");
        return;
      }

      // 2. 성공 우선 처리: 이미 성공 상태면 무시
      if (status === "success") {
        console.log("✅ 이미 성공 처리된 결제입니다. 추가 처리 건너뜀.");
        return;
      }

      // 처리 시작 표시
      isProcessing.current = true;

      try {
        // 모든 URL 파라미터 수집 및 로그
        const allParams = {};
        searchParams.forEach((value, key) => {
          allParams[key] = value;
        });
        
        console.log("=== 결제 완료 페이지 진입 ===");
        console.log("전체 URL:", window.location.href);
        console.log("모든 파라미터:", allParams);

        // PortOne V2 파라미터 (새 버전)
        const paymentId = searchParams.get("paymentId");
        const code = searchParams.get("code");
        const errorMessage = searchParams.get("message");

        // PortOne V1 파라미터 (구 아임포트 - 호환성 체크)
        const impUid = searchParams.get("imp_uid");
        const impSuccess = searchParams.get("imp_success");
        const merchantUid = searchParams.get("merchant_uid");
        const errorMsg = searchParams.get("error_msg");

        console.log("V2 파라미터:", { paymentId, code, errorMessage });
        console.log("V1 파라미터:", { impUid, impSuccess, merchantUid, errorMsg });

        // 결제 실패 처리
        if (code || impSuccess === "false") {
          isProcessing.current = false; // 처리 완료 표시
          setStatus("error");
          const failMessage = errorMessage || errorMsg || "결제가 취소되었거나 실패했습니다.";
          setMessage(failMessage);
          console.error("결제 실패:", failMessage);
          return;
        }

        // imp_uid와 merchant_uid를 각각 정확하게 추출
        // imp_uid는 아임포트 결제 고유 ID (imp_로 시작해야 함)
        // merchant_uid는 주문 고유 ID (order_로 시작)
        const finalImpUid = impUid || null;
        const finalMerchantUid = merchantUid || null;

        // imp_uid 검증: imp_로 시작하는지 확인
        if (finalImpUid && !finalImpUid.startsWith("imp_")) {
          console.error("❌ 잘못된 imp_uid 형식:", finalImpUid);
          isProcessing.current = false; // 처리 완료 표시
          setStatus("error");
          setMessage("결제 정보 형식이 올바르지 않습니다. 고객센터에 문의해주세요.");
          return;
        }

        // 4. 파라미터 체크 시점 조절: 성공 상태가 아니면 체크
        if (status !== "success") {
          // imp_uid 필수 확인 (아임포트 API는 imp_uid로만 조회 가능)
          if (!finalImpUid) {
            console.error("❌ imp_uid가 없습니다. 파라미터:", allParams);
            isProcessing.current = false; // 처리 완료 표시
            setStatus("error");
            setMessage("결제 정보를 찾을 수 없습니다. 고객센터에 문의해주세요.");
            return;
          }

          // 사용자 로그인 확인
          if (!user) {
            console.error("사용자 로그인 정보 없음");
            isProcessing.current = false; // 처리 완료 표시
            setStatus("error");
            setMessage("로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
            return;
          }
        } else {
          // 이미 성공 상태면 더 이상 처리하지 않음
          console.log("✅ 이미 성공 상태입니다. 추가 처리 건너뜀.");
          isProcessing.current = false;
          return;
        }

        // 백엔드 함수 호출하여 별 충전 처리
        setMessage("결제를 완료하고 별을 충전하고 있습니다...");
        console.log("백엔드 호출 시작:", {
          user_id: user.id,
          imp_uid: finalImpUid,
          merchant_uid: finalMerchantUid,
        });

        const { data, error: purchaseError } = await supabase.functions.invoke(
          "purchase-stars",
          {
            body: {
              user_id: user.id,
              imp_uid: finalImpUid,
              merchant_uid: finalMerchantUid,
            },
          }
        );

        console.log("백엔드 응답:", { data, purchaseError });

        // 3. "이미 처리된 결제"는 성공으로 간주
        if (purchaseError) {
          const errorMessage = purchaseError.message || JSON.stringify(purchaseError);
          const errorString = String(errorMessage).toLowerCase();
          
          // 이미 처리된 결제인지 확인
          const isAlreadyProcessed = 
            errorString.includes("이미 처리된 결제") ||
            errorString.includes("already processed") ||
            (purchaseError.status === 400 && errorString.includes("이미"));

          if (isAlreadyProcessed) {
            console.log("✅ 이미 처리된 결제입니다. 성공으로 처리합니다.");
            isProcessing.current = false;
            setStatus("success");
            setMessage(
              "🎉 별 충전이 완료되었습니다!\n\n이미 처리된 결제입니다. 별이 정상적으로 충전되었습니다."
            );
            await refetchStars();
            setTimeout(() => {
              navigate("/purchase", { replace: true });
            }, 3000);
            return;
          }

          // 실제 에러인 경우
          console.error("별 충전 API 오류:", purchaseError);
          isProcessing.current = false;
          setStatus("error");
          setMessage(
            `별 충전 처리 중 오류가 발생했습니다.\n\n오류: ${errorMessage}\n\n고객센터에 문의해주세요.`
          );
          return;
        }

        if (!data?.success) {
          const errorMsg = data?.error || "별 충전에 실패했습니다.";
          const errorString = String(errorMsg).toLowerCase();
          
          // 이미 처리된 결제인지 확인
          const isAlreadyProcessed = 
            errorString.includes("이미 처리된 결제") ||
            errorString.includes("already processed");

          if (isAlreadyProcessed) {
            console.log("✅ 이미 처리된 결제입니다. 성공으로 처리합니다.");
            isProcessing.current = false;
            setStatus("success");
            setMessage(
              "🎉 별 충전이 완료되었습니다!\n\n이미 처리된 결제입니다. 별이 정상적으로 충전되었습니다."
            );
            await refetchStars();
            setTimeout(() => {
              navigate("/purchase", { replace: true });
            }, 3000);
            return;
          }

          // 실제 실패인 경우
          console.error("별 충전 실패:", data);
          isProcessing.current = false;
          setStatus("error");
          setMessage(
            `${errorMsg}\n\n결제는 완료되었으니 고객센터에 문의해주세요.`
          );
          return;
        }

        // 성공 처리
        console.log("✅ 별 충전 성공:", data);
        isProcessing.current = false; // 처리 완료 표시
        setStatus("success");
        setMessage(
          `🎉 별 충전이 완료되었습니다!\n\n충전된 별: ${data.data.paid_stars}개 (보너스: ${data.data.bonus_stars}개)\n새로운 잔액: ${
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
        console.error("❌ 결제 처리 예외:", err);
        isProcessing.current = false; // 처리 완료 표시 (에러여도)
        
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorString = errorMessage.toLowerCase();
        
        // 이미 처리된 결제인지 확인
        const isAlreadyProcessed = 
          errorString.includes("이미 처리된 결제") ||
          errorString.includes("already processed");

        if (isAlreadyProcessed) {
          console.log("✅ 이미 처리된 결제입니다. 성공으로 처리합니다.");
          setStatus("success");
          setMessage(
            "🎉 별 충전이 완료되었습니다!\n\n이미 처리된 결제입니다. 별이 정상적으로 충전되었습니다."
          );
          await refetchStars();
          setTimeout(() => {
            navigate("/purchase", { replace: true });
          }, 3000);
        } else {
          setStatus("error");
          setMessage(
            `결제 처리 중 오류가 발생했습니다.\n\n오류: ${errorMessage}`
          );
        }
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
