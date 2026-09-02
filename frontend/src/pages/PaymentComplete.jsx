import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";
import { trackPurchase } from "../utils/analytics";
import {
  parseFnError,
  describeFnError,
  toUserFacingError,
  isAlreadyProcessedResponse,
} from "../utils/fnError";

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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { refetchStars } = useStars();
  const [status, setStatus] = useState("processing");
  const [message, setMessage] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const isProcessing = useRef(false);
  /** 성공이든 실패든 한 번 결론이 나면 자동 재호출을 막는 게이트 */
  const doneRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. 세션 로딩 보장: getSession을 직접 호출하여 세션 복구 대기
  useEffect(() => {
    const ensureSession = async () => {
      try {
        setMessage(t("payment_complete.checking_login"));

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
            async (event, changedSession) => {
              if (changedSession?.user) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback((nextStatus, nextMessage, options = {}) => {
    doneRef.current = true;
    isProcessing.current = false;
    if (!isMountedRef.current) return;
    setStatus(nextStatus);
    setMessage(nextMessage);
    setNeedsLogin(!!options.needsLogin);
  }, []);

  const finishSuccess = useCallback(
    async (successMessage) => {
      finish("success", successMessage);
      try {
        sessionStorage.removeItem("payment_merchant_uid");
      } catch (_) {}
      await refetchStars();
      setTimeout(() => {
        navigate("/purchase", { replace: true });
      }, 3000);
      setTimeout(sendPurchaseEventFromStorage, 0);
    },
    [finish, navigate, refetchStars]
  );

  const processPayment = useCallback(async () => {
    // 결론이 난 뒤에는 사용자가 "다시 확인"을 누르기 전까지 재호출하지 않는다
    if (doneRef.current || isProcessing.current) return;
    isProcessing.current = true;

    // User ID 확보 후 호출: 세션에서 user.id 확인
    let currentUser = user;
    if (!currentUser) {
      try {
        const { data: { user: fetchedUser }, error: userError } =
          await supabase.auth.getUser();
        if (userError || !fetchedUser) {
          console.error("❌ 사용자 정보를 가져올 수 없습니다:", userError);
          finish("error", t("payment_complete.error_login_missing"), { needsLogin: true });
          return;
        }
        currentUser = fetchedUser;
      } catch (err) {
        console.error("❌ getUser() 예외:", err);
        finish("error", t("payment_complete.error_login_missing"), { needsLogin: true });
        return;
      }
    }

    try {
      // PortOne V2 파라미터
      const paymentId = searchParams.get("paymentId");
      const code = searchParams.get("code");
      const redirectMessage = searchParams.get("message");

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

      // 결제 실패/취소
      if (code || impSuccess === "false") {
        const failMessage =
          redirectMessage || errorMsg || t("payment_complete.error_payment_cancelled");
        console.error("결제 실패:", failMessage);
        finish("error", failMessage);
        return;
      }

      const finalMerchantUid = merchantUid || null;

      // 결제 ID: imp_uid(URL) → paymentId(PortOne V2 결제 ID) 순.
      // txId(PortOne 거래번호)는 결제 조회 API 의 결제 ID 가 아니므로 사용하지 않는다.
      let finalImpUid = impUid || paymentId || null;

      // UUID(=txId 형태)는 결제 조회 API 의 결제 ID 가 아니므로 결제 ID 로 쓰지 않는다.
      const looksLikeTxId =
        !!finalImpUid &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalImpUid);
      if (looksLikeTxId) {
        console.warn("⚠️ txId 형태의 결제 ID 는 사용하지 않습니다:", finalImpUid);
        finalImpUid = null;
      }
      if (!finalImpUid && !finalMerchantUid) {
        console.error("❌ 사용할 수 있는 결제 ID(imp_uid/merchant_uid)가 없습니다.");
        finish("error", t("payment_complete.error_payment_info_missing"));
        return;
      }

      if (!currentUser?.id) {
        console.error("❌ 사용자 정보 없음");
        finish("error", t("payment_complete.error_login_missing"), { needsLogin: true });
        return;
      }

      if (isMountedRef.current) setMessage(t("payment_complete.charging"));

      const requestBody = { user_id: currentUser.id };
      if (finalImpUid) requestBody.imp_uid = finalImpUid;
      if (finalMerchantUid) requestBody.merchant_uid = finalMerchantUid;

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
        { body: requestBody }
      );

      if (purchaseError) {
        const parsed = await parseFnError(purchaseError);
        // 신버전은 200 already_processed 로 오지만, 구버전 서버는 400 + 문구로 온다
        if (isAlreadyProcessedResponse(parsed.code, parsed.message)) {
          await finishSuccess(t("payment_complete.already_processed"));
          return;
        }
        console.error("운세권 구매 API 오류:", parsed);
        const needsLogin = parsed.status === 401 || parsed.code === "UNAUTHORIZED";
        finish(
          "error",
          needsLogin
            ? describeFnError(parsed, t)
            : t("payment_complete.error_with_contact", {
                message: describeFnError(parsed, t),
              }),
          { needsLogin }
        );
        return;
      }

      // 이미 처리된 결제(신버전 200)
      if (data?.already_processed && !data?.data) {
        await finishSuccess(t("payment_complete.already_processed"));
        return;
      }

      if (!data?.success) {
        if (isAlreadyProcessedResponse(data?.code, data?.error)) {
          await finishSuccess(t("payment_complete.already_processed"));
          return;
        }
        console.error("운세권 구매 실패:", data);
        finish(
          "error",
          t("payment_complete.error_with_contact", {
            message: data?.error || t("errors.generic"),
          })
        );
        return;
      }

      // 성공 처리 — 탐사선(probe)까지 합산해 안내
      const granted = data.data || {};
      const balance = granted.new_balance || {};
      const totalBought =
        (granted.paid_stars ?? 0) + (granted.bonus_stars ?? 0) + (granted.probe_stars ?? 0);
      const newTotal =
        (balance.paid_stars ?? 0) + (balance.bonus_stars ?? 0) + (balance.probe_stars ?? 0);

      await finishSuccess(
        t("payment_complete.success_body", { count: totalBought, balance: newTotal })
      );
    } catch (err) {
      console.error("❌ 결제 처리 예외:", err);
      finish("error", toUserFacingError(err, t));
    }
  }, [searchParams, user, t, finish, finishSuccess]);

  useEffect(() => {
    if (sessionLoading) return;
    processPayment();
  }, [sessionLoading, attempt, processPayment]);

  const handleRetry = () => {
    doneRef.current = false;
    isProcessing.current = false;
    setStatus("processing");
    setNeedsLogin(false);
    setMessage(t("payment_complete.charging"));
    setAttempt((n) => n + 1);
  };

  const handleGoLogin = () => {
    // 결제 쿼리를 유지한 채 로그인 후 이 URL 로 복귀 → 자동으로 재검증된다
    navigate("/login", {
      state: {
        from: {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 text-center">
          {status === "processing" && (
            <div className="space-y-6">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto"></div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {t("payment_complete.processing_title")}
                </h2>
                <p className="text-slate-300 text-sm whitespace-pre-line">
                  {message}
                </p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-6">
              <div className="text-6xl">✅</div>
              <div>
                <h2 className="text-2xl font-bold text-green-400 mb-2">
                  {t("payment_complete.success_title")}
                </h2>
                <p className="text-slate-300 text-sm whitespace-pre-line">
                  {message}
                </p>
                <p className="text-slate-400 text-xs mt-4">
                  {t("payment_complete.redirecting")}
                </p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-6">
              <div className="text-6xl">❌</div>
              <div>
                <h2 className="text-2xl font-bold text-red-400 mb-2">
                  {t("payment_complete.error_title")}
                </h2>
                <p className="text-slate-300 text-sm whitespace-pre-line">
                  {message}
                </p>
              </div>
              {needsLogin ? (
                <button
                  onClick={handleGoLogin}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  {t("payment_complete.login_button")}
                </button>
              ) : (
                <button
                  onClick={handleRetry}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  {t("payment_complete.retry_button")}
                </button>
              )}
              <button
                onClick={() => navigate("/purchase", { replace: true })}
                className="w-full text-slate-400 hover:text-white text-sm underline transition-colors duration-200"
              >
                {t("payment_complete.back_to_purchase")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaymentComplete;
