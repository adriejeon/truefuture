import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SocialLoginButtons from "../components/SocialLoginButtons";
import FortuneResult from "../components/FortuneResult";
import BottomNavigation from "../components/BottomNavigation";
import ProfileModal from "../components/ProfileModal";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import {
  detectInAppBrowser,
  redirectToExternalBrowser,
  getBrowserGuideMessage,
} from "../utils/inAppBrowserDetector";
import {
  getProfileModalDismissed,
  setProfileModalDismissed,
  clearProfileModalDismissed,
} from "../utils/profileModalStorage";
import { colors } from "../constants/colors";

function FavoriteStarIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0"
      style={{
        width: "0.875rem",
        height: "0.875rem",
        maskImage: "url(/assets/favorite.svg)",
        WebkitMaskImage: "url(/assets/favorite.svg)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        backgroundColor: colors.primary,
      }}
    />
  );
}

function Home() {
  const { t } = useTranslation();
  const { user, loadingAuth } = useAuth();
  const {
    profiles,
    loading: profilesLoading,
    profilesLoadedOnce,
    createProfile,
  } = useProfiles();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inAppBrowserWarning, setInAppBrowserWarning] = useState(null);
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareId, setShareId] = useState(null);
  const [isSharedFortune, setIsSharedFortune] = useState(false);
  const [sharedUserInfo, setSharedUserInfo] = useState(null);
  const [sharedFortuneType, setSharedFortuneType] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNoProfileModal, setShowNoProfileModal] = useState(false);
  const [userDismissedNoProfileModal, setUserDismissedNoProfileModal] =
    useState(getProfileModalDismissed);

  useEffect(() => {
    if (
      user &&
      profilesLoadedOnce &&
      !profilesLoading &&
      profiles.length === 0 &&
      !showNoProfileModal &&
      !userDismissedNoProfileModal &&
      !isSharedFortune
    ) {
      setShowNoProfileModal(true);
    }
  }, [
    user,
    profilesLoadedOnce,
    profilesLoading,
    profiles,
    showNoProfileModal,
    userDismissedNoProfileModal,
    isSharedFortune,
  ]);

  useEffect(() => {
    if (profiles.length > 0) {
      setShowNoProfileModal(false);
      setShowProfileModal(false);
      setUserDismissedNoProfileModal(false);
      clearProfileModalDismissed();
    }
  }, [profiles]);

  useEffect(() => {
    const { isInApp, appName } = detectInAppBrowser();

    if (isInApp && appName) {
      const redirectSuccess = redirectToExternalBrowser(
        appName,
        window.location.href,
      );

      if (!redirectSuccess) {
        const message = getBrowserGuideMessage(appName);
        setInAppBrowserWarning({ appName, message });
      } else {
        const timer = setTimeout(() => {
          const message = getBrowserGuideMessage(appName);
          setInAppBrowserWarning({ appName, message });
        }, 2000);

        return () => clearTimeout(timer);
      }
    }
  }, []);

  useEffect(() => {
    const sharedId = searchParams.get("id");

    if (sharedId) {
      loadSharedFortune(sharedId);
    }
  }, [searchParams]);

  const loadSharedFortune = async (id) => {
    setLoading(true);
    setError("");

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-fortune?id=${id}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) throw new Error(t("home.loading_fortune_error"));

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setInterpretation(data.interpretation);
      setIsSharedFortune(true);
      setShareId(id);
      setSharedUserInfo(data.userInfo ?? null);
      setSharedFortuneType(data.fortuneType ?? null);
    } catch (err) {
      console.error("❌ 공유된 운세 조회 실패:", err);
      setError(err.message || t("home.loading_fortune_error_generic"));
      setSearchParams({});
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (profileData) => {
    await createProfile(profileData);
  };

  if (loadingAuth) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm sm:text-base">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
      <div
        className={`w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24`}
        style={{ position: "relative", zIndex: 1 }}
      >
        {!interpretation && (
          <div className="w-full font-noto flex flex-col items-center text-center pt-4 sm:pt-6">
            <section className="flex flex-col items-center gap-[clamp(16px,5vw,30px)] w-full px-4">
              <div className="-mx-4 w-[calc(100%+2rem)]">
                <img
                  src="/assets/divider1.png"
                  alt=""
                  className="w-full h-auto max-h-[60px] object-contain"
                />
              </div>

              <p className="text-[#D8D8ED] text-center font-noto text-[clamp(16px,5vw,30px)] font-light leading-[1.48] tracking-[-2.4px]">
                {t("home.tagline1")}
                <br />
                {t("home.tagline2")}
              </p>

              <div className="w-[5%] min-w-[20px] max-w-[40px] shrink-0">
                <img
                  src="/assets/divider2.png"
                  alt=""
                  className="w-full h-auto block object-contain"
                  style={{ height: "auto" }}
                />
              </div>

              <p className="text-[#D8D8ED] text-center font-noto text-[clamp(15.47px,4.833vw,29px)] font-light leading-[1.68] tracking-[-2.32px]">
                {t("home.tagline3")}
              </p>

              <div className="flex flex-col items-center gap-[clamp(2px,0.5vw,6px)]">
                <p className="text-[#FFFFFF] text-center font-noto text-[clamp(18.13px,5.667vw,34px)] font-light leading-[1.68] tracking-[-2.72px]">
                  {t("home.made_by")}
                </p>
                <h1 className="font-gmarket text-[clamp(36.85px,11.51vw,69.09px)] font-bold leading-normal text-primary">
                  {t("home.brand")}
                </h1>
              </div>
            </section>

            <section className="relative w-full mx-auto px-4 py-6 sm:py-8 flex flex-col items-center">
              <div className="-mx-4 w-[calc(100%+2rem)]">
                <div className="relative w-full">
                  <img
                    src="/assets/graphic.png"
                    alt="진짜미래 고전 점성술"
                    className="w-full h-auto block"
                  />
                  <img
                    src="/assets/article.png"
                    alt=""
                    className="absolute top-[48.5%] left-1/2 w-[20%] h-auto object-contain animate-article-spin-center"
                  />
                </div>
              </div>
            </section>

            <section className="flex flex-col items-center gap-[clamp(18.67px,5.833vw,35px)] w-full px-4">
              <div className="flex flex-col items-center text-center">
                <p className="text-[#FFFFFF] font-noto text-[clamp(15px,4.8vw,28px)] font-light leading-[1.48]">
                  {t("home.future_know")}
                </p>
                <p className="text-primary font-noto text-[clamp(15px,4.8vw,28px)] font-medium leading-[1.48]">
                  {t("home.future_change")}
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <p className="text-primary font-noto text-[clamp(18px,5.8vw,34px)] font-medium leading-[1.58]">
                  {t("home.price_highlight")}
                </p>
                <p className="text-[#FFFFFF] font-noto text-[clamp(15px,4.8vw,28px)] font-medium leading-[1.58]">
                  {t("home.price_cta")}
                </p>
              </div>
            </section>

            {/* 현직 전문가 소셜 프루프 섹션 */}
            <section className="flex flex-col items-center w-full pt-[clamp(56px,12vw,96px)] pb-[clamp(28px,6vw,48px)] px-4">
              <div className="w-full flex flex-col items-center gap-[clamp(20px,4vw,28px)]">
                <div
                  className="flex flex-wrap justify-center gap-x-1.5 text-primary/90 mb-0.5"
                  aria-hidden="true"
                >
                  <span className="font-noto text-[clamp(10px,2.2vw,14px)]">✦</span>
                  <span className="font-noto text-[clamp(10px,2.2vw,14px)]">✦</span>
                  <span className="font-noto text-[clamp(10px,2.2vw,14px)]">✦</span>
                </div>
                <h2 className="text-center font-noto text-[clamp(17px,4.5vw,24px)] font-medium leading-[1.5] tracking-[-0.02em] text-[#FFFFFF]">
                  {t("home.expert_title")}{" "}
                  <span className="text-primary">{t("home.expert_title_accent")}</span>
                </h2>
                <p className="text-center font-noto text-[clamp(12px,3vw,15px)] font-light leading-[1.6] text-[#9CA3B8]">
                  {t("home.expert_subtitle").split("\n").map((line, i) => (
                    <span key={i}>{line}{i === 0 && <br />}</span>
                  ))}
                </p>
                <div className="flex flex-col gap-[clamp(16px,3.5vw,22px)] w-full">
                  <blockquote className="font-noto text-left rounded-xl p-[clamp(18px,4vw,24px)] bg-[#1E1E3A]/90 border border-[#2A2A4A]/80 shadow-lg">
                    <p
                      className="flex gap-0.5 mb-3 text-primary"
                      aria-label="별점 5점"
                    >
                      <FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon />
                    </p>
                    <p className="text-[#F5F0E8] text-[clamp(14px,3.2vw,16px)] font-light leading-[1.65] tracking-[-0.01em]">
                      &ldquo;{t("home.expert_review1")}&rdquo;
                    </p>
                    <footer className="mt-3 text-[clamp(12px,2.8vw,14px)] text-primary/95 font-medium">
                      {t("home.expert_review1_author")}
                    </footer>
                  </blockquote>
                  <blockquote className="font-noto text-left rounded-xl p-[clamp(18px,4vw,24px)] bg-[#1E1E3A]/90 border border-[#2A2A4A]/80 shadow-lg">
                    <p
                      className="flex gap-0.5 mb-3 text-primary"
                      aria-label="별점 5점"
                    >
                      <FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon />
                    </p>
                    <p className="text-[#F5F0E8] text-[clamp(14px,3.2vw,16px)] font-light leading-[1.65] tracking-[-0.01em]">
                      &ldquo;{t("home.expert_review2")}&rdquo;
                    </p>
                    <footer className="mt-3 text-[clamp(12px,2.8vw,14px)] text-primary/95 font-medium">
                      {t("home.expert_review2_author")}
                    </footer>
                  </blockquote>
                </div>
              </div>
            </section>

            {/* 실제 구매자들 리뷰 섹션 */}
            <section className="flex flex-col items-center w-full pt-[clamp(28px,6vw,48px)] pb-[clamp(28px,6vw,48px)] px-4">
              <div className="w-full flex flex-col items-center gap-[clamp(20px,4vw,28px)]">
                <div
                  className="flex flex-wrap justify-center gap-x-1.5 text-primary/90 mb-0.5"
                  aria-hidden="true"
                >
                  <span className="font-noto text-[clamp(10px,2.2vw,14px)]">✦</span>
                  <span className="font-noto text-[clamp(10px,2.2vw,14px)]">✦</span>
                  <span className="font-noto text-[clamp(10px,2.2vw,14px)]">✦</span>
                </div>
                <h2 className="text-center font-noto text-[clamp(17px,4.5vw,24px)] font-medium leading-[1.5] tracking-[-0.02em] text-[#FFFFFF]">
                  {t("home.buyer_title")}{" "}
                  <span className="text-primary">{t("home.buyer_title_accent")}</span>
                </h2>
                <p className="text-center font-noto text-[clamp(12px,3vw,15px)] font-light leading-[1.6] text-[#9CA3B8]">
                  <br />
                  {t("home.buyer_subtitle").split("\n").map((line, i, arr) => (
                    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                  ))}
                </p>
                <div className="flex flex-col gap-[clamp(16px,3.5vw,22px)] w-full">
                  {[
                    { review: "buyer_review1", author: "buyer_review1_author" },
                    { review: "buyer_review2", author: "buyer_review2_author" },
                    { review: "buyer_review3", author: "buyer_review3_author" },
                  ].map(({ review, author }) => (
                    <blockquote key={review} className="font-noto text-left rounded-xl p-[clamp(18px,4vw,24px)] bg-[#1E1E3A]/90 border border-[#2A2A4A]/80 shadow-lg">
                      <p
                        className="flex items-center gap-1.5 mb-3 text-primary"
                        aria-label="별점 5점"
                      >
                        <span className="flex gap-0.5">
                          <FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon /><FavoriteStarIcon />
                        </span>
                        <span className="text-[clamp(12px,2.8vw,14px)] font-medium text-primary/95">5.0</span>
                      </p>
                      <p className="text-[#F5F0E8] text-[clamp(14px,3.2vw,16px)] font-light leading-[1.65] tracking-[-0.01em]">
                        &ldquo;{t(`home.${review}`)}&rdquo;
                      </p>
                      <footer className="mt-3 text-[clamp(12px,2.8vw,14px)] text-primary/95 font-medium">
                        {t(`home.${author}`)}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </div>
            </section>

            {/* JP Morgan 섹션 */}
            <section className="flex flex-col items-center gap-[clamp(18.67px,5.833vw,35px)] w-full px-4">
              <div className="w-[5%] min-w-[20px] max-w-[40px] shrink-0 my-[clamp(18px,4vw,32px)]">
                <img
                  src="/assets/divider3.png"
                  alt=""
                  className="w-full h-auto block object-contain"
                  style={{ height: "auto" }}
                />
              </div>

              <div className="flex flex-col items-center gap-[clamp(4px,1vw,10px)]">
                <p className="text-[#D8D8ED] text-center font-noto text-[clamp(17.07px,5.333vw,32px)] font-light leading-[1.48]">
                  {t("home.jp_quote").split("\n").map((line, i, arr) => (
                    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                  ))}
                </p>
                <p className="text-[#D8D8ED] text-center font-noto text-[clamp(10px,3vw,18px)] font-light leading-[1.68]">
                  {t("home.jp_name")}
                </p>
              </div>

              <p className="text-[#D8D8ED] text-center font-noto text-[clamp(13.87px,4.333vw,26px)] font-light leading-[1.68]">
                {t("home.jp_text1")}
                <br />
                {t("home.jp_text2")}
              </p>

              <p className="text-[#D8D8ED] text-center font-noto text-[clamp(13.87px,4.333vw,26px)] font-light leading-[1.68]">
                {t("home.jp_text3")}
                <br />
                &lsquo;{t("home.jp_text4")}&rsquo;
              </p>

              <div className="w-[5%] min-w-[20px] max-w-[40px] shrink-0">
                <img
                  src="/assets/divider2.png"
                  alt=""
                  className="w-full h-auto block object-contain"
                  style={{ height: "auto" }}
                />
              </div>
            </section>

            {/* CTA 버튼 */}
            <div className="w-full font-sans mt-6 sm:mt-8 mb-6 sm:mb-8 px-0">
              <PrimaryButton
                as={Link}
                to={user ? "/consultation" : "/login"}
                variant="gold"
                fullWidth
                aria-label="100% 리얼 정통 고전 점성술 컨설팅, 진짜미래 보러가기"
              >
                {t("home.cta_button")}
              </PrimaryButton>
            </div>
          </div>
        )}

        {inAppBrowserWarning && (
          <div className="mb-4 sm:mb-6 p-4 sm:p-5 bg-yellow-900/50 border-2 border-yellow-600 rounded-lg shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm sm:text-base font-semibold text-yellow-200 mb-2">
                  {t("home.inapp_detected", { appName: inAppBrowserWarning.appName })}
                </h3>
                <p className="text-xs sm:text-sm text-yellow-100 leading-relaxed mb-3">
                  {inAppBrowserWarning.message}
                </p>
                <button
                  onClick={() => setInAppBrowserWarning(null)}
                  className="text-xs sm:text-sm text-yellow-300 hover:text-yellow-200 underline"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 공유된 운세 표시 */}
        {isSharedFortune &&
          interpretation &&
          (() => {
            const profileName = sharedUserInfo?.profileName?.trim() || "";
            const sharedTitle =
              sharedFortuneType === "consultation"
                ? profileName
                  ? `${profileName}${t("home.shared_fortune_consultation")}`
                  : t("home.true_future_label")
                : sharedFortuneType === "daily"
                  ? profileName
                    ? `${profileName}${t("home.shared_fortune_daily")}`
                    : t("home.true_today_label")
                  : sharedFortuneType === "lifetime"
                    ? profileName
                      ? `${profileName}${t("home.shared_fortune_lifetime")}`
                      : t("home.true_life_label")
                    : profileName
                      ? `${profileName}${t("home.shared_fortune_default")}`
                      : t("home.shared_fortune_fallback");

            return (
              <div className="mb-6 sm:mb-8">
                <FortuneResult
                  title={sharedTitle}
                  interpretation={interpretation}
                  shareId={shareId}
                  isShared={true}
                />

                {!user && (
                  <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
                    <p className="text-center text-slate-300 mb-4 text-base">
                      {t("home.shared_fortune_cta")}
                    </p>
                    <SocialLoginButtons />
                  </div>
                )}
              </div>
            );
          })()}
      </div>
      <BottomNavigation />

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          if (profiles.length === 0 && !isSharedFortune) {
            setShowNoProfileModal(true);
          }
        }}
        onSubmit={handleCreateProfile}
      />

      {showNoProfileModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
          <div
            className="bg-[#0F0F2B] rounded-lg shadow-xl max-w-md w-full p-6 border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-full flex justify-center mb-4">
                <img
                  src="/assets/welcome.png"
                  alt="진짜미래 고전 점성술 천체 운행 데이터 기반 인생 지도"
                  className="max-w-[100px] h-auto"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {t("home.welcome_title")}
              </h2>
              <p className="text-slate-300">
                {t("home.welcome_subtitle").split("\n").map((line, i, arr) => (
                  <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                ))}
              </p>
            </div>
            <button
              onClick={() => {
                setShowNoProfileModal(false);
                setTimeout(() => setShowProfileModal(true), 100);
              }}
              className="w-full py-3 px-4 text-white font-medium rounded-lg transition-all"
              style={{
                background:
                  "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
              }}
            >
              {t("home.register_profile")}
            </button>
            <button
              type="button"
              onClick={() => {
                setUserDismissedNoProfileModal(true);
                setProfileModalDismissed();
                setShowNoProfileModal(false);
              }}
              className="w-full mt-3 py-2 px-4 text-slate-300 hover:text-white text-sm transition-colors"
            >
              {t("home.do_it_later")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
