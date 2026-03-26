import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";
import { trackPurchase } from "../utils/analytics";

/** 결제 성공 후 GA4 purchase 전송 (sessionStorage 기반). Fire-and-forget, 서비스 영향 없음. */
function sendPurchaseEventFromStorage() {
  try {
    const uid = sessionStorage.getItem("payment_merchant_uid");
    const raw = sessionStorage.getItem("payment_checkout_items");
    let transactionId = uid || "";
    let value = 0;
    let currency = "KRW";
    let items = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        transactionId = parsed.merchantUid || transactionId;
        value = Number(parsed.price) || 0;
        currency = parsed.currency || "KRW";
        const cat =
          parsed.iconType === "telescope"
            ? "망원경"
            : parsed.iconType === "compass"
              ? "나침반"
              : "탐사선";
        items = [
          {
            item_id: parsed.id || "",
            item_name: parsed.name || "운세권",
            price: value,
            quantity: 1,
            item_category: cat,
          },
        ];
      } catch (_) {}
    }
    if (transactionId || value > 0) {
      trackPurchase({
        transaction_id: transactionId,
        value,
        currency,
        items,
      });
    }
    sessionStorage.removeItem("payment_checkout_items");
  } catch (_) {}
}

function PaymentComplete() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetchStars } = useStars();
  const [status, setStatus] = useState("processing"); // processing, success, error
  const [message, setMessage] = useState("결제 결과를 확인하는 중입니다...");
  const [sessionLoading, setSessionLoading] = useState(true); // 세션 로딩 상태
  const isProcessing = useRef(false); // 중복 호출 방지

  // 1. 세션 로딩 보장: getSession을 직접 호출하여 세션 복구 대기
  useEffect(() => {
    const ensureSession = async () => {
      try {
        setMessage("로그인 정보를 확인하는 중입니다...");
        
        // getSession을 직접 호출하여 세션 복구 대기
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("세션 확인 오류:", sessionError);
          setSessionLoading(false);
          return;
        }

        if (session?.user) {
          setSessionLoading(false);
        } else {
          // 3. 재시도 로직: onAuthStateChange로 세션 대기
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              if (session?.user) {
                setSessionLoading(false);
                subscription.unsubscribe();
              } else if (event === "SIGNED_OUT") {
                console.error("❌ 로그아웃 상태");
                setSessionLoading(false);
                subscription.unsubscribe();
              }
            }
          );

          // 최대 5초 대기 후 타임아웃
          setTimeout(() => {
            console.warn("⚠️ 세션 대기 타임아웃");
            setSessionLoading(false);
            subscription.unsubscribe();
          }, 5000);

          return () => {
            subscription.unsubscribe();
          };
        }
      } catch (err) {
        console.error("❌ 세션 확인 예외:", err);
        setSessionLoading(false);
      }
    };

    ensureSession();
  }, []);

  useEffect(() => {
    const processPayment = async () => {
      // 세션 로딩 중이면 대기
      if (sessionLoading) {
        return;
      }

      // 1. 중복 호출 방지: 이미 처리 중이면 즉시 종료
      if (isProcessing.current) {
        return;
      }

      // 2. 성공 우선 처리: 이미 성공 상태면 무시
      if (status === "success") {
        return;
      }

      // 2. User ID 확보 후 호출: 세션에서 user.id 확인
      let currentUser = user;
      
      // user가 없으면 직접 getUser() 호출
      if (!currentUser) {
        try {
          const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
          
          if (userError || !fetchedUser) {
            console.error("❌ 사용자 정보를 가져올 수 없습니다:", userError);
            isProcessing.current = false;
            setStatus("error");
            setMessage("로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
            return;
          }
          
          currentUser = fetchedUser;
        } catch (err) {
          console.error("❌ getUser() 예외:", err);
          isProcessing.current = false;
          setStatus("error");
          setMessage("로그인 정보를 확인하는 중 오류가 발생했습니다.");
          return;
        }
      }

      // 처리 시작 표시
      isProcessing.current = true;

      try {
        // 모든 URL 파라미터 수집 및 로그
        const allParams = {};
        searchParams.forEach((value, key) => {
          allParams[key] = value;
        });

        // PortOne V2 파라미터 (새 버전)
        const paymentId = searchParams.get("paymentId");
        const code = searchParams.get("code");
        const errorMessage = searchParams.get("message");

        // 모바일 리다이렉트 시 txId로 결제 식별자 전달됨 (imp_uid 대체)
        const txId = searchParams.get("txId");

        // PortOne V1 / KG이니시스 모바일 리다이렉트 파라미터
        const impUid = searchParams.get("imp_uid");
        const impSuccess = searchParams.get("imp_success");
        let merchantUid = searchParams.get("merchant_uid");
        const errorMsg = searchParams.get("error_msg");

        // 모바일 리다이렉트 시 URL에 merchant_uid가 빠진 경우 sessionStorage에서 복구
        if (!merchantUid) {
          try {
            const stored = sessionStorage.getItem("payment_merchant_uid");
            if (stored) merchantUid = stored;
          } catch (_) {}
        }

        // 결제 실패 처리: code 또는 imp_success=false일 때만 실패. txId가 있으면 성공으로 간주하고 검증 진행
        if (code || impSuccess === "false") {
          isProcessing.current = false; // 처리 완료 표시
          setStatus("error");
          const failMessage = errorMessage || errorMsg || "결제가 취소되었거나 실패했습니다.";
          setMessage(failMessage);
          console.error("결제 실패:", failMessage);
          return;
        }

        const finalMerchantUid = merchantUid || null;

        // 2. imp_uid 추출 우선순위: imp_uid(URL) → paymentId(order_xxx, PortOne V2 등록 ID) → txId(UUID)
        // PortOne V2는 requestPayment의 paymentId로 조회해야 하므로 paymentId 우선 사용
        const finalImpUid =
          impUid ||
          paymentId ||  // paymentId(order_xxx)를 우선 사용 - PortOne V2 결제 조회용
          txId ||       // 없으면 txId(UUID) 사용
          null;

        // imp_uid 형식: imp_ 접두사(아임포트), order_ 접두사(PortOne V2 paymentId), 또는 UUID(txId) 허용
        const isValidImpUidFormat =
          !finalImpUid ||
          finalImpUid.startsWith("imp_") ||
          finalImpUid.startsWith("order_") ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalImpUid);
        if (!isValidImpUidFormat) {
          console.error("❌ 잘못된 결제 ID 형식:", finalImpUid);
          isProcessing.current = false;
          setStatus("error");
          setMessage("결제 정보 형식이 올바르지 않습니다. 고객센터에 문의해주세요.");
          return;
        }

        // 3. 검증 로직: imp_uid(txId 포함) 또는 merchant_uid 중 하나라도 있으면 진행
        if (status !== "success") {
          // imp_uid(txId) 또는 merchant_uid 중 하나라도 있어야 함
          if (!finalImpUid && !finalMerchantUid) {
            console.error("❌ imp_uid와 merchant_uid 모두 없습니다. 파라미터:", allParams);
            isProcessing.current = false; // 처리 완료 표시
            setStatus("error");
            setMessage("결제 정보를 찾을 수 없습니다. 고객센터에 문의해주세요.");
            return;
          }

          // 사용자 로그인 확인 (이미 위에서 확인했지만 재확인)
          if (!currentUser || !currentUser.id) {
            console.error("❌ 사용자 정보 없음");
            isProcessing.current = false; // 처리 완료 표시
            setStatus("error");
            setMessage("로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
            return;
          }
        } else {
          // 이미 성공 상태면 더 이상 처리하지 않음
          isProcessing.current = false;
          return;
        }

        // 백엔드 함수 호출하여 운세권 구매 처리
        setMessage("결제를 완료하고 운세권을 충전하고 있습니다...");
        
        // 3. 백엔드 호출: imp_uid가 없으면 merchant_uid만이라도 보내기
        const requestBody = {
          user_id: currentUser.id,
        };
        
        // imp_uid가 있으면 추가, 없으면 merchant_uid만 추가
        if (finalImpUid) {
          requestBody.imp_uid = finalImpUid;
        }
        if (finalMerchantUid) {
          requestBody.merchant_uid = finalMerchantUid;
        }

        // sessionStorage에서 currency, package_id 복구 (PayPal USD 결제 검증용)
        try {
          const raw = sessionStorage.getItem("payment_checkout_items");
          if (raw) {
            const stored = JSON.parse(raw);
            if (stored.currency) requestBody.currency = stored.currency;
            if (stored.id) requestBody.package_id = stored.id;
          }
        } catch (_) {}

        // URL 파라미터에 package_id가 있으면 우선 사용 (sessionStorage보다 신뢰성 높음)
        const urlPackageId = searchParams.get("package_id");
        if (urlPackageId) requestBody.package_id = urlPackageId;

        const { data, error: purchaseError } = await supabase.functions.invoke(
          "purchase-stars",
          {
            body: requestBody,
          }
        );

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
            isProcessing.current = false;
            setStatus("success");
            setMessage(
              "🎉 운세권 구매가 완료되었습니다!\n\n이미 처리된 결제입니다. 운세권이 정상적으로 충전되었습니다."
            );
            try {
              sessionStorage.removeItem("payment_merchant_uid");
            } catch (_) {}
            await refetchStars();
            setTimeout(() => {
              navigate("/purchase", { replace: true });
            }, 3000);
            setTimeout(sendPurchaseEventFromStorage, 0);
            return;
          }

          // 실제 에러인 경우
          console.error("운세권 구매 API 오류:", purchaseError);
          isProcessing.current = false;
          setStatus("error");
          setMessage(
            `운세권 구매 처리 중 오류가 발생했습니다.\n\n오류: ${errorMessage}\n\n고객센터에 문의해주세요.`
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
            isProcessing.current = false;
            setStatus("success");
            setMessage(
              "🎉 운세권 구매가 완료되었습니다!\n\n이미 처리된 결제입니다. 운세권이 정상적으로 충전되었습니다."
            );
            try {
              sessionStorage.removeItem("payment_merchant_uid");
            } catch (_) {}
            await refetchStars();
            setTimeout(() => {
              navigate("/purchase", { replace: true });
            }, 3000);
            setTimeout(sendPurchaseEventFromStorage, 0);
            return;
          }

          // 실제 실패인 경우
          console.error("운세권 구매 실패:", data);
          isProcessing.current = false;
          setStatus("error");
          setMessage(
            `${errorMsg}\n\n결제는 완료되었으니 고객센터에 문의해주세요.`
          );
          return;
        }

        // 성공 처리
        isProcessing.current = false; // 처리 완료 표시
        setStatus("success");
        setMessage(
          `🎉 운세권 구매가 완료되었습니다!\n\n구매한 운세권: ${data.data.paid_stars}장 (데일리: ${data.data.bonus_stars}장)\n새로운 잔액: ${
            data.data.new_balance.paid_stars + data.data.new_balance.bonus_stars
          }장`
        );

        try {
          sessionStorage.removeItem("payment_merchant_uid");
        } catch (_) {}

        // 별 잔액 새로고침
        await refetchStars();

        // 3초 후 구매 페이지로 이동
        setTimeout(() => {
          navigate("/purchase", { replace: true });
        }, 3000);
        setTimeout(sendPurchaseEventFromStorage, 0);
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
          setStatus("success");
          setMessage(
            "🎉 별 충전이 완료되었습니다!\n\n이미 처리된 결제입니다. 별이 정상적으로 충전되었습니다."
          );
          try {
            sessionStorage.removeItem("payment_merchant_uid");
          } catch (_) {}
          await refetchStars();
          setTimeout(() => {
            navigate("/purchase", { replace: true });
          }, 3000);
          setTimeout(sendPurchaseEventFromStorage, 0);
        } else {
          setStatus("error");
          setMessage(
            `결제 처리 중 오류가 발생했습니다.\n\n오류: ${errorMessage}`
          );
        }
      }
    };

    processPayment();
  }, [searchParams, user, navigate, refetchStars, sessionLoading, status]);

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
