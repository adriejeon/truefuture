import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { registerReferralIfPending } from "../utils/referral";

/**
 * OAuth 로그인 후 리다이렉트되는 콜백 페이지.
 * URL 해시의 access_token을 세션으로 복원한 뒤 홈으로 이동합니다.
 * 세션이 복원되지 않으면 로그인 페이지로 보냅니다.
 * ref(초대 코드)가 저장되어 있으면 register_referral RPC 호출 (실패해도 로그인 흐름은 유지).
 */
function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("로그인 처리 중...");

  const goHome = () => navigate("/", { replace: true });

  useEffect(() => {
    let cancelled = false;

    const finishAuth = async () => {
      try {
        const { data: { session }, error } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null }, error: new Error("Supabase 없음") };

        if (cancelled) return;

        if (error) {
          setMessage("로그인 확인에 실패했습니다.");
          setTimeout(() => navigate("/login", { replace: true }), 1500);
          return;
        }

        if (session?.user) {
          setMessage("로그인되었습니다.");
          try {
            await registerReferralIfPending(supabase, session.user.id);
          } catch (e) {
            console.warn("[referral] 추천 등록 실패 (진입 계속):", e);
          }
          goHome();
          return;
        }

        if (typeof window !== "undefined" && window.location.hash && supabase) {
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
              if (cancelled) return;
              if (newSession?.user) {
                setMessage("로그인되었습니다.");
                try {
                  await registerReferralIfPending(supabase, newSession.user.id);
                } catch (e) {
                  console.warn("[referral] 추천 등록 실패 (진입 계속):", e);
                }
                subscription?.unsubscribe();
                goHome();
              }
            }
          );
          setTimeout(() => {
            if (cancelled) return;
            subscription?.unsubscribe();
            setMessage("로그인에 실패했습니다.");
            setTimeout(() => navigate("/login", { replace: true }), 1500);
          }, 5000);
          return;
        }

        setMessage("로그인 정보를 찾을 수 없습니다.");
        setTimeout(() => navigate("/login", { replace: true }), 1500);
      } catch (err) {
        if (!cancelled) {
          setMessage("로그인 처리 중 오류가 발생했습니다.");
          setTimeout(() => navigate("/login", { replace: true }), 1500);
        }
      }
    };

    finishAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="w-full flex items-center justify-center py-20">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4" />
        <p className="text-slate-400 text-sm sm:text-base">{message}</p>
      </div>
    </div>
  );
}

export default AuthCallback;
