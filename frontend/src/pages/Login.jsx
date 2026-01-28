import SocialLoginButtons from "../components/SocialLoginButtons";
import { useAuth } from "../hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
  const { user, loadingAuth } = useAuth();
  const navigate = useNavigate();

  // 이미 로그인한 경우 홈으로 리다이렉트
  useEffect(() => {
    if (!loadingAuth && user) {
      navigate("/");
    }
  }, [user, loadingAuth, navigate]);

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
      <div className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24">
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
      </div>
    </div>
  );
}

export default Login;
