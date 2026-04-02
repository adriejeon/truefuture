import { useState, useCallback, useEffect, useRef } from "react";
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
import PrimaryButton from "../components/PrimaryButton";
import StarModal from "../components/StarModal";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { restoreFortuneIfExists, getLocalTodayDate, fetchDrawnDailyDates } from "../services/fortuneService";
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

function YearlyFortune() {
  const { t, i18n } = useTranslation();
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
  // 지정일 데일리 운세: 선택 날짜 (YYYY-MM-DD, 기본값=오늘 KST)
  const [dailyTargetDate, setDailyTargetDate] = useState("");
  // 어느 profileId에 대해 이미 날짜 초기화를 완료했는지 추적 (중복 초기화 방지)
  const dateInitProfileRef = useRef(null);

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

  const formatDateForLocale = (ymd) => {
    const match = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return t("yearly_fortune.today_fallback");
    const [, yyyy, mm, dd] = match;
    const month = parseInt(mm, 10);
    const day = parseInt(dd, 10);
    if (i18n.language?.startsWith("en")) {
      const date = new Date(parseInt(yyyy, 10), month - 1, day);
      return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    }
    return `${month}월 ${day}일`;
  };
  const isWithinDailyFortuneTime = () => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < 1) return false;
    return true;
  };
  // 프로필이 확정되면 뽑아둔 날짜를 조회해 dailyTargetDate를 초기화
  // 같은 프로필에 대해서는 최초 1회만 실행 (사용자가 직접 바꾼 날짜를 덮어쓰지 않기 위해)
  useEffect(() => {
    if (!selectedProfile?.id || !user) {
      if (!dailyTargetDate) setDailyTargetDate(getLocalTodayDate());
      return;
    }

    // 이미 이 프로필로 초기화 완료했으면 재실행 안 함
    if (dateInitProfileRef.current === selectedProfile.id) return;

    let cancelled = false;
    (async () => {
      try {
        const dates = await fetchDrawnDailyDates(selectedProfile.id);
        if (cancelled) return;
        dateInitProfileRef.current = selectedProfile.id;

        const today = getLocalTodayDate();
        // 오늘 이후 뽑아둔 날짜 중 가장 가까운 것을 우선, 없으면 오늘
        const firstDrawn = dates.find((d) => d >= today);
        setDailyTargetDate(firstDrawn || today);
      } catch (_) {
        if (!cancelled) {
          dateInitProfileRef.current = selectedProfile.id;
          setDailyTargetDate(getLocalTodayDate());
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile?.id, user]);

  const getDailyFortuneFromStorage = (profileId, targetDate) => {
    if (!profileId || !targetDate) return null;
    try {
      const storageKey = `daily_fortune_${profileId}_${targetDate}`;
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;
      const fortuneData = JSON.parse(stored);
      // 날짜별 캐시이므로 date 불일치면 그냥 무시(삭제는 하지 않음)
      if (fortuneData.date === targetDate) return fortuneData;
      return null;
    } catch (err) {
      console.error("로컬스토리지 읽기 에러:", err);
      return null;
    }
  };
  const saveDailyFortuneToStorage = (profileId, targetDate, fortuneData) => {
    if (!profileId || !targetDate) return;
    try {
      const dataToSave = {
        date: targetDate,
        interpretation: fortuneData.interpretation,
        chart: fortuneData.chart,
        transitChart: fortuneData.transitChart,
        aspects: fortuneData.aspects,
        transitMoonHouse: fortuneData.transitMoonHouse,
        shareId: fortuneData.shareId,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(
        `daily_fortune_${profileId}_${targetDate}`,
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
      const today = getLocalTodayDate();
      const targetDate = dailyTargetDate || today;

      // 과거 날짜는 표시하지 않음
      if (targetDate < today) {
        setInterpretation("");
        setFromCache(false);
        setFortuneDate("");
        setShareId(null);
        return;
      }

      setLoadingCache(true);
      const stored = getDailyFortuneFromStorage(selectedProfile.id, targetDate);
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
              "daily",
              targetDate
            );
            if (restored) {
              setInterpretation(restored.interpretation);
              setFromCache(true);
              setFortuneDate(targetDate);
              setShareId(restored.shareId || null);
              saveDailyFortuneToStorage(selectedProfile.id, targetDate, {
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
        if (!cancelled) setError(err.message || t("yearly_fortune.error_restore"));
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedProfile?.id,
    isSharedFortune,
    user,
    searchParams,
    fortuneTab,
    dailyTargetDate,
  ]);

  // 프로필 선택 시 데일리/종합 운세 조회 가능 여부 체크 (버튼 비활성화용)
  useEffect(() => {
    if (!selectedProfile?.id || !user) {
      setFortuneAvailability({ daily: null, lifetime: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const [dailyRes, lifetimeRes] = await Promise.all([
        checkFortuneAvailability(
          selectedProfile.id,
          "daily",
          dailyTargetDate || getLocalTodayDate()
        ),
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
  }, [selectedProfile?.id, user, checkFortuneAvailability, dailyTargetDate]);

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
      setError(t("yearly_fortune.error_profile"));
      setShowProfileModal(true);
      return;
    }
    const availability = await checkFortuneAvailability(
      selectedProfile.id,
      "daily",
      dailyTargetDate || getLocalTodayDate()
    );
    if (!availability.available) {
      setError(availability.reason);
      return;
    }
    const formData = convertProfileToApiFormat(selectedProfile);
    if (!formData) {
      setError(t("yearly_fortune.error_profile_invalid"));
      return;
    }
    const targetDate = dailyTargetDate || getLocalTodayDate();
    // 오늘 날짜를 선택했을 때만 "00:01 이후" 제한 적용 (지정일은 제한 없음)
    if (targetDate === getLocalTodayDate() && !isWithinDailyFortuneTime()) {
      setError(t("yearly_fortune.error_time"));
      return;
    }
    const existingFortune = getDailyFortuneFromStorage(
      selectedProfile.id,
      targetDate
    );
    if (existingFortune) {
      setError(t("yearly_fortune.error_already_viewed"));
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
      fortuneType: "선택한 날짜 운세",
    });
    setShowStarModalDaily(true);
    } catch (err) {
      setError(err?.message || t("yearly_fortune.error_balance"));
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
      const targetDate = dailyTargetDate || getLocalTodayDate();
      const requestBody = {
        ...formData,
        fortuneType: "daily",
        reportType: "daily",
        targetDate,
        profileName: selectedProfile.name || null,
        profileId: selectedProfile?.id ?? null,
        cost: FORTUNE_STAR_COSTS.daily,
        description: `${FORTUNE_TYPE_NAMES.daily} 조회`,
        language: i18n.language?.startsWith("en") ? "en" : "ko",
        timezoneOffset: new Date().getTimezoneOffset(),
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
            const sid = currentShareId ?? fullData?.share_id ?? null;
            setShareId(sid);
            saveDailyFortuneToStorage(selectedProfile.id, targetDate, {
              interpretation: text,
              chart: fullData?.chart ?? debug?.chart,
              transitChart: fullData?.transitChart ?? debug?.transitChart,
              aspects: fullData?.aspects ?? debug?.aspects,
              transitMoonHouse:
                fullData?.transitMoonHouse ?? debug?.transitMoonHouse,
              shareId: sid,
            });
            await saveFortuneHistory(
              selectedProfile.id,
              "daily",
              sid ?? undefined,
              targetDate
            );
            setFortuneAvailability((prev) => ({ ...prev, daily: false }));
            setInterpretation(text);
            setFromCache(false);
            setFortuneDate(targetDate);
          } else {
            setInterpretation(t("yearly_fortune.no_result"));
          }
        },
        onError: async (err) => {
          setError(err?.message || t("yearly_fortune.error_request"));
          setLoading(false);
          setProcessStatus("idle");
          alert(t("yearly_fortune.error_generate"));
        },
      });
    } catch (err) {
      setError(err.message || t("yearly_fortune.error_request"));
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
      setError(t("yearly_fortune.error_profile"));
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
      setError(t("yearly_fortune.error_profile_invalid"));
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
      setError(t("yearly_fortune.error_profile_invalid"));
      return;
    }

    setLoading(true);
    setError("");
    setProcessStatus("waiting");
    setInterpretation("");
    setShareId(null);

    try {
      const requestBody = {
        ...formData,
        fortuneType: "lifetime",
        reportType: "lifetime",
        profileName: selectedProfile.name || null,
        profileId: selectedProfile?.id ?? null,
        cost: 1,
        description: "종합운세 조회",
        language: i18n.language?.startsWith("en") ? "en" : "ko",
        timezoneOffset: new Date().getTimezoneOffset(),
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
            setInterpretation(t("yearly_fortune.no_result"));
          }
        },
        onError: async (err) => {
          setError(err?.message || t("yearly_fortune.error_request"));
          setLoading(false);
          setProcessStatus("idle");
          alert(t("yearly_fortune.error_generate"));
        },
      });
    } catch (err) {
      setError(err.message || t("yearly_fortune.error_request"));
      setLoading(false);
      setProcessStatus("idle");
    }
  }, [user?.id, selectedProfile, saveFortuneHistory, t]);

  // 데일리: 이미 오늘 조회함(DB 또는 로컬캐시) 또는 조회 불가면 버튼 비활성화
  const canViewDaily =
    !getDailyFortuneFromStorage(
      selectedProfile?.id,
      dailyTargetDate || getLocalTodayDate()
    );
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
              {t("yearly_fortune.loading_shared")}
            </p>
          </div>
        </div>
      );
    }
    if (isSharedFortune && interpretation) {
      const profileName = sharedUserInfo?.profileName?.trim() || "";
      const sharedTargetDate =
        sharedUserInfo?.targetDate ||
        sharedUserInfo?.target_date ||
        sharedUserInfo?.metadata?.targetDate ||
        null;
      const sharedTitle =
        sharedFortuneType === "daily"
          ? profileName
            ? t("yearly_fortune.shared_title_daily", { name: profileName, date: formatDateForLocale(sharedTargetDate) })
            : formatDateForLocale(sharedTargetDate)
          : sharedFortuneType === "lifetime"
          ? profileName
            ? t("yearly_fortune.shared_title_lifetime", { name: profileName })
            : t("yearly_fortune.result_title_lifetime")
          : profileName
          ? t("yearly_fortune.shared_title_default", { name: profileName })
          : t("yearly_fortune.shared_title_no_name");

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
                  {t("yearly_fortune.shared_cta")}
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
    if (fortuneTab === "daily") {
      const dateForTitle = dailyTargetDate || fortuneDate || getLocalTodayDate();
      return formatDateForLocale(dateForTitle);
    }
    return t("yearly_fortune.result_title_lifetime");
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
        description={t("yearly_fortune.login_desc")}
      />
      <div
        className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 페이지 타이틀 - 진짜 운세 */}
        <div className="mb-4">
          <p className="text-slate-300 text-sm sm:text-base">
            {t("yearly_fortune.subtitle")}
          </p>
        </div>

        {/* 탭: 데일리 운세 | 종합 운세 */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ backgroundColor: '#121230' }}>
          {[
            { id: "daily", label: t("yearly_fortune.tab_daily") },
            { id: "lifetime", label: t("yearly_fortune.tab_lifetime") },
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
              {t("yearly_fortune.daily_title")}
            </h3>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              {t("yearly_fortune.daily_desc")}
            </p>
          </div>
        )}
        {fortuneTab === "lifetime" && (
          <div className="mb-6 sm:mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">
              {t("yearly_fortune.lifetime_title")}
            </h3>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              {t("yearly_fortune.lifetime_desc")}
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
          {fortuneTab === "daily" && (
            <div className="space-y-2">
              <label className="block text-sm text-slate-300">
                {t("yearly_fortune.date_select_label")}
              </label>
              <div className="relative w-full min-w-0 overflow-hidden">
                <input
                  type="date"
                  value={dailyTargetDate || getLocalTodayDate()}
                  onChange={(e) => {
                    const selected = e.target.value;
                    const today = getLocalTodayDate();
                    // 과거 날짜 입력 시 강제로 오늘로 교정
                    const safeDate = selected < today ? today : selected;
                    setDailyTargetDate(safeDate);
                    setError("");
                    setFromCache(false);
                    setShareId(null);
                    setInterpretation("");
                    setStreamingInterpretation("");
                    setProcessStatus("idle");
                  }}
                  min={getLocalTodayDate()}
                  className="w-full min-w-0 max-w-full box-border rounded-lg border border-slate-700 bg-[#0F0F2B] px-4 py-3 pr-10 text-slate-100 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
                />
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M6.75 2.25a.75.75 0 0 1 .75.75V4.5h9V3a.75.75 0 0 1 1.5 0v1.5h.75A2.25 2.25 0 0 1 21 6.75v12A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75v-12A2.25 2.25 0 0 1 5.25 4.5H6V3a.75.75 0 0 1 .75-.75Zm11.25 6H6a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5Z" />
                  </svg>
                </div>
              </div>
            </div>
          )}
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
            {t("yearly_fortune.submit_btn")}
          </PrimaryButton>
          <Link
            to="/faq"
            className="block mt-3 text-center text-sm text-slate-400 hover:text-white transition-colors duration-200"
          >
            {t("yearly_fortune.faq_link")}
          </Link>
        </form>

        {/* 로딩 모달: waiting 상태에서만 (포탈로 body에 렌더해 하단 탭까지 덮어 이탈 방지) */}
        {(processStatus === "waiting" || processStatus === "streaming") &&
          createPortal(
            <div
              className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4"
              role="dialog"
              aria-modal="true"
              aria-label="운세 분석 중"
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
        {showLoadingCache && (
          <div className="mb-6 py-8 text-center text-slate-400 text-sm">
            {t("yearly_fortune.loading_cache")}
          </div>
        )}
        {showRestoring && (
          <div className="mb-6 py-8 text-center text-slate-400 text-sm">
            {t("yearly_fortune.restoring")}
          </div>
        )}
        {/* 지정일 운세로 확장됨에 따라 "내일" 안내 배너 제거 */}
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
                {t("yearly_fortune.welcome_title")}
              </h2>
              <p className="text-slate-300">
                {t("yearly_fortune.welcome_subtitle").split("\n").map((line, i) => (
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
              {t("yearly_fortune.register_profile")}
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
              {t("yearly_fortune.do_it_later")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default YearlyFortune;
