import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { getBrandImageAlt } from "../constants/seoMeta";
import LoginRequiredModal from "../components/LoginRequiredModal";
import {
  getProfileModalDismissed,
  setProfileModalDismissed,
  clearProfileModalDismissed,
} from "../utils/profileModalStorage";

function Compatibility() {
  const { t, i18n } = useTranslation();
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
  // 내역 결과를 표시 중인 동안 프로필 복원으로 인한 cleanup을 막는 플래그
  const isViewingHistoryRef = useRef(false);

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
  const [relationshipType, setRelationshipType] = useState("romantic"); // 관계 유형
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
    const name1 = profile1?.name || t("compatibility.person1_label");
    const name2 = profile2?.name || t("compatibility.person2_label");
    let phrase = t("compatibility.score_phrase_try");
    if (score >= 80) phrase = t("compatibility.score_phrase_great");
    else if (score >= 60) phrase = t("compatibility.score_phrase_good");
    else if (score >= 40) phrase = t("compatibility.score_phrase_okay");
    return `${name1} & ${name2} — ${score}pts! ${phrase}`;
  }, [synastryResult, profile1?.name, profile2?.name, t]);

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
      setProcessStatus("done");
      setError("");
      // user_info가 있으면 profile1/profile2 복원용으로 저장 (위 useEffect에서 매칭)
      if (data.userInfo?.user1?.birthDate && data.userInfo?.user2?.birthDate) {
        setPendingHistoryUserInfo(data.userInfo);
      }
      // 내역 결과 표시 중 플래그 세팅 → 프로필 복원으로 인한 cleanup effect를 모두 막음
      isViewingHistoryRef.current = true;
      setSearchParams({});
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

  // 프로필이 바뀌면 결과 영역 초기화 (내역 로드 중이거나 복원 중이면 스킵)
  useEffect(() => {
    if (!profile1 || isSharedFortune || !user) return;
    if (searchParams.get("id")) return; // URL에 id 있으면 아직 loadFromHistory 진행 중

    // 내역 로드 후 프로필 복원 과정에서 발동된 effect는 스킵
    if (isViewingHistoryRef.current) return;

    setInterpretation("");
    setStreamingInterpretation("");
    setSynastryResult(null);
    setProcessStatus("idle");
    setShareId(null);
    setRestoring(false);
  }, [profile1?.id, profile2?.id, isSharedFortune, user, searchParams]);

  // 사용자가 직접 프로필을 선택할 때: 내역 뷰 모드 해제 후 프로필 변경
  const handleSelectProfile1 = useCallback((profile) => {
    isViewingHistoryRef.current = false;
    setProfile1(profile);
  }, []);

  const handleSelectProfile2 = useCallback((profile) => {
    isViewingHistoryRef.current = false;
    setProfile2(profile);
  }, []);

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
      setError(t("compatibility.error_profile1"));
      return;
    }

    if (!profile2) {
      setError(t("compatibility.error_profile2"));
      return;
    }

    if (profile1.id === profile2.id) {
      setError(t("compatibility.error_same_profile"));
      return;
    }

    // 두 사람의 데이터 변환
    const user1 = convertProfileToApiFormat(profile1);
    const user2 = convertProfileToApiFormat(profile2);

    if (!user1 || !user2) {
      setError(t("compatibility.error_profile_invalid"));
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
      setError(err?.message || t("compatibility.error_balance"));
    }
  };

  const handleConfirmStarUsage = async () => {
    if (!user?.id || !profile1 || !profile2) return;

    const user1 = convertProfileToApiFormat(profile1);
    const user2 = convertProfileToApiFormat(profile2);
    if (!user1 || !user2) {
      setError(t("compatibility.error_profile_invalid"));
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
        language: i18n.language?.startsWith("en") ? "en" : "ko",
        timezoneOffset: new Date().getTimezoneOffset(),
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
            setInterpretation(t("compatibility.no_result"));
          }
        },
        onError: async (err) => {
          setError(err?.message || t("compatibility.error_request"));
          setLoading(false);
          setProcessStatus("idle");
          alert(t("compatibility.error_generate"));
        },
      });
    } catch (err) {
      setError(err.message || t("compatibility.error_request"));
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
              {t("compatibility.loading_shared")}
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
              title={t("compatibility.shared_title")}
              interpretation={interpretation}
              shareId={shareId}
              isShared={true}
              shareSummary={compatibilityShareSummary}
            />

            {!user && (
              <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
                <p className="text-center text-slate-300 mb-4 text-base">
                  {t("compatibility.shared_cta")}
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
        description={t("compatibility.login_desc")}
      />
      <div
        className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 페이지 소개 - 진짜 궁합 (Synastry) */}
        <div className="mb-6 sm:mb-8">
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            {t("compatibility.intro")}
          </p>
        </div>

        {/* 프로필 선택 드롭다운 - 폼 밖으로 분리 */}
        <div className="mb-6 sm:mb-8 space-y-4">
          {/* 첫 번째 프로필 선택 */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-lg">
              {t("compatibility.person1_label")}
            </h3>
            <ProfileSelector
              profiles={profiles}
              selectedProfile={profile1}
              onSelectProfile={handleSelectProfile1}
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
              {t("compatibility.person2_label")}
            </h3>
            <ProfileSelector
              profiles={profiles}
              selectedProfile={profile2}
              onSelectProfile={handleSelectProfile2}
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
            {t("compatibility.relationship_type_label")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {[
              { value: "romantic", label: t("compatibility.rel_lover") },
              { value: "friend", label: t("compatibility.rel_friend") },
              { value: "family", label: t("compatibility.rel_family") },
              { value: "coworker", label: t("compatibility.rel_coworker") },
              { value: "partner", label: t("compatibility.rel_partner") },
              { value: "other", label: t("compatibility.rel_other") },
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
            <span>{t("compatibility.submit_btn")}</span>
          </button>
          <Link
            to="/faq"
            className="block mt-3 text-center text-sm text-slate-400 hover:text-white transition-colors duration-200"
          >
            {t("compatibility.faq_link")}
          </Link>
        </form>

        {/* 로딩 모달: waiting 또는 streaming 상태에서 (포탈로 body에 렌더해 하단 탭까지 덮어 이탈 방지) */}
        {(processStatus === "waiting" || processStatus === "streaming") &&
          createPortal(
            <div
              className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4"
              role="dialog"
              aria-modal="true"
              aria-label="궁합 분석 중"
            >
              <div className="w-full max-w-md min-h-[300px] flex items-center justify-center">
                <TypewriterLoader />
              </div>
            </div>,
            document.body
          )}

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}
        {restoring && !interpretation && (
          <div className="mb-6 py-8 text-center text-slate-400 text-sm">
            {t("compatibility.restoring")}
          </div>
        )}
        {!restoring && (processStatus === "done" || processStatus === "streaming" || interpretation) && (
          <div
            ref={resultContainerRef}
            className="transition-colors duration-300 rounded-xl"
          >
            <FortuneResult
              title={t("compatibility.result_title")}
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
                  alt={getBrandImageAlt(i18n.language)}
                  className="max-w-[100px] h-auto"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {t("compatibility.welcome_title")}
              </h2>
              <p className="text-slate-300">
                {t("compatibility.welcome_subtitle").split("\n").map((line, i) => (
                  <span key={i}>{line}{i === 0 && <br />}</span>
                ))}
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
              {t("compatibility.register_profile")}
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
              {t("compatibility.do_it_later")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Compatibility;
