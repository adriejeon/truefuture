import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import ConversationDrawer from "./ConversationDrawer";
import { colors } from "../constants/colors";
import { getBrandLogoAlt } from "../constants/seoMeta";

function GNB({ theme = "dark" }) {
  const isLight = theme === "light";
  const { t, i18n } = useTranslation();
  const logoSrc = i18n.language?.startsWith("en")
    ? "/assets/logo-en.png"
    : "/assets/logo.png";
  const { user, logout } = useAuth();
  const { stars } = useStars();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const dropdownRef = useRef(null);

  const handleAuthClick = () => {
    if (!user) {
      navigate("/login");
    }
  };

  const getProfileImage = () => {
    if (user?.user_metadata?.avatar_url) {
      return user.user_metadata.avatar_url;
    }
    return null;
  };

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

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(scrollTop > 0);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
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
    setIsDropdownOpen(false);
    navigate("/mypage", { replace: false });
  };

  return (
    <>
      <ConversationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
      <header
        className={`w-full py-4 sm:py-5 sticky top-0 z-50 ${isLight ? "gnb-theme-light border-b border-gray-200" : ""}`}
        style={{
          backgroundColor: isLight
            ? isScrolled
              ? "rgba(255, 255, 255, 0.94)"
              : "#ffffff"
            : isScrolled
              ? "rgba(52, 50, 97, 0.1)"
              : "#343261",
          backdropFilter: isScrolled
            ? isLight
              ? "blur(14px) saturate(160%)"
              : "blur(16px) saturate(100%)"
            : "none",
          WebkitBackdropFilter: isScrolled
            ? isLight
              ? "blur(14px) saturate(160%)"
              : "blur(16px) saturate(100%)"
            : "none",
          boxShadow: isScrolled
            ? isLight
              ? "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)"
              : "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
            : "none",
          transition:
            "background-color 0.15s ease-out, backdrop-filter 0.15s ease-out, box-shadow 0.15s ease-out",
        }}
      >
        <div className="max-w-[600px] mx-auto px-4 relative z-10">
          <div className="flex items-center justify-between relative">
            {/* 좌측: 대화 목록 버튼 */}
            <div className="flex-1 flex items-center justify-start min-w-0">
              {user ? (
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${isLight ? "hover:bg-gray-100" : "hover:bg-white/10"}`}
                  aria-label={t("nav.open_chat_list")}
                >
                  <svg
                    className="w-6 h-6 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: isLight ? "#4b5563" : colors.primary }}
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
                  src={logoSrc}
                  alt={getBrandLogoAlt(i18n.language)}
                  className="h-4 sm:h-5 w-auto object-contain"
                />
              </Link>
            </div>

            {/* 우측: 로그인 버튼 또는 별 잔액 + 프로필 */}
            <div className="flex-1 flex items-center justify-end min-w-0 gap-2 sm:gap-3">
              {!user ? (
                <div className="flex items-center gap-[0.5rem]">
                  <span
                    className="hidden sm:inline-block relative px-2.5 py-1 text-xs font-semibold rounded-[4px] text-slate-900 shadow-sm bg-[var(--event-chip-bg)] after:content-[''] after:absolute after:top-1/2 after:-translate-y-1/2 after:-right-[7px] after:w-0 after:h-0 after:border-y-[6px] after:border-y-transparent after:border-l-[7px] after:border-l-[var(--event-chip-bg)]"
                    style={{ "--event-chip-bg": colors.primary }}
                  >
                    EVENT
                  </span>
                  <button
                    onClick={handleAuthClick}
                    className={`px-4 py-2 text-sm sm:text-base rounded-lg border transition-all duration-200 font-medium ${isLight ? "border-gray-300 bg-gray-900 text-white hover:bg-gray-800" : "bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white border-white/20"}`}
                  >
                    {t("nav.login")}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => navigate("/purchase")}
                    className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${isLight ? "hover:bg-gray-100" : "hover:bg-white/10"}`}
                    aria-label={t("nav.charge_stars")}
                  >
                    <span className="text-yellow-400 text-sm">⭐</span>
                  </button>

                  <div className="relative" ref={dropdownRef}>
                  {getProfileImage() ? (
                    <img
                      src={getProfileImage()}
                      alt="프로필"
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 object-cover cursor-pointer transition-all duration-200 ${isLight ? "border-gray-200 hover:border-gray-300" : "border-white/30 hover:border-white/50"}`}
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    />
                  ) : (
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center font-semibold text-sm sm:text-base cursor-pointer transition-all duration-200 ${isLight ? "border-gray-200 bg-gray-100 text-gray-800 hover:bg-gray-200 hover:border-gray-300" : "bg-white/20 border-white/30 text-white hover:bg-white/30 hover:border-white/50"}`}
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      {getUserInitial()}
                    </div>
                  )}

                  {isDropdownOpen && (
                    <div
                      className={`absolute right-0 mt-2 w-36 rounded-lg shadow-lg overflow-hidden z-50 border ${isLight ? "bg-white border-gray-200" : "bg-slate-800 border-slate-700"}`}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={handleMyPageClick}
                        className={`w-full px-4 py-2 text-sm transition-colors duration-200 text-left ${isLight ? "text-gray-900 hover:bg-gray-50" : "text-white hover:bg-slate-700"}`}
                      >
                        {t("nav.mypage")}
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
                        className={`w-full px-4 py-2 text-sm transition-colors duration-200 text-left border-t ${isLight ? "text-gray-900 hover:bg-gray-50 border-gray-200" : "text-white hover:bg-slate-700 border-slate-700"}`}
                      >
                        {t("nav.logout")}
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
