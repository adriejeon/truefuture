import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function GNB() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleAuthClick = () => {
    // 로그인 상태가 아니면 로그인 페이지로 이동
    if (!user) {
      navigate("/login");
    }
  };

  return (
    <header
      className="w-full py-4 sm:py-5 relative z-10"
      style={{ backgroundColor: "#343261" }}
    >
      <div className="max-w-[600px] mx-auto px-6">
        <div className="flex items-center justify-between">
          {/* 로고 */}
          <Link to="/" className="flex-shrink-0">
            <img
              src="/assets/logo.png"
              alt="진짜미래"
              className="h-8 sm:h-10 w-auto object-contain"
            />
          </Link>

          {/* 로그인/회원가입 버튼 */}
          {!user && (
            <button
              onClick={handleAuthClick}
              className="px-4 py-2 text-sm sm:text-base bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-lg border border-white/20 transition-all duration-200 font-medium"
            >
              로그인
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default GNB;
