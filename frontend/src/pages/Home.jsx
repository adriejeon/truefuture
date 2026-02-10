import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { logDebugInfoIfPresent } from "../utils/debugFortune";

function Home() {
  const { user, loadingAuth } = useAuth();
  const { profiles, loading: profilesLoading, createProfile } = useProfiles();
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
    useState(false);
  const [testLoginLoading, setTestLoginLoading] = useState(false);

  // 프로필이 없을 때 모달 표시 (사용자가 "나중에 하기"로 닫은 적 없을 때만)
  useEffect(() => {
    if (
      user &&
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
      setUserDismissedNoProfileModal(false); // 프로필 생기면 다음에 다시 보여줄 수 있도록
    }
  }, [profiles]);

  // 인앱 브라우저 감지 및 처리
  useEffect(() => {
    const { isInApp, appName } = detectInAppBrowser();

    if (isInApp && appName) {
      const redirectSuccess = redirectToExternalBrowser(
        appName,
        window.location.href
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

  // URL에 공유 ID가 있는 경우 운세 조회
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
        }
      );

      if (!response.ok) throw new Error("운세를 불러올 수 없습니다.");

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      logDebugInfoIfPresent(data);

      setInterpretation(data.interpretation);
      setIsSharedFortune(true);
      setShareId(id);
      setSharedUserInfo(data.userInfo ?? null);
      setSharedFortuneType(data.fortuneType ?? null);
    } catch (err) {
      console.error("❌ 공유된 운세 조회 실패:", err);
      setError(err.message || "운세를 불러오는 중 오류가 발생했습니다.");
      setSearchParams({});
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (profileData) => {
    await createProfile(profileData);
  };

  const handleTestLogin = async () => {
    const email = import.meta.env.VITE_TEST_LOGIN_EMAIL;
    const password = import.meta.env.VITE_TEST_LOGIN_PASSWORD;

    if (!email || !password) {
      alert(
        "테스트 계정이 설정되지 않았습니다.\n.env에 VITE_TEST_LOGIN_EMAIL, VITE_TEST_LOGIN_PASSWORD를 설정해 주세요."
      );
      return;
    }

    if (!supabase) {
      alert("연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setTestLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message?.includes("Invalid login credentials")) {
          alert(
            "테스트 계정 로그인에 실패했습니다.\nSupabase 대시보드 > Auth > Users에서 해당 이메일/비밀번호 사용자를 추가했는지 확인해 주세요."
          );
        } else {
          alert(`로그인 실패: ${error.message}`);
        }
        return;
      }

      if (data?.user) {
        // 로그인 성공 시 onAuthStateChange에서 user 갱신됨
      }
    } catch (err) {
      console.error("테스트 로그인 오류:", err);
      alert("테스트 로그인 중 오류가 발생했습니다.");
    } finally {
      setTestLoginLoading(false);
    }
  };

  // 인증 로딩 중
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
    <div className="w-full" style={{ position: "relative", zIndex: 1 }}>
      <div
        className={`w-full max-w-[600px] mx-auto px-4 ${
          !user && !interpretation ? "" : "pb-20 sm:pb-24"
        }`}
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 메인 이미지 + 로그인 CTA (로그인 여부와 관계없이 표시) */}
        {!interpretation && (
          <div className="w-full">
            <div className="relative w-full inline-block">
              <img
                src="/assets/main.png"
                alt="진짜미래"
                className="w-full h-auto object-contain block"
              />
              <div className="absolute top-[42.8%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[15%] sm:w-[12%] md:w-[10%] max-w-[320px] aspect-square z-10">
                <img
                  src="/assets/article.png"
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain animate-article-cross-fade-1"
                />
                <img
                  src="/assets/article1.png"
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain animate-article-cross-fade-2"
                />
              </div>
            </div>
            <div className="w-full mt-6 sm:mt-8 mb-6 sm:mb-8 px-0">
              <PrimaryButton
                as={Link}
                to={user ? "/consultation" : "/login"}
                variant="gold"
                fullWidth
              >
                진짜미래 보러가기
              </PrimaryButton>
              {(import.meta.env.VITE_TEST_LOGIN_EMAIL &&
                import.meta.env.VITE_TEST_LOGIN_PASSWORD) && (
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={handleTestLogin}
                    disabled={testLoginLoading}
                    className="text-xs text-slate-500 hover:text-slate-400 transition-colors underline disabled:opacity-50"
                  >
                    {testLoginLoading ? "로그인 중..." : "테스트 로그인"}
                  </button>
                </div>
              )}
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
                  {inAppBrowserWarning.appName} 인앱 브라우저 감지
                </h3>
                <p className="text-xs sm:text-sm text-yellow-100 leading-relaxed mb-3">
                  {inAppBrowserWarning.message}
                </p>
                <button
                  onClick={() => setInAppBrowserWarning(null)}
                  className="text-xs sm:text-sm text-yellow-300 hover:text-yellow-200 underline"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 공유된 운세 표시 */}
        {isSharedFortune && interpretation && (() => {
          const profileName = sharedUserInfo?.profileName?.trim() || "";
          const sharedTitle =
            sharedFortuneType === "consultation"
              ? profileName ? `${profileName}님의 진짜 미래예요` : "진짜 미래예요"
              : sharedFortuneType === "daily"
              ? profileName ? `${profileName}님의 진짜 오늘이에요` : "진짜 오늘이에요"
              : sharedFortuneType === "lifetime"
              ? profileName ? `${profileName}님의 진짜 인생이에요` : "진짜 인생이에요"
              : profileName ? `${profileName}님의 운세` : "공유된 운세";

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
                    나도 내 운세를 확인하고 싶다면?
                  </p>
                  <SocialLoginButtons />
                </div>
              )}
            </div>
          );
        })()}
      </div>
      {user && <BottomNavigation />}

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
                  alt="환영합니다"
                  className="max-w-[100px] h-auto"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                환영합니다!
              </h2>
              <p className="text-slate-300">
                운세를 확인하기 위해
                <br />
                생년월일시간을 입력해 주세요
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
              프로필 등록하기
            </button>
            <button
              type="button"
              onClick={() => {
                setUserDismissedNoProfileModal(true);
                setShowNoProfileModal(false);
              }}
              className="w-full mt-3 py-2 px-4 text-slate-300 hover:text-white text-sm transition-colors"
            >
              나중에 하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
