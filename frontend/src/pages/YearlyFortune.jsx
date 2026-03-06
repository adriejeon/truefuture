import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import BirthInputForm from "../components/BirthInputForm";
import BottomNavigation from "../components/BottomNavigation";
import FortuneResult from "../components/FortuneResult";
import SocialLoginButtons from "../components/SocialLoginButtons";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import TypewriterLoader from "../components/TypewriterLoader";
import PrimaryButton from "../components/PrimaryButton";
import StarModal from "../components/StarModal";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { restoreFortuneIfExists } from "../services/fortuneService";
import { loadSharedFortune } from "../utils/sharedFortune";
import { invokeGetFortuneStream } from "../utils/getFortuneStream";
import {
  FORTUNE_STAR_COSTS,
  FORTUNE_TYPE_NAMES,
  fetchUserStars,
  consumeStars,
  checkStarBalance,
  refundStars,
} from "../utils/starConsumption";
import AstrologyPageHelmet from "../components/AstrologyPageHelmet";
import LoginRequiredModal from "../components/LoginRequiredModal";
import {
  getProfileModalDismissed,
  setProfileModalDismissed,
  clearProfileModalDismissed,
} from "../utils/profileModalStorage";

// 운세 타입 탭
const FORTUNE_TABS = [
  { id: "daily", label: "데일리 운세", type: "daily" },
  { id: "lifetime", label: "종합 운세", type: "lifetime" },
];

function YearlyFortune() {
  const [activeTab, setActiveTab] = useState("daily");
  const { user, loadingAuth } = useAuth();
  const { stars } = useStars();
  const {
    profiles,
    selectedProfile,
    loading: profilesLoading,
    profilesLoadedOnce,
    createProfile,
    deleteProfile,
    selectProfile,
    checkFortuneAvailability,
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
  const [shareId, setShareId] = useState(null);
  const [isSharedFortune, setIsSharedFortune] = useState(false);
  const [sharedUserInfo, setSharedUserInfo] = useState(null);
  const [sharedFortuneType, setSharedFortuneType] = useState(null); // "daily" | "lifetime" (공유 페이지 타이틀용)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNoProfileModal, setShowNoProfileModal] = useState(false);
  const [userDismissedNoProfileModal, setUserDismissedNoProfileModal] =
    useState(getProfileModalDismissed);
  const [restoring, setRestoring] = useState(false);
  const [fortuneTab, setFortuneTab] = useState("daily"); // "daily" | "yearly" | "lifetime"
  const [fromCache, setFromCache] = useState(false);
  const [fortuneDate, setFortuneDate] = useState("");
  const [loadingCache, setLoadingCache] = useState(false);
  // 조회 가능 여부 (null: 미확인, true: 조회 가능, false: 이미 사용함)
  const [fortuneAvailability, setFortuneAvailability] = useState({
    daily: null,
    lifetime: null,
  });
  const [showStarModalDaily, setShowStarModalDaily] = useState(false);
  const [starModalDataDaily, setStarModalDataDaily] = useState({
    type: "confirm",
    required: FORTUNE_STAR_COSTS.daily,
    current: 0,
  });
  const [showStarModalLifetime, setShowStarModalLifetime] = useState(false);
  const [starModalDataLifetime, setStarModalDataLifetime] = useState({
    type: "confirm",
    required: 1,
    current: 0,
  });
  const [showLoginRequiredModal, setShowLoginRequiredModal] = useState(false);

  // 데일리 운세용: 한국 시간 기준 오늘 날짜
  const getKoreaTime = () => {
    const now = new Date();
    return new Date(now.getTime() + 9 * 60 * 60 * 1000);
  };
  const getTodayDate = () => {
    const koreaTime = getKoreaTime();
    const year = koreaTime.getUTCFullYear();
    const month = String(koreaTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(koreaTime.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const isWithinDailyFortuneTime = () => {
    const koreaTime = getKoreaTime();
    const hour = koreaTime.getUTCHours();
    const minute = koreaTime.getUTCMinutes();
    if (hour === 0 && minute < 1) return false;
    return true;
  };
  const getTodayFortuneFromStorage = (profileId) => {
    if (!profileId) return null;
    try {
      const storageKey = `daily_fortune_${profileId}`;
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;
      const fortuneData = JSON.parse(stored);
      if (fortuneData.date === getTodayDate()) return fortuneData;
      localStorage.removeItem(storageKey);
      return null;
    } catch (err) {
      console.error("로컬스토리지 읽기 에러:", err);
      return null;
    }
  };
  const saveTodayFortuneToStorage = (profileId, fortuneData) => {
    if (!profileId) return;
    try {
      const todayDate = getTodayDate();
      const dataToSave = {
        date: todayDate,
        interpretation: fortuneData.interpretation,
        chart: fortuneData.chart,
        transitChart: fortuneData.transitChart,
        aspects: fortuneData.aspects,
        transitMoonHouse: fortuneData.transitMoonHouse,
        shareId: fortuneData.shareId,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(
        `daily_fortune_${profileId}`,
        JSON.stringify(dataToSave)
      );
    } catch (err) {
      console.error("❌ 로컬스토리지 저장 에러:", err);
    }
  };

  // URL에 공유 ID가 있는 경우 운세 조회
  useEffect(() => {
    const sharedId = searchParams.get("id");

    if (sharedId) {
      loadShared(sharedId);
    }
  }, [searchParams]);

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
      setSharedFortuneType(data.fortuneType || null);
    } catch (err) {
      console.error("❌ 공유된 1년 운세 조회 실패:", err);
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

  // 탭/프로필별 저장된 결과 복구
  useEffect(() => {
    if (!selectedProfile || isSharedFortune || !user) return;
    if (searchParams.get("id")) return;
    // 결제 완료 복귀면 복구하지 않음
    if (searchParams.get("payment_completed") === "true") return;

    if (fortuneTab === "daily") {
      setLoadingCache(true);
      const stored = getTodayFortuneFromStorage(selectedProfile.id);
      if (stored) {
        setInterpretation(stored.interpretation);
        setFromCache(true);
        setFortuneDate(stored.date);
        setShareId(stored.shareId || null);
      } else {
        (async () => {
          try {
            const restored = await restoreFortuneIfExists(
              selectedProfile.id,
              "daily"
            );
            if (restored) {
              setInterpretation(restored.interpretation);
              setFromCache(true);
              setFortuneDate(getTodayDate());
              setShareId(restored.shareId || null);
              saveTodayFortuneToStorage(selectedProfile.id, {
                interpretation: restored.interpretation,
                chart: restored.chart,
                transitChart: restored.transitChart,
                aspects: restored.aspects,
                transitMoonHouse: restored.transitMoonHouse,
                shareId: restored.shareId,
              });
            } else {
              setInterpretation("");
              setFromCache(false);
              setFortuneDate("");
              setShareId(null);
            }
          } finally {
            setLoadingCache(false);
          }
        })();
        return;
      }
      setLoadingCache(false);
      return;
    }

    setRestoring(true);
    let cancelled = false;
    const type = "lifetime"; // daily가 아니면 lifetime만 사용

    (async () => {
      try {
        const restored = await restoreFortuneIfExists(selectedProfile.id, type);
        if (cancelled) return;
        if (restored) {
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
  }, [selectedProfile?.id, isSharedFortune, user, searchParams, fortuneTab]);

  // 프로필 선택 시 데일리/종합 운세 조회 가능 여부 체크 (버튼 비활성화용)
  useEffect(() => {
    if (!selectedProfile?.id || !user) {
      setFortuneAvailability({ daily: null, lifetime: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const [dailyRes, lifetimeRes] = await Promise.all([
        checkFortuneAvailability(selectedProfile.id, "daily"),
        checkFortuneAvailability(selectedProfile.id, "lifetime"),
      ]);
      if (cancelled) return;
      setFortuneAvailability({
        daily: dailyRes.available,
        lifetime: lifetimeRes.available,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProfile?.id, user, checkFortuneAvailability]);

  // 프로필 생성 핸들러
  const handleCreateProfile = useCallback(
    async (profileData) => {
      await createProfile(profileData);
      // 프로필 생성 후 모달은 ProfileModal의 onClose에서 처리됨
    },
    [createProfile]
  );

  const handleSubmitDaily = async (e) => {
    e.preventDefault();
    if (!user) {
      setShowLoginRequiredModal(true);
      return;
    }
    if (!selectedProfile) {
      setError("프로필을 선택해주세요.");
      setShowProfileModal(true);
      return;
    }
    const availability = await checkFortuneAvailability(
      selectedProfile.id,
      "daily"
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
    if (!isWithinDailyFortuneTime()) {
      setError("오늘의 운세는 00시 1분부터 확인하실 수 있습니다.");
      return;
    }
    const existingFortune = getTodayFortuneFromStorage(selectedProfile.id);
    if (existingFortune) {
      setError(
        "오늘의 운세를 이미 확인하셨습니다. 내일 00시 1분 이후에 새로운 운세를 확인하실 수 있습니다."
      );
      setInterpretation(existingFortune.interpretation);
      setFromCache(true);
      setFortuneDate(existingFortune.date);
      return;
    }

    const requiredStars = FORTUNE_STAR_COSTS.daily;
    try {
      // 데일리 운세는 데일리 운세권(bonus)을 확인해야 함
      const { bonus: bonusStars } = await fetchUserStars(user.id);
      const balanceStatus = checkStarBalance(bonusStars, requiredStars);
      if (balanceStatus === "insufficient") {
      setStarModalDataDaily({
        type: "alert",
        requiredAmount: requiredStars,
        currentBalance: bonusStars,
        fortuneType: "오늘 운세",
      });
      setShowStarModalDaily(true);
      return;
    }
    setStarModalDataDaily({
      type: "confirm",
      requiredAmount: requiredStars,
      currentBalance: bonusStars,
      fortuneType: "오늘 운세",
    });
    setShowStarModalDaily(true);
    } catch (err) {
      setError(err?.message || "운세권 잔액 조회 중 오류가 발생했습니다.");
    }
  };

  const handleConfirmStarUsageDaily = async () => {
    if (!user?.id || !selectedProfile) return;

    const formData = convertProfileToApiFormat(selectedProfile);
    if (!formData) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setProcessStatus("waiting");
    setInterpretation("");
    setStreamingInterpretation("");
    firstChunkReceivedRef.current = false;

    try {
      await consumeStars(
        user.id,
        FORTUNE_STAR_COSTS.daily,
        `${FORTUNE_TYPE_NAMES.daily} 조회`
      );
    } catch (err) {
      setError(err?.message || "별 차감에 실패했습니다.");
      setLoading(false);
      setProcessStatus("idle");
      return;
    }

    try {
      const requestBody = {
        ...formData,
        fortuneType: "daily",
        reportType: "daily",
        profileName: selectedProfile.name || null,
        profileId: selectedProfile?.id ?? null,
      };
      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: (text) => {
          if (!firstChunkReceivedRef.current) {
            firstChunkReceivedRef.current = true;
            setProcessStatus("streaming");
            requestAnimationFrame(() => {
              resultContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
          setStreamingInterpretation((prev) => prev + text);
        },
        onDone: async ({ shareId: currentShareId, fullText, fullData, debug }) => {
          setLoading(false);
          setProcessStatus("done");
          const text = fullText ?? fullData?.interpretation ?? "";
          setStreamingInterpretation("");
          if (text) {
            const todayDate = getTodayDate();
            const sid = currentShareId ?? fullData?.share_id ?? null;
            setShareId(sid);
            saveTodayFortuneToStorage(selectedProfile.id, {
              interpretation: text,
              chart: fullData?.chart ?? debug?.chart,
              transitChart: fullData?.transitChart ?? debug?.transitChart,
              aspects: fullData?.aspects ?? debug?.aspects,
              transitMoonHouse: fullData?.transitMoonHouse ?? debug?.transitMoonHouse,
              shareId: sid,
            });
            await saveFortuneHistory(selectedProfile.id, "daily", sid ?? undefined);
            setFortuneAvailability((prev) => ({ ...prev, daily: false }));
            setInterpretation(text);
            setFromCache(false);
            setFortuneDate(todayDate);
          } else {
            setInterpretation("결과를 불러올 수 없습니다.");
          }
        },
        onError: async (err, options) => {
          setError(err?.message || "요청 중 오류가 발생했습니다.");
          setLoading(false);
          setProcessStatus("idle");
          if (options?.shouldRefund) {
            try {
              await refundStars(
                user.id,
                FORTUNE_STAR_COSTS.daily,
                "운세 생성 실패(에러/타임아웃)로 인한 자동 환불",
                `${FORTUNE_TYPE_NAMES.daily} 조회`
              );
              alert("네트워크 지연 또는 에러로 운세 생성에 실패하여 소모된 운세권이 복구되었습니다.");
            } catch (refundErr) {
              console.error("환불 처리 실패:", refundErr);
            }
          }
        },
      });
    } catch (err) {
      setError(err.message || "요청 중 오류가 발생했습니다.");
      setLoading(false);
      setProcessStatus("idle");
    }
  };

  const handleSubmitLifetime = async (e) => {
    e.preventDefault();
    if (!user) {
      setShowLoginRequiredModal(true);
      return;
    }
    if (!selectedProfile) {
      setError("프로필을 선택해주세요.");
      setShowProfileModal(true);
      return;
    }
    const availability = await checkFortuneAvailability(
      selectedProfile.id,
      "lifetime"
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

    const requiredProbe = 1;
    const currentProbe = stars?.probe ?? 0;
    const balanceStatus = checkStarBalance(currentProbe, requiredProbe);

    if (balanceStatus === "insufficient") {
      setStarModalDataLifetime({
        type: "alert",
        requiredAmount: requiredProbe,
        currentBalance: currentProbe,
        fortuneType: FORTUNE_TYPE_NAMES.lifetime,
      });
      setShowStarModalLifetime(true);
      setError("");
      return;
    }
    setStarModalDataLifetime({
      type: "confirm",
      requiredAmount: requiredProbe,
      currentBalance: currentProbe,
      fortuneType: FORTUNE_TYPE_NAMES.lifetime,
    });
    setShowStarModalLifetime(true);
    setError("");
  };

  const handleConfirmStarUsageLifetime = useCallback(async () => {
    if (!user?.id || !selectedProfile) return;

    setShowStarModalLifetime(false);

    const formData = convertProfileToApiFormat(selectedProfile);
    if (!formData) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setProcessStatus("waiting");
    setInterpretation("");
    setShareId(null);

    try {
      await consumeStars(
        user.id,
        1,
        "종합운세 조회"
      );
    } catch (err) {
      setError(err?.message || "탐사선 차감에 실패했습니다.");
      setLoading(false);
      setProcessStatus("idle");
      return;
    }

    try {
      const requestBody = {
        ...formData,
        fortuneType: "lifetime",
        reportType: "lifetime",
        profileName: selectedProfile.name || null,
        profileId: selectedProfile?.id ?? null,
      };
      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: () => {},
        onDone: async ({ fullData, debug }) => {
          const data = fullData ?? debug;
          setLoading(false);
          setProcessStatus("done");
          if (data?.interpretation && typeof data.interpretation === "string") {
            setInterpretation(data.interpretation);
            setShareId(data.share_id || null);
            await saveFortuneHistory(
              selectedProfile.id,
              "lifetime",
              data.share_id ?? undefined
            );
            setFortuneAvailability((prev) => ({ ...prev, lifetime: false }));
            requestAnimationFrame(() => {
              resultContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          } else {
            setInterpretation("결과를 불러올 수 없습니다.");
          }
        },
        onError: async (err, options) => {
          setError(err?.message || "요청 중 오류가 발생했습니다.");
          setLoading(false);
          setProcessStatus("idle");
          if (options?.shouldRefund) {
            try {
              await refundStars(
                user.id,
                1,
                "운세 생성 실패(에러/타임아웃)로 인한 자동 환불",
                `${FORTUNE_TYPE_NAMES.lifetime} 조회`
              );
              alert("네트워크 지연 또는 에러로 운세 생성에 실패하여 소모된 운세권이 복구되었습니다.");
            } catch (refundErr) {
              console.error("환불 처리 실패:", refundErr);
            }
          }
        },
      });
    } catch (err) {
      setError(err.message || "요청 중 오류가 발생했습니다.");
      setLoading(false);
      setProcessStatus("idle");
    }
  }, [user?.id, selectedProfile, saveFortuneHistory]);

  // 데일리: 이미 오늘 조회함(DB 또는 로컬캐시) 또는 조회 불가면 버튼 비활성화
  const canViewDaily =
    fortuneAvailability.daily === true &&
    !getTodayFortuneFromStorage(selectedProfile?.id);
  const canViewLifetime = fortuneAvailability.lifetime === true;

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
      const profileName = sharedUserInfo?.profileName?.trim() || "";
      const sharedTitle =
        sharedFortuneType === "daily"
          ? `${profileName ? `${profileName}님의 ` : ""}진짜 오늘이에요`
          : sharedFortuneType === "lifetime"
          ? `${profileName ? `${profileName}님의 ` : ""}진짜 인생이에요`
          : profileName ? `${profileName}님의 운세` : "공유된 운세";

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
        </div>
      );
    }
  }

  const getSubmitHandler = () => {
    if (fortuneTab === "daily") return handleSubmitDaily;
    return handleSubmitLifetime;
  };
  const getResultTitle = () => {
    if (fortuneTab === "daily") return "진짜 오늘";
    return "내 인생 사용 설명서";
  };
  const showRestoring = fortuneTab !== "daily" && restoring && !interpretation;
  const showLoadingCache = fortuneTab === "daily" && loadingCache;

  return (
    <div
      className="w-full py-8 sm:py-12"
      style={{ position: "relative", zIndex: 1 }}
    >
      <AstrologyPageHelmet />
      <LoginRequiredModal
        isOpen={showLoginRequiredModal}
        onClose={() => setShowLoginRequiredModal(false)}
        description="진짜 운세는 로그인 후 이용하실 수 있습니다."
      />
      <div
        className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 페이지 타이틀 - 진짜 운세 */}
        <div className="mb-4">
          <p className="text-slate-300 text-sm sm:text-base">
            데일리 운세와 종합 운세를 확인해 보세요.
          </p>
        </div>

        {/* 탭: 데일리 운세 | 종합 운세 */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ backgroundColor: '#121230' }}>
          {[
            { id: "daily", label: "데일리 운세" },
            { id: "lifetime", label: "종합 운세" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setFortuneTab(tab.id);
                setError("");
              }}
              className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-md transition-colors ${
                fortuneTab === tab.id
                  ? "bg-primary text-black"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭별 소개 */}
        {fortuneTab === "daily" && (
          <div className="mb-6 sm:mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">
              오늘의 나침반
            </h3>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              낯선 여행지에서 지도가 필요하듯, 오늘이라는 하루에도 방향이 필요합니다. 행성들이 가리키는 길을 미리 확인하고, 헤매지 않는 하루를 보내세요.
            </p>
          </div>
        )}
        {fortuneTab === "lifetime" && (
          <div className="mb-6 sm:mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">
              내 인생 사용 설명서
            </h3>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              태어난 순간, 별들이 그려낸 고유한 설계도입니다. 타고난 기질과
              잠재력, 인생의 방향성을 확인하고 나를 잘 쓰는 방법을 알아보세요.
            </p>
          </div>
        )}

        {/* 프로필 선택 */}
        <div className="mb-6 sm:mb-8">
          <ProfileSelector
            profiles={profiles}
            selectedProfile={selectedProfile}
            onSelectProfile={selectProfile}
            onCreateProfile={() => {
              if (!user) {
                setShowLoginRequiredModal(true);
                return;
              }
              setShowProfileModal(true);
            }}
            onDeleteProfile={deleteProfile}
            loading={profilesLoading}
          />
        </div>

        <form
          onSubmit={getSubmitHandler()}
          className="space-y-4 sm:space-y-6 mb-6 sm:mb-8"
        >
          <PrimaryButton
            type="submit"
            disabled={
              loading ||
              !selectedProfile ||
              (fortuneTab === "daily" && loadingCache) ||
              (fortuneTab === "daily" && !canViewDaily) ||
              (fortuneTab === "lifetime" && !canViewLifetime)
            }
            fullWidth
          >
            진짜미래 확인
          </PrimaryButton>
          <Link
            to="/faq"
            className="block mt-3 text-center text-sm text-slate-400 hover:text-white transition-colors duration-200"
          >
            궁금한 점이 있으신가요?
          </Link>
        </form>

        {/* 로딩 모달: waiting 상태에서만 */}
        {(processStatus === "waiting" || processStatus === "streaming") && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4"
            role="dialog"
            aria-modal="true"
            aria-label="운세 분석 중"
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
        {showLoadingCache && (
          <div className="mb-6 py-8 text-center text-slate-400 text-sm">
            오늘의 운세 확인 중...
          </div>
        )}
        {showRestoring && (
          <div className="mb-6 py-8 text-center text-slate-400 text-sm">
            이전 결과 불러오는 중...
          </div>
        )}
        {fortuneTab === "daily" &&
          fromCache &&
          interpretation &&
          !loadingCache && (
            <div className="mb-4 px-4 py-2 border rounded-lg border-slate-600">
              <p className="text-slate-300 text-sm">
                내일 새로운 운세를 확인하러 또 오세요!
              </p>
            </div>
          )}
        {!showLoadingCache && !showRestoring && (processStatus === "done" || processStatus === "streaming" || interpretation) && (
          <div
            ref={resultContainerRef}
            className="transition-colors duration-300 rounded-xl"
          >
            <FortuneResult
              title={getResultTitle()}
              interpretation={interpretation || streamingInterpretation}
              shareId={shareId}
              profileName={selectedProfile?.name}
            />
          </div>
        )}
      </div>
      <BottomNavigation activeTab="yearly" />

      {/* 데일리 운세 별 차감 확인 / 잔액 부족 모달 */}
      <StarModal
        isOpen={showStarModalDaily}
        onClose={() => setShowStarModalDaily(false)}
        type={starModalDataDaily.type}
        requiredAmount={
          starModalDataDaily.requiredAmount ?? starModalDataDaily.required
        }
        currentBalance={
          starModalDataDaily.currentBalance ?? starModalDataDaily.current
        }
        onConfirm={handleConfirmStarUsageDaily}
        fortuneType={FORTUNE_TYPE_NAMES.daily}
      />

      {/* 종합운세 탐사선 차감 확인 / 잔액 부족 모달 */}
      <StarModal
        isOpen={showStarModalLifetime}
        onClose={() => setShowStarModalLifetime(false)}
        type={starModalDataLifetime.type}
        requiredAmount={
          starModalDataLifetime.requiredAmount ?? starModalDataLifetime.required
        }
        currentBalance={
          starModalDataLifetime.currentBalance ?? starModalDataLifetime.current
        }
        onConfirm={handleConfirmStarUsageLifetime}
        fortuneType={FORTUNE_TYPE_NAMES.lifetime}
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

export default YearlyFortune;
