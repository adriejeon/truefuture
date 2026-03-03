import SocialLoginButtons from "../components/SocialLoginButtons";
import { useAuth } from "../hooks/useAuth";
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

function Login() {
  const { user, loadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 이미 로그인한 경우: 이전 페이지(from) 또는 홈으로 리다이렉트
  useEffect(() => {
    if (!loadingAuth && user) {
      const from = location.state?.from?.pathname;
      navigate(from || "/", { replace: true });
    }
  }, [user, loadingAuth, navigate, location.state?.from?.pathname]);

  if (loadingAuth) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm sm:text-base">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-8 sm:py-12">
      <div className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24">
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            로그인
          </h1>
          <p className="text-center text-slate-300 text-sm sm:text-base">
            로그인 후 생년월일시간을 입력하고 운세를 확인하실 수 있습니다
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 md:p-8 shadow-xl border border-slate-700">
          <SocialLoginButtons />
        </div>

        {/* 이벤트 안내 영역 */}
        <div className="mt-6 p-4 sm:p-5 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30">
          <p className="text-amber-200 font-medium text-center text-sm sm:text-base mb-1">
            지금 회원 가입 하시면 망원경 1개를 무료로 지급합니다!
          </p>
          <p className="text-amber-100/90 text-center text-sm sm:text-base">
            지금 바로 나의 진짜미래를 옅보세요!
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
