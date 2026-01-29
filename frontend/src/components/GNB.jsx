import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function GNB() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleAuthClick = () => {
    // 로그인 상태가 아니면 로그인 페이지로 이동
    if (!user) {
      navigate("/login");
    }
  };

  // 프로필 이미지 또는 기본 아바타 가져오기
  const getProfileImage = () => {
    if (user?.user_metadata?.avatar_url) {
      return user.user_metadata.avatar_url;
    }
    return null;
  };

  // 사용자 이름 또는 이니셜 가져오기
  const getUserInitial = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.charAt(0).toUpperCase();
    }
    if (user?.user_metadata?.name) {
      return user.user_metadata.name.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    await logout();
    setIsDropdownOpen(false);
    navigate("/");
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
              className="h-6 sm:h-8 w-auto object-contain"
            />
          </Link>

          {/* 로그인 버튼 또는 프로필 이미지 */}
          {!user ? (
            <button
              onClick={handleAuthClick}
              className="px-4 py-2 text-sm sm:text-base bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-lg border border-white/20 transition-all duration-200 font-medium"
            >
              로그인
            </button>
          ) : (
            <div className="relative flex-shrink-0" ref={dropdownRef}>
              {getProfileImage() ? (
                <img
                  src={getProfileImage()}
                  alt="프로필"
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 object-cover cursor-pointer hover:border-white/50 transition-all duration-200"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                />
              ) : (
                <div
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-semibold text-sm sm:text-base cursor-pointer hover:bg-white/30 hover:border-white/50 transition-all duration-200"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  {getUserInitial()}
                </div>
              )}

              {/* 드롭다운 메뉴 */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden z-50">
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors duration-200 text-left"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default GNB;
