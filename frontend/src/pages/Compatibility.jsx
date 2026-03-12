import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import BirthInputForm from "../components/BirthInputForm";
import BottomNavigation from "../components/BottomNavigation";
import FortuneResult from "../components/FortuneResult";
import SocialLoginButtons from "../components/SocialLoginButtons";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import TypewriterLoader from "../components/TypewriterLoader";
import StarModal from "../components/StarModal";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { fetchFortuneByResultId } from "../services/fortuneService";
import { loadSharedFortune } from "../utils/sharedFortune";
import { invokeGetFortuneStream } from "../utils/getFortuneStream";
import {
  FORTUNE_STAR_COSTS,
  FORTUNE_TYPE_NAMES,
  fetchUserStars,
  checkStarBalance,
} from "../utils/starConsumption";
import AstrologyPageHelmet from "../components/AstrologyPageHelmet";
import LoginRequiredModal from "../components/LoginRequiredModal";
import {
  getProfileModalDismissed,
  setProfileModalDismissed,
  clearProfileModalDismissed,
} from "../utils/profileModalStorage";

function Compatibility() {
  const { user, loadingAuth } = useAuth();
  const {
    profiles,
    selectedProfile,
    loading: profilesLoading,
    profilesLoadedOnce,
    createProfile,
    deleteProfile,
    selectProfile,
    saveFortuneHistory,
  } = useProfiles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [interpretation, setInterpretation] = useState("");
  const [streamingInterpretation, setStreamingInterpretation] = useState("");
  const [loading, setLoading] = useState(false);
  const [processStatus, setProcessStatus] = useState("idle"); // 'idle' | 'waiting' | 'streaming' | 'done'
  const [error, setError] = useState("");
  const resultContainerRef = useRef(null);
  const firstChunkReceivedRef = useRef(false);
  const hasRestoredProfile2Ref = useRef(false);

  // 두 사람의 프로필 선택
  const [profile1, setProfile1] = useState(null);
  const [profile2, setProfile2] = useState(null);
  // 내역에서 진입 시 복원용: user_info (로드 완료 후 profile1/profile2 매칭)
  const [pendingHistoryUserInfo, setPendingHistoryUserInfo] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [synastryResult, setSynastryResult] = useState(null); // 궁합 점수 등 (카카오 공유 요약용)
  const [isSharedFortune, setIsSharedFortune] = useState(false);
  const [sharedUserInfo, setSharedUserInfo] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNoProfileModal, setShowNoProfileModal] = useState(false);
  const [userDismissedNoProfileModal, setUserDismissedNoProfileModal] =
    useState(getProfileModalDismissed);
  const [restoring, setRestoring] = useState(false);
  const [relationshipType, setRelationshipType] = useState("연인"); // 관계 유형
  const [showStarModal, setShowStarModal] = useState(false);
  const [starModalData, setStarModalData] = useState({
    type: "confirm",
    required: FORTUNE_STAR_COSTS.compatibility,
    current: 0,
  });
  const [showLoginRequiredModal, setShowLoginRequiredModal] = useState(false);

  // 카카오 공유용 궁합 한 줄 요약 (점수 + 이름)
  const compatibilityShareSummary = useMemo(() => {
    if (synastryResult?.overallScore == null) return null;
    const score = Number(synastryResult.overallScore);
    const name1 = profile1?.name || "첫 번째 사람";
    const name2 = profile2?.name || "두 번째 사람";
    let phrase = "서로 이해하려는 노력이 필요해요!";
    if (score >= 80) phrase = "크게 거슬리는 게 없는 관계에요!";
    else if (score >= 60) phrase = "잘 맞는 편이에요!";
    else if (score >= 40) phrase = "서로 맞춰 나가면 좋아요!";
    return `${name1}님과 ${name2}님의 궁합 점수 ${score}점! ${phrase}`;
  }, [synastryResult, profile1?.name, profile2?.name]);

  const COMPAT_PROFILE2_KEY = "compatibility_profile2_id";

  // 프로필이 변경되면 첫 번째 프로필 자동 선택
  useEffect(() => {
    if (profiles.length > 0 && !profile1) {
      setProfile1(selectedProfile || profiles[0]);
    }
  }, [profiles, profile1, selectedProfile]);

  // 두 번째 사람 프로필: 저장된 선택 복원 (새로고침 후 한 번만)
  useEffect(() => {
    if (profiles.length === 0 || hasRestoredProfile2Ref.current) return;
    hasRestoredProfile2Ref.current = true;
    const savedId = localStorage.getItem(COMPAT_PROFILE2_KEY);
    if (!savedId) return;
    const saved = profiles.find((p) => p.id === savedId);
    if (saved) setProfile2(saved);
  }, [profiles]);

  // 두 번째 사람 선택 시 localStorage에 저장
  useEffect(() => {
    if (profile2?.id) {
      localStorage.setItem(COMPAT_PROFILE2_KEY, profile2.id);
    } else {
      localStorage.removeItem(COMPAT_PROFILE2_KEY);
    }
  }, [profile2?.id]);

  // 내역에서 진입 시: user_info로 profile1/profile2 매칭 복원
  useEffect(() => {
    const ui = pendingHistoryUserInfo;
    if (!ui?.user1?.birthDate || !ui.user2?.birthDate || profiles.length === 0) return;

    const norm = (s) => (s ? String(s).replace("Z", "").substring(0, 19) : "");
    const profileKey = (p) =>
      `${String(p.birth_date || "").substring(0, 10)}_${(p.birth_time || "").substring(0, 5)}`;
    const birthDateKey = (s) => {
      if (!s || typeof s !== "string") return "";
      const date = s.substring(0, 10);
      const time = s.length >= 16 ? s.substring(11, 16) : "";
      return `${date}_${time}`;
    };
    const match = (birthDateStr) => {
      const key = birthDateKey(birthDateStr);
      const normalized = norm(birthDateStr);
      return (
        profiles.find((p) => profileKey(p) === key) ||
        profiles.find((p) => norm(p.birth_date) === normalized) ||
        null
      );
    };

    const p1 = match(ui.user1.birthDate);
    const p2 = match(ui.user2.birthDate);
    if (p1) setProfile1(p1);
    if (p2) setProfile2(p2);
    setPendingHistoryUserInfo(null);
  }, [pendingHistoryUserInfo, profiles]);

  // URL에 공유 ID가 있는 경우 운세 조회
  useEffect(() => {
    const sharedId = searchParams.get("id");
    const fromHistory = searchParams.get("from") === "history"; // 내역에서 클릭한 경우

    if (sharedId) {
      if (fromHistory && user) {
        // 내역에서 클릭한 경우
        loadFromHistory(sharedId);
      } else if (!user) {
        // 비로그인 사용자: 공유 링크로 간주
        loadShared(sharedId);
      } else {
        // 로그인한 사용자가 직접 URL로 접근한 경우도 공유 링크로 간주
        loadShared(sharedId);
      }
    }
  }, [searchParams, user]);

  // 공유된 운세 조회 함수
  const loadShared = async (id) => {
    setLoading(true);
    setError("");

    try {
      const data = await loadSharedFortune(id);

      setInterpretation(data.interpretation);
      setIsSharedFortune(true);
      setShareId(id);
      setSharedUserInfo(data.userInfo);
    } catch (err) {
      console.error("❌ 공유된 궁합 조회 실패:", err);
      setError(err.message || "운세를 불러오는 중 오류가 발생했습니다.");
      setSearchParams({});
    } finally {
      setLoading(false);
    }
  };

  // 내역에서 클릭한 운세 조회 함수
  const loadFromHistory = async (id) => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchFortuneByResultId(id);

      if (!data) {
        throw new Error("운세를 찾을 수 없습니다.");
      }

      setInterpretation(data.interpretation);
      setShareId(data.shareId);
      setIsSharedFortune(false); // 내역에서 불러온 것이므로 공유 링크 아님
      setError("");
      // user_info가 있으면 profile1/profile2 복원용으로 저장 (위 useEffect에서 매칭)
      if (data.userInfo?.user1?.birthDate && data.userInfo?.user2?.birthDate) {
        setPendingHistoryUserInfo(data.userInfo);
      }
    } catch (err) {
      console.error("❌ 궁합 내역 조회 실패:", err);
      setError(err.message || "운세를 불러오는 중 오류가 발생했습니다.");
      setSearchParams({});
    } finally {
      setLoading(false);
    }
  };

  // 로그인 필요 액션 시 모달 표시 (진입 차단 대신 Soft Gating)
  const handleRequireLogin = () => {
    setShowLoginRequiredModal(true);
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

  // 프로필 삭제 시 해당 슬롯(첫 번째/두 번째 사람)을 가장 최근 등록 프로필로 갱신
  const handleDeleteProfile = useCallback(
    async (profileId) => {
      const newProfiles = await deleteProfile(profileId);
      const mostRecent =
        newProfiles?.length > 0 ? newProfiles[newProfiles.length - 1] : null;
      if (profile1?.id === profileId) setProfile1(mostRecent);
      if (profile2?.id === profileId) setProfile2(mostRecent);
    },
    [deleteProfile, profile1?.id, profile2?.id],
  );

  // 프로필이 없을 때 모달 표시 (사용자가 "나중에 하기"로 닫은 적 없을 때만)
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
  }, [user, profilesLoadedOnce, profilesLoading, profiles, showNoProfileModal, userDismissedNoProfileModal, isSharedFortune]);

  // 프로필이 생성되면 모달 닫기
  useEffect(() => {
    if (profiles.length > 0) {
      setShowNoProfileModal(false);
      setShowProfileModal(false);
      setUserDismissedNoProfileModal(false);
      clearProfileModalDismissed();
    }
  }, [profiles]);

  // 과거 내역이 아닌 일반 진입 시: 하단 결과 영역 비우기 (이전에 본 궁합 결과 노출 방지)
  useEffect(() => {
    if (!profile1 || isSharedFortune || !user) return;
    if (searchParams.get("id")) return; // URL에 id 있으면 내역에서 진입 → loadFromHistory에서 처리

    setInterpretation("");
    setShareId(null);
    setRestoring(false);
  }, [profile1?.id, isSharedFortune, user, searchParams]);

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

    if (!user) {
      setShowLoginRequiredModal(true);
      return;
    }

    // 공유 링크로 들어온 경우 로그인 필요 (이미 위에서 처리)

    // 두 프로필이 선택되었는지 확인
    if (!profile1) {
      setError("첫 번째 프로필을 선택해주세요.");
      return;
    }

    if (!profile2) {
      setError("두 번째 프로필을 선택해주세요.");
      return;
    }

    if (profile1.id === profile2.id) {
      setError("서로 다른 프로필을 선택해주세요.");
      return;
    }

    // 두 사람의 데이터 변환
    const user1 = convertProfileToApiFormat(profile1);
    const user2 = convertProfileToApiFormat(profile2);

    if (!user1 || !user2) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    const requiredStars = FORTUNE_STAR_COSTS.compatibility;
    try {
      const { paid: paidStars } = await fetchUserStars(user.id); // 망원경 개수만 사용
      const balanceStatus = checkStarBalance(paidStars, requiredStars);
      if (balanceStatus === "insufficient") {
        setStarModalData({
          type: "alert",
          requiredAmount: requiredStars,
          currentBalance: paidStars,
        });
        setShowStarModal(true);
        return;
      }
      setStarModalData({
        type: "confirm",
        requiredAmount: requiredStars,
        currentBalance: paidStars,
      });
      setShowStarModal(true);
    } catch (err) {
      setError(err?.message || "별 잔액 조회 중 오류가 발생했습니다.");
    }
  };

  const handleConfirmStarUsage = async () => {
    if (!user?.id || !profile1 || !profile2) return;

    const user1 = convertProfileToApiFormat(profile1);
    const user2 = convertProfileToApiFormat(profile2);
    if (!user1 || !user2) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setProcessStatus("waiting");
    setInterpretation("");
    setStreamingInterpretation("");
    setShareId(null);
    firstChunkReceivedRef.current = false;

    try {
      const requestBody = {
        fortuneType: "compatibility",
        reportType: "compatibility",
        user1,
        user2,
        relationshipType,
        profileId: profile1?.id ?? null,
        cost: FORTUNE_STAR_COSTS.compatibility,
        description: `${FORTUNE_TYPE_NAMES.compatibility} 조회`,
      };
      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: (text) => {
          if (!firstChunkReceivedRef.current) {
            firstChunkReceivedRef.current = true;
            setProcessStatus("streaming");
            requestAnimationFrame(() => {
              resultContainerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            });
          }
          setStreamingInterpretation((prev) => prev + text);
        },
        onDone: async ({ shareId: sid, fullText, fullData, debug }) => {
          setLoading(false);
          setProcessStatus("done");
          const data = fullData ?? debug;
          const text = fullText ?? data?.interpretation ?? "";
          setStreamingInterpretation("");
          if (data?.synastryResult) setSynastryResult(data.synastryResult);
          if (sid) {
            setShareId(sid);
            await saveFortuneHistory(profile1.id, "compatibility", sid);
          } else if (data?.share_id) {
            setShareId(data.share_id);
            await saveFortuneHistory(
              profile1.id,
              "compatibility",
              data.share_id,
            );
          }
          if (text) {
            setInterpretation(text);
          } else {
            setInterpretation("결과를 불러올 수 없습니다.");
          }
        },
        onError: async (err) => {
          setError(err?.message || "요청 중 오류가 발생했습니다.");
          setLoading(false);
          setProcessStatus("idle");
          alert("운세 생성에 실패했습니다. 소모된 운세권은 서버에서 자동으로 복구됩니다.");
        },
      });
    } catch (err) {
      setError(err.message || "요청 중 오류가 발생했습니다.");
      setLoading(false);
      setProcessStatus("idle");
    }
  };

  // 공유 링크 확인 (URL에 id 파라미터가 있는지)
  const sharedId = searchParams.get("id");
  const fromHistory = searchParams.get("from") === "history"; // 내역에서 클릭한 경우
  if (sharedId && !fromHistory) {
    // 내역에서 클릭한 경우가 아닐 때만 공유 링크 화면 표시
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
            className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
            style={{ position: "relative", zIndex: 1 }}
          >
            <FortuneResult
              title="관계의 화학작용 분석"
              interpretation={interpretation}
              shareId={shareId}
              isShared={true}
              shareSummary={compatibilityShareSummary}
            />

            {!user && (
              <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
                <p className="text-center text-slate-300 mb-4 text-base">
                  나도 내 궁합을 확인하고 싶다면?
                </p>
                <SocialLoginButtons />
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div
      className="w-full py-8 sm:py-12"
      style={{ position: "relative", zIndex: 1 }}
    >
      <AstrologyPageHelmet />
      <LoginRequiredModal
        isOpen={showLoginRequiredModal}
        onClose={() => setShowLoginRequiredModal(false)}
        description="진짜 궁합은 로그인 후 이용하실 수 있습니다."
      />
      <div
        className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 페이지 소개 - 진짜 궁합 (Synastry) */}
        <div className="mb-6 sm:mb-8">
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            단순히 관계가 좋고 나쁨을 따지는 것이 아닙니다. 각자 선호하는 부분과 거슬리고 불편하게 여기는 부분을 상대가 가지고 있는지 면밀히 판단하여 '이 사람에게 얼마나 끌리는지', '이 사람의 어떤 부분 떄문에 거슬리는지' 판단합니다. 이를 통해 둘의 인연 깊이를 알 수 있습니다.  
          </p>
        </div>

        {/* 프로필 선택 드롭다운 - 폼 밖으로 분리 */}
        <div className="mb-6 sm:mb-8 space-y-4">
          {/* 첫 번째 프로필 선택 */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-lg">
              💙 첫 번째 사람
            </h3>
            <ProfileSelector
              profiles={profiles}
              selectedProfile={profile1}
              onSelectProfile={setProfile1}
              onCreateProfile={() => {
                if (!user) {
                  setShowLoginRequiredModal(true);
                  return;
                }
                setShowProfileModal(true);
              }}
              onDeleteProfile={handleDeleteProfile}
              loading={profilesLoading}
            />
          </div>

          {/* VS 구분선 */}
          <div className="flex items-center justify-center py-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
            <div className="px-4 sm:px-6">
              <span className="text-2xl sm:text-3xl font-bold text-primary">
                VS
              </span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
          </div>

          {/* 두 번째 프로필 선택 */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-lg">
              💗 두 번째 사람
            </h3>
            <ProfileSelector
              profiles={profiles}
              selectedProfile={profile2}
              onSelectProfile={setProfile2}
              onCreateProfile={() => {
                if (!user) {
                  setShowLoginRequiredModal(true);
                  return;
                }
                setShowProfileModal(true);
              }}
              onDeleteProfile={handleDeleteProfile}
              loading={profilesLoading}
            />
          </div>
        </div>

        {/* 관계 유형 선택 */}
        <div className="mb-6 sm:mb-8">
          <h3 className="font-semibold text-white mb-3 text-lg">
            🤝 어떤 관계인가요?
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {[
              { value: "연인", label: "연인" },
              { value: "친구", label: "친구" },
              { value: "가족", label: "가족" },
              { value: "직장 동료", label: "직장 동료" },
              { value: "동업자", label: "동업자" },
              { value: "기타", label: "기타" },
            ].map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setRelationshipType(type.value)}
                className={`py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                  relationshipType === type.value
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                    : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700"
                }`}
              >
                <span className="text-sm sm:text-base">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 궁합 폼 컨테이너 */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 sm:space-y-6 mb-6 sm:mb-8"
        >
          <button
            type="submit"
            disabled={loading || !profile1 || !profile2}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 text-lg text-white font-semibold rounded-lg shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative touch-manipulation flex items-center justify-center gap-2 sm:gap-3 hover:shadow-[0_0_8px_rgba(97,72,235,0.3),0_0_12px_rgba(255,82,82,0.2)]"
            style={{
              zIndex: 1,
              position: "relative",
              background:
                "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
            }}
          >
            <span>진짜궁합 확인</span>
          </button>
          <Link
            to="/faq"
            className="block mt-3 text-center text-sm text-slate-400 hover:text-white transition-colors duration-200"
          >
            궁금한 점이 있으신가요?
          </Link>
        </form>

        {/* 로딩 모달: waiting 또는 streaming 상태에서 */}
        {(processStatus === "waiting" || processStatus === "streaming") && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4"
            role="dialog"
            aria-modal="true"
            aria-label="궁합 분석 중"
          >
            <div className="w-full max-w-md min-h-[300px] flex items-center justify-center">
              <TypewriterLoader />
            </div>
          </div>
        )}

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
        {!restoring && (processStatus === "done" || processStatus === "streaming" || interpretation) && (
          <div
            ref={resultContainerRef}
            className="transition-colors duration-300 rounded-xl"
          >
            <FortuneResult
              title="진짜 궁합"
              interpretation={interpretation || streamingInterpretation}
              shareId={shareId}
              shareSummary={compatibilityShareSummary}
            />
          </div>
        )}
      </div>
      <BottomNavigation activeTab="compatibility" />

      {/* 별 차감 확인 / 잔액 부족 모달 */}
      <StarModal
        isOpen={showStarModal}
        onClose={() => setShowStarModal(false)}
        type={starModalData.type}
        requiredAmount={starModalData.requiredAmount ?? starModalData.required}
        currentBalance={starModalData.currentBalance ?? starModalData.current}
        onConfirm={handleConfirmStarUsage}
        fortuneType={FORTUNE_TYPE_NAMES.compatibility}
      />

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
                  alt="진짜미래 고전 점성술 천체 운행 데이터 기반 인생 지도"
                  className="max-w-[100px] h-auto"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                환영합니다!
              </h2>
              <p className="text-slate-300">
                궁합을 확인하기 위해
                <br />
                최소 2개의 프로필이 필요합니다
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
            <button
              type="button"
              onClick={() => {
                setUserDismissedNoProfileModal(true);
                setProfileModalDismissed();
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

export default Compatibility;
