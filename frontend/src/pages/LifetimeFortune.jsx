import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BirthInputForm from "../components/BirthInputForm";
import BottomNavigation from "../components/BottomNavigation";
import FortuneResult from "../components/FortuneResult";
import SocialLoginButtons from "../components/SocialLoginButtons";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { restoreFortuneIfExists } from "../services/fortuneService";
import { loadSharedFortune, formatBirthDate } from "../utils/sharedFortune";
import { logDebugInfoIfPresent } from "../utils/debugFortune";

function LifetimeFortune() {
  const { user, loadingAuth } = useAuth();
  const {
    profiles,
    selectedProfile,
    loading: profilesLoading,
    createProfile,
    deleteProfile,
    selectProfile,
    checkFortuneAvailability,
    saveFortuneHistory,
  } = useProfiles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareId, setShareId] = useState(null);
  const [isSharedFortune, setIsSharedFortune] = useState(false);
  const [sharedUserInfo, setSharedUserInfo] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNoProfileModal, setShowNoProfileModal] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // URL에 공유 ID가 있는 경우 운세 조회
  useEffect(() => {
    const sharedId = searchParams.get("id");

    if (sharedId) {
      console.log("🔗 공유된 인생 종합운 ID 발견:", sharedId);
      loadShared(sharedId);
    }
  }, [searchParams]);

  // 공유된 운세 조회 함수
  const loadShared = async (id) => {
    setLoading(true);
    setError("");

    try {
      const data = await loadSharedFortune(id);

      console.log("✅ 공유된 인생 종합운 조회 성공:", data);
      logDebugInfoIfPresent(data);

      setInterpretation(data.interpretation);
      setIsSharedFortune(true);
      setShareId(id);
      setSharedUserInfo(data.userInfo);
    } catch (err) {
      console.error("❌ 공유된 인생 종합운 조회 실패:", err);
      setError(err.message || "운세를 불러오는 중 오류가 발생했습니다.");
      setSearchParams({});
    } finally {
      setLoading(false);
    }
  };

  // 로그인 필요 액션 처리
  const handleRequireLogin = () => {
    alert("로그인이 필요합니다.");
    navigate("/");
  };

  // 프로필 데이터를 API 형식으로 변환하는 함수
  const convertProfileToApiFormat = (profile) => {
    if (!profile) {
      return null;
    }

    return {
      birthDate: profile.birth_date.substring(0, 19),
      lat: profile.lat,
      lng: profile.lng,
    };
  };

  // 프로필이 없을 때 모달 표시
  useEffect(() => {
    if (
      user &&
      !profilesLoading &&
      profiles.length === 0 &&
      !showNoProfileModal &&
      !isSharedFortune
    ) {
      setShowNoProfileModal(true);
    }
  }, [user, profilesLoading, profiles, showNoProfileModal, isSharedFortune]);

  // 프로필이 생성되면 모달 닫기
  useEffect(() => {
    if (profiles.length > 0) {
      setShowNoProfileModal(false);
      setShowProfileModal(false);
    }
  }, [profiles]);

  // 로그인 계정에 저장된 이전 결과 복구 (다른 기기/새로고침 후에도 결과 유지)
  useEffect(() => {
    if (!selectedProfile || isSharedFortune || !user) return;
    // 공유 링크(id)가 있으면 복구하지 않음
    if (searchParams.get("id")) return;

    setRestoring(true);
    let cancelled = false;

    (async () => {
      try {
        const restored = await restoreFortuneIfExists(selectedProfile.id, "lifetime");
        if (cancelled) return;
        if (restored) {
          console.log("✅ [복구] 인생 종합운 DB에서 복구");
          setInterpretation(restored.interpretation);
          setShareId(restored.shareId);
          setError("");
        } else {
          setInterpretation("");
          setShareId(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "복구 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProfile?.id, isSharedFortune, user, searchParams]);

  // 프로필 생성 핸들러
  const handleCreateProfile = useCallback(
    async (profileData) => {
      await createProfile(profileData);
      // 프로필 생성 후 모달은 ProfileModal의 onClose에서 처리됨
    },
    [createProfile],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 공유 링크로 들어온 경우 로그인 필요
    if (isSharedFortune && !user) {
      handleRequireLogin();
      return;
    }

    // 프로필 선택 체크
    if (!selectedProfile) {
      setError("프로필을 선택해주세요.");
      setShowProfileModal(true);
      return;
    }

    // 운세 조회 가능 여부 체크
    const availability = await checkFortuneAvailability(
      selectedProfile.id,
      "lifetime",
    );
    if (!availability.available) {
      setError(availability.reason);
      return;
    }

    const formData = convertProfileToApiFormat(selectedProfile);

    if (!formData) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setInterpretation("");
    setShareId(null);

    try {
      const requestBody = {
        ...formData,
        fortuneType: "lifetime",
        reportType: "lifetime", // 하위 호환성 유지
      };

      // 디버깅: 전송하는 데이터 로그
      console.log("\n" + "=".repeat(60));
      console.log("📤 API 요청 전송 데이터");
      console.log("=".repeat(60));
      console.log("생년월일시:", formData.birthDate);
      console.log("위치:", `위도 ${formData.lat}, 경도 ${formData.lng}`);
      console.log("전체 요청 본문:", JSON.stringify(requestBody, null, 2));
      console.log("=".repeat(60) + "\n");

      const { data, error: functionError } = await supabase.functions.invoke(
        "get-fortune",
        {
          body: requestBody,
        },
      );

      if (functionError) {
        throw new Error(functionError.message || "서버 오류가 발생했습니다.");
      }

      if (!data || data.error) {
        throw new Error(data?.error || "서버 오류가 발생했습니다.");
      }

      logDebugInfoIfPresent(data);

      // 디버깅: 받은 응답 로그
      console.log("\n" + "=".repeat(60));
      console.log("📥 API 응답 받은 데이터");
      console.log("=".repeat(60));

      // share_id 저장
      console.log("🔍 [LifetimeFortune] API 응답 전체:", data);
      console.log(
        "🔍 [LifetimeFortune] API 응답 data.share_id:",
        data.share_id,
        "타입:",
        typeof data.share_id,
      );
      if (
        data.share_id &&
        data.share_id !== "undefined" &&
        data.share_id !== null &&
        data.share_id !== "null"
      ) {
        console.log("🔗 Share ID 저장:", data.share_id);
        setShareId(data.share_id);
      } else {
        console.warn(
          "⚠️ [LifetimeFortune] share_id가 응답에 없거나 유효하지 않습니다.",
        );
        console.warn("  - data.share_id 값:", data.share_id);
        console.warn("  - data.share_id 타입:", typeof data.share_id);
        setShareId(null); // 명시적으로 null 설정
      }

      // 1. Natal Chart (출생 차트)
      if (data.chart) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🌟 [Natal Chart - 출생 차트]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`출생 시간: ${data.chart.date}`);
        console.log(
          `출생 위치: 위도 ${data.chart.location?.lat}, 경도 ${data.chart.location?.lng}`,
        );

        // 상승점
        if (data.chart.houses?.angles?.ascendant !== undefined) {
          const asc = data.chart.houses.angles.ascendant;
          const ascSignIndex = Math.floor(asc / 30);
          const ascDegreeInSign = asc % 30;
          const signs = [
            "Aries",
            "Taurus",
            "Gemini",
            "Cancer",
            "Leo",
            "Virgo",
            "Libra",
            "Scorpio",
            "Sagittarius",
            "Capricorn",
            "Aquarius",
            "Pisces",
          ];
          console.log(
            `\n상승점(Ascendant): ${signs[ascSignIndex]} ${ascDegreeInSign.toFixed(1)}°`,
          );
        }

        // 행성 위치
        console.log("\n행성 위치:");
        if (data.chart.planets) {
          const planetNames = {
            sun: "Sun",
            moon: "Moon",
            mercury: "Mercury",
            venus: "Venus",
            mars: "Mars",
            jupiter: "Jupiter",
            saturn: "Saturn",
          };
          Object.entries(data.chart.planets).forEach(([name, planet]) => {
            const displayName = planetNames[name] || name;
            console.log(
              `  - ${displayName.toUpperCase().padEnd(8)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign.toFixed(1).padStart(5)}° (House ${planet.house})`,
            );
          });
        }

        // 포르투나
        if (data.chart.fortuna) {
          console.log(
            `\nPart of Fortune: ${data.chart.fortuna.sign} ${data.chart.fortuna.degreeInSign.toFixed(1)}° (House ${data.chart.fortuna.house})`,
          );
        }
      }

      // 2. 제미나이에게 전달한 프롬프트 (디버깅용)
      if (data.userPrompt) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📝 [제미나이에게 전달한 User Prompt]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(data.userPrompt);
      }

      if (data.systemInstruction) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📋 [제미나이에게 전달한 System Instruction]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(data.systemInstruction);
      }

      // 3. 제미나이 해석 결과
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✨ [제미나이 해석 결과]");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(data.interpretation);
      console.log("\n" + "=".repeat(60) + "\n");

      if (data.interpretation && typeof data.interpretation === "string") {
        setInterpretation(data.interpretation);
        if (data.share_id) setShareId(data.share_id);

        // 운세 이력 저장 (share_id를 result_id로 저장하여 복구 가능)
        await saveFortuneHistory(
          selectedProfile.id,
          "lifetime",
          data.share_id ?? undefined,
        );
      } else {
        setInterpretation("결과를 불러올 수 없습니다.");
      }
    } catch (err) {
      setError(err.message || "요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

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

  // 공유 링크: 로그인 여부 무관하게 '친구가 공유한 운세 결과'만 표시 (프로필 선택기 없음)
  const sharedId = searchParams.get("id");
  if (sharedId) {
    if (loading) {
      return (
        <div className="w-full flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p className="text-slate-400 text-sm sm:text-base">
              공유된 운세를 불러오는 중...
            </p>
          </div>
        </div>
      );
    }
    if (isSharedFortune && interpretation) {
      return (
        <div
          className="w-full py-8 sm:py-12"
          style={{ position: "relative", zIndex: 1 }}
        >
          <div
            className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24"
            style={{ position: "relative", zIndex: 1 }}
          >
            {/* 상단: 친구가 공유한 결과임을 안내 + 친구 생년월일만 */}
            <div className="mb-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-2xl">🔮</div>
                <div className="flex-1">
                  <p className="text-purple-200 text-base mb-2">
                    친구가 공유한 운세 결과예요.
                  </p>
                  {sharedUserInfo?.birthDate && (
                    <div className="text-xs sm:text-sm text-slate-300 mt-3 bg-slate-700/50 px-4 sm:px-6 py-3 rounded">
                      <p>📅 {formatBirthDate(sharedUserInfo.birthDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <FortuneResult
              title="내 인생 사용 설명서"
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
        </div>
      );
    }
  }

  if (!user && !loadingAuth) {
    navigate("/");
    return null;
  }

  return (
    <div
      className="w-full py-8 sm:py-12"
      style={{ position: "relative", zIndex: 1 }}
    >
      <div
        className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 페이지 소개 - 종합 운세 (Natal Chart) */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            내 인생 사용 설명서
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            내담자님이 태어난 순간, 별들이 그려낸 고유한 설계도입니다. 내가 타고난 기질과 잠재력, 그리고 인생의 방향성을 확인하고 나를 가장 잘 쓰는 방법을 알아보세요.
          </p>
        </div>

        {/* 프로필 선택 드롭다운 - 폼 밖으로 분리 */}
        <div className="mb-6 sm:mb-8">
          <ProfileSelector
            profiles={profiles}
            selectedProfile={selectedProfile}
            onSelectProfile={selectProfile}
            onCreateProfile={() => setShowProfileModal(true)}
            onDeleteProfile={deleteProfile}
          />
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 sm:space-y-6 mb-6 sm:mb-8"
        >
          <button
            type="submit"
            disabled={loading || !selectedProfile}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 text-lg text-white font-semibold rounded-lg shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative touch-manipulation flex items-center justify-center gap-2 sm:gap-3 hover:shadow-[0_0_8px_rgba(97,72,235,0.3),0_0_12px_rgba(255,82,82,0.2)]"
            style={{
              zIndex: 1,
              position: "relative",
              background:
                "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
            }}
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>인생을 분석하는 중...</span>
              </>
            ) : (
              <span>진짜미래 확인하기</span>
            )}
          </button>
        </form>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}
        {restoring && !interpretation && (
          <div className="mb-6 py-8 text-center text-slate-400 text-sm">
            이전 결과 불러오는 중...
          </div>
        )}
        {!restoring && interpretation && (
          <FortuneResult
            title="내 인생 사용 설명서"
            interpretation={interpretation}
            shareId={shareId}
          />
        )}
      </div>
      {user && <BottomNavigation activeTab="lifetime" />}

      {/* 프로필 등록 모달 */}
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

      {/* 프로필 없음 안내 모달 */}
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
                // 약간의 지연을 두어 모달이 완전히 닫힌 후 프로필 등록 모달 열기
                setTimeout(() => {
                  setShowProfileModal(true);
                }, 100);
              }}
              className="w-full py-3 px-4 text-white font-medium rounded-lg transition-all"
              style={{
                background:
                  "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
              }}
            >
              프로필 등록하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LifetimeFortune;
