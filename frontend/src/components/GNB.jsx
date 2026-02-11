import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import ConversationDrawer from "./ConversationDrawer";
import { colors } from "../constants/colors";

function GNB() {
  const { user, logout } = useAuth();
  const { stars } = useStars();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
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

  // 스크롤 감지
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(scrollTop > 0);
    };

    window.addEventListener("scroll", handleScroll);
    // 초기 상태 확인
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      // 드롭다운 내부 요소 클릭은 무시
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      // 약간의 지연을 두어 버튼 클릭 이벤트가 먼저 처리되도록 함
      const timeoutId = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    await logout();
    setIsDropdownOpen(false);
    navigate("/");
  };

  const handleMyPageClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("handleMyPageClick 호출됨, navigate 실행 전");
    setIsDropdownOpen(false);
    console.log("navigate 실행 직전");
    navigate("/mypage", { replace: false });
    console.log("navigate 실행 완료");
  };

  return (
    <>
      <ConversationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
      <header
        className="w-full py-4 sm:py-5 sticky top-0 z-50"
        style={{
          backgroundColor: isScrolled ? "rgba(52, 50, 97, 0.1)" : "#343261",
          backdropFilter: isScrolled ? "blur(16px) saturate(100%)" : "none",
          WebkitBackdropFilter: isScrolled
            ? "blur(16px) saturate(100%)"
            : "none",
          boxShadow: isScrolled
            ? "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
            : "none",
          transition:
            "background-color 0.15s ease-out, backdrop-filter 0.15s ease-out, box-shadow 0.15s ease-out",
        }}
      >
        <div className="max-w-[600px] mx-auto px-4 relative z-10">
          <div className="flex items-center justify-between relative">
            {/* 좌측: 대화 목록 버튼 (로그인 시) 또는 빈 공간 */}
            <div className="flex-1 flex items-center justify-start min-w-0">
              {user ? (
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
                  aria-label="대화 목록 열기"
                >
                  <svg
                    className="w-6 h-6 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: colors.primary }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </button>
              ) : null}
            </div>

            {/* 가운데: 로고 */}
            <div className="absolute left-1/2 -translate-x-1/2">
              <Link to="/" className="flex-shrink-0 block">
                <img
                  src="/assets/logo.png"
                  alt="진짜미래"
                  className="h-5 sm:h-6 w-auto object-contain"
                />
              </Link>
            </div>

            {/* 우측: 로그인 버튼 또는 별 잔액 + 프로필 이미지 */}
            <div className="flex-1 flex items-center justify-end min-w-0 gap-2 sm:gap-3">
              {!user ? (
                <button
                  onClick={handleAuthClick}
                  className="px-4 py-2 text-sm sm:text-base bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-lg border border-white/20 transition-all duration-200 font-medium"
                >
                  로그인
                </button>
              ) : (
                <>
                  {/* 별 잔액 버튼 */}
                  <button
                    onClick={() => navigate("/purchase")}
                    className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
                    aria-label="별 충전하기"
                  >
                    <span className="text-yellow-400 text-sm">⭐</span>
                  </button>

                  <div className="relative" ref={dropdownRef}>
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
                    <div 
                      className="absolute right-0 mt-2 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden z-50"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={handleMyPageClick}
                        className="w-full px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors duration-200 text-left"
                      >
                        마이페이지
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-full px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors duration-200 text-left border-t border-slate-700"
                      >
                        로그아웃
                      </button>
                    </div>
                  )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

export default GNB;
