import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SocialLoginButtons from "../components/SocialLoginButtons";
import BirthInputForm from "../components/BirthInputForm";
import FortuneResult from "../components/FortuneResult";
import BottomNavigation from "../components/BottomNavigation";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { colors } from "../constants/colors";
import { supabase } from "../lib/supabaseClient";
import { restoreFortuneIfExists } from "../services/fortuneService";
import {
  detectInAppBrowser,
  redirectToExternalBrowser,
  getBrowserGuideMessage,
} from "../utils/inAppBrowserDetector";
import { formatBirthDate } from "../utils/sharedFortune";
import { logDebugInfoIfPresent } from "../utils/debugFortune";

function Home() {
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [inAppBrowserWarning, setInAppBrowserWarning] = useState(null);
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [fortuneDate, setFortuneDate] = useState("");
  const [loadingCache, setLoadingCache] = useState(false);
  const [shareId, setShareId] = useState(null); // 공유 ID 상태 추가
  const [isSharedFortune, setIsSharedFortune] = useState(false); // 공유된 운세인지 여부
  const [sharedUserInfo, setSharedUserInfo] = useState(null); // 공유한 친구의 생년월일 등
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNoProfileModal, setShowNoProfileModal] = useState(false);

  // 로컬스토리지 확인 로직이 한 번만 실행되도록 보장하는 플래그
  const hasCheckedStorage = useRef(false);
  // 사용자가 "나중에 하기"를 클릭했는지 추적하는 플래그
  const hasDismissedProfileModal = useRef(false);

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
      !isSharedFortune &&
      !hasDismissedProfileModal.current
    ) {
      setShowNoProfileModal(true);
    }
  }, [user, profilesLoading, profiles, showNoProfileModal, isSharedFortune]);

  // 프로필이 생성되면 모달 닫기
  useEffect(() => {
    if (profiles.length > 0) {
      setShowNoProfileModal(false);
      setShowProfileModal(false);
      hasDismissedProfileModal.current = false; // 프로필이 생성되면 플래그 리셋
    }
  }, [profiles]);

  // 선택된 프로필 변경 시 운세 결과 초기화 및 해당 프로필의 운세 불러오기 (로컬 → 없으면 DB 복구)
  useEffect(() => {
    if (!selectedProfile || isSharedFortune) return;

    console.log("🔄 프로필 변경됨, 운세 결과 초기화 및 불러오기");
    setLoadingCache(true);
    setError("");

    const storedFortune = getTodayFortuneFromStorage(selectedProfile.id);

    if (storedFortune) {
      console.log("✅ 선택된 프로필의 오늘의 운세 발견!");
      setInterpretation(storedFortune.interpretation);
      setFromCache(true);
      setFortuneDate(storedFortune.date);
      if (storedFortune.shareId) setShareId(storedFortune.shareId);
      setLoadingCache(false);
      return;
    }

    // localStorage 없음 → DB에서 오늘의 운세 복구 시도 (기기 변경/프로필 전환 시)
    (async () => {
      try {
        const restored = await restoreFortuneIfExists(
          selectedProfile.id,
          "daily"
        );
        if (restored) {
          console.log("✅ [복구] 선택된 프로필의 오늘의 운세 DB에서 복구");
          setInterpretation(restored.interpretation);
          setFromCache(true);
          setFortuneDate(getTodayDate());
          if (restored.shareId) setShareId(restored.shareId);
          saveTodayFortuneToStorage(selectedProfile.id, {
            interpretation: restored.interpretation,
            chart: restored.chart,
            transitChart: restored.transitChart,
            aspects: restored.aspects,
            transitMoonHouse: restored.transitMoonHouse,
            shareId: restored.shareId,
          });
        } else {
          console.log("💫 선택된 프로필의 오늘의 운세가 아직 없습니다.");
          setInterpretation("");
          setFromCache(false);
          setFortuneDate("");
          setShareId(null);
        }
      } finally {
        setLoadingCache(false);
      }
    })();
  }, [selectedProfile?.id, isSharedFortune]);

  // 프로필 생성 핸들러
  const handleCreateProfile = useCallback(
    async (profileData) => {
      await createProfile(profileData);
      // 프로필 생성 후 모달은 ProfileModal의 onClose에서 처리됨
    },
    [createProfile]
  );

  // 인앱 브라우저 감지 및 처리
  useEffect(() => {
    const { isInApp, appName } = detectInAppBrowser();

    if (isInApp && appName) {
      console.log(`인앱 브라우저 감지: ${appName}`);

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
      console.log("🔗 공유된 운세 ID 발견:", sharedId);
      loadSharedFortune(sharedId);
    }
  }, [searchParams]);

  // 공유된 운세 조회 함수
  const loadSharedFortune = async (id) => {
    setLoading(true);
    setError("");

    try {
      // URL에 id 파라미터를 추가하여 GET 요청
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-fortune?id=${id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("운세를 불러올 수 없습니다.");
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      console.log("✅ 공유된 운세 조회 성공:", data);
      logDebugInfoIfPresent(data);

      setInterpretation(data.interpretation);
      setIsSharedFortune(true);
      setShareId(id);
      setSharedUserInfo(data.userInfo ?? null);

      // URL에서 id 파라미터 제거 (깔끔한 URL 유지)
      // setSearchParams({})
    } catch (err) {
      console.error("❌ 공유된 운세 조회 실패:", err);
      setError(err.message || "운세를 불러오는 중 오류가 발생했습니다.");

      // 에러 발생 시 URL에서 id 파라미터 제거
      setSearchParams({});
    } finally {
      setLoading(false);
    }
  };

  // 한국 시간대 기준 현재 시간 가져오기
  const getKoreaTime = () => {
    const now = new Date();
    // UTC 시간에 9시간(9 * 60 * 60 * 1000 밀리초)을 더함
    const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return koreaTime;
  };

  // 오늘 날짜 (YYYY-MM-DD) 가져오기 - 한국 시간대 기준
  const getTodayDate = () => {
    const koreaTime = getKoreaTime();
    // YYYY-MM-DD 형식으로 변환
    const year = koreaTime.getUTCFullYear();
    const month = String(koreaTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(koreaTime.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // 현재 시간이 00:01 ~ 23:59 사이인지 확인
  const isWithinDailyFortuneTime = () => {
    const koreaTime = getKoreaTime();
    const hour = koreaTime.getUTCHours();
    const minute = koreaTime.getUTCMinutes();

    // 00:00 ~ 00:00 사이는 운세 뽑기 불가
    if (hour === 0 && minute < 1) {
      return false;
    }

    return true; // 00:01 ~ 23:59
  };

  // 로컬스토리지에서 오늘의 운세 확인 (프로필별)
  const getTodayFortuneFromStorage = (profileId) => {
    if (!profileId) return null;

    try {
      const storageKey = `daily_fortune_${profileId}`;
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        return null;
      }

      const fortuneData = JSON.parse(stored);
      const todayDate = getTodayDate();

      // 저장된 운세의 날짜가 오늘인지 확인
      if (fortuneData.date === todayDate) {
        return fortuneData;
      } else {
        // 다른 날짜의 운세이므로 삭제
        localStorage.removeItem(storageKey);
        return null;
      }
    } catch (err) {
      console.error("로컬스토리지 읽기 에러:", err);
      return null;
    }
  };

  // 로컬스토리지에 오늘의 운세 저장 (프로필별)
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
        shareId: fortuneData.shareId, // share_id 추가
        createdAt: new Date().toISOString(),
      };

      const storageKey = `daily_fortune_${profileId}`;
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));

      console.log("\n" + "=".repeat(60));
      console.log("💾 로컬스토리지 저장 완료");
      console.log("=".repeat(60));
      console.log("저장된 날짜:", todayDate);
      console.log("프로필 ID:", profileId);
      console.log(
        "저장된 해석 길이:",
        fortuneData.interpretation?.length || 0,
        "글자"
      );
      console.log("=".repeat(60) + "\n");
    } catch (err) {
      console.error("❌ 로컬스토리지 저장 에러:", err);
    }
  };

  // 페이지 로드 시 로컬스토리지에서 오늘의 운세 확인 (없으면 DB에서 복구)
  useEffect(() => {
    // 인증 상태가 로딩 중이면 대기 (새로고침 시 세션 복구 중 데이터 삭제 방지)
    if (loadingAuth || profilesLoading) {
      return;
    }

    // 이미 로컬스토리지 확인을 완료했다면 중복 실행 방지
    if (hasCheckedStorage.current) {
      return;
    }

    // 로딩이 완료되었는데도 유저가 없으면 로그아웃 상태로 간주하여 로컬스토리지 초기화
    if (!user) {
      hasCheckedStorage.current = true; // 플래그 설정하여 이후 실행 방지
      // 모든 프로필의 daily_fortune 삭제
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("daily_fortune_")) {
          localStorage.removeItem(key);
        }
      });
      setInterpretation("");
      setFromCache(false);
      setFortuneDate("");
      setShareId(null); // shareId도 초기화
      return;
    }

    // 프로필이 없으면 로컬스토리지 사용 안 함
    if (profiles.length === 0) {
      hasCheckedStorage.current = true;
      setLoadingCache(false);
      return;
    }

    // 선택된 프로필이 없으면 대기
    if (!selectedProfile) {
      hasCheckedStorage.current = true;
      setLoadingCache(false);
      return;
    }

    // 로그인된 사용자이고 프로필이 있는 경우: 로컬스토리지에서 오늘의 운세 확인 (한 번만 실행)
    hasCheckedStorage.current = true; // 플래그 설정하여 중복 실행 방지

    console.log("\n🔄 [useEffect 실행] 로컬스토리지 확인 중...");
    console.log("선택된 프로필 ID:", selectedProfile.id);

    setLoadingCache(true);
    const storedFortune = getTodayFortuneFromStorage(selectedProfile.id);

    if (storedFortune) {
      console.log("✅ 오늘의 운세 발견! (날짜: " + storedFortune.date + ")");
      setInterpretation(storedFortune.interpretation);
      setFromCache(true);
      setFortuneDate(storedFortune.date);
      if (storedFortune.shareId) {
        setShareId(storedFortune.shareId);
      }
      setLoadingCache(false);
      return;
    }

    // localStorage 없음 → DB에서 오늘의 운세 복구 시도 (기기 변경 시)
    (async () => {
      try {
        const restored = await restoreFortuneIfExists(
          selectedProfile.id,
          "daily"
        );
        if (restored) {
          console.log("✅ [복구] DB에서 오늘의 운세 복구 완료");
          setInterpretation(restored.interpretation);
          setFromCache(true);
          setFortuneDate(getTodayDate());
          if (restored.shareId) setShareId(restored.shareId);
          saveTodayFortuneToStorage(selectedProfile.id, {
            interpretation: restored.interpretation,
            chart: restored.chart,
            transitChart: restored.transitChart,
            aspects: restored.aspects,
            transitMoonHouse: restored.transitMoonHouse,
            shareId: restored.shareId,
          });
        } else {
          console.log("💫 오늘의 운세가 아직 없습니다.");
          setInterpretation("");
          setFromCache(false);
          setFortuneDate("");
          setShareId(null);
        }
      } finally {
        setLoadingCache(false);
      }
    })();
  }, [user, loadingAuth, profilesLoading, profiles, selectedProfile]);

  // 사용자 또는 프로필 변경 시 플래그 리셋
  useEffect(() => {
    if (!loadingAuth && !profilesLoading) {
      if (!user || selectedProfile) {
        hasCheckedStorage.current = false;
      }
    }
  }, [user, loadingAuth, profilesLoading, selectedProfile]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 로그인 체크
    if (!user) {
      setError("로그인이 필요합니다. 먼저 로그인해주세요.");
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
      "daily"
    );
    if (!availability.available) {
      setError(availability.reason);
      return;
    }

    // 데이터 변환
    const formData = convertProfileToApiFormat(selectedProfile);
    if (!formData) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    // 00:01 ~ 23:59 사이인지 확인
    if (!isWithinDailyFortuneTime()) {
      setError("오늘의 운세는 00시 1분부터 확인하실 수 있습니다.");
      return;
    }

    // 이미 오늘의 운세를 뽑았는지 확인 (로컬스토리지)
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

    setLoading(true);
    setError("");
    setInterpretation("");

    try {
      const requestBody = {
        ...formData,
        fortuneType: "daily",
        reportType: "daily", // 하위 호환성 유지
      };

      const { data, error: functionError } = await supabase.functions.invoke(
        "get-fortune",
        {
          body: requestBody,
        }
      );

      if (functionError) {
        throw new Error(
          functionError.message ||
            `서버 오류가 발생했습니다. (${functionError.name || "Unknown"})`
        );
      }

      if (!data) {
        throw new Error("서버로부터 응답을 받지 못했습니다.");
      }

      if (data.error) {
        throw new Error(data.error || "서버 오류가 발생했습니다.");
      }

      logDebugInfoIfPresent(data);

      // AI 해석 실패 체크
      if (
        data.interpretation &&
        typeof data.interpretation === "object" &&
        data.interpretation.error
      ) {
        console.error("❌ AI 해석 실패:", data.interpretation);
        throw new Error(
          data.interpretation.message || "AI 해석 중 오류가 발생했습니다."
        );
      }

      // 디버깅: 받은 응답 로그
      console.log("\n" + "=".repeat(60));
      console.log("📥 API 응답 받은 데이터");
      console.log("=".repeat(60));

      // share_id 저장
      console.log("🔍 [Home] API 응답 전체:", data);
      console.log(
        "🔍 [Home] API 응답 data.share_id:",
        data.share_id,
        "타입:",
        typeof data.share_id
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
        console.warn("⚠️ [Home] share_id가 응답에 없거나 유효하지 않습니다.");
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
          `출생 위치: 위도 ${data.chart.location?.lat}, 경도 ${data.chart.location?.lng}`
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
            `\n상승점(Ascendant): ${
              signs[ascSignIndex]
            } ${ascDegreeInSign.toFixed(1)}°`
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
              `  - ${displayName.toUpperCase().padEnd(8)}: ${planet.sign.padEnd(
                12
              )} ${planet.degreeInSign.toFixed(1).padStart(5)}° (House ${
                planet.house
              })`
            );
          });
        }

        // 포르투나
        if (data.chart.fortuna) {
          console.log(
            `\nPart of Fortune: ${
              data.chart.fortuna.sign
            } ${data.chart.fortuna.degreeInSign.toFixed(1)}° (House ${
              data.chart.fortuna.house
            })`
          );
        }
      }

      // 2. Transit Chart (현재 하늘)
      if (data.transitChart) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🌠 [Transit Chart - 현재 하늘]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`현재 시간: ${data.transitChart.date}`);

        console.log("\n행성 위치:");
        if (data.transitChart.planets) {
          const planetNames = {
            sun: "Sun",
            moon: "Moon",
            mercury: "Mercury",
            venus: "Venus",
            mars: "Mars",
            jupiter: "Jupiter",
            saturn: "Saturn",
          };
          Object.entries(data.transitChart.planets).forEach(
            ([name, planet]) => {
              const displayName = planetNames[name] || name;
              console.log(
                `  - ${displayName
                  .toUpperCase()
                  .padEnd(8)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign
                  .toFixed(1)
                  .padStart(5)}° (House ${planet.house})`
              );
            }
          );
        }
      }

      // 3. Transit Moon House
      if (data.transitMoonHouse !== undefined) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🌙 [Transit Moon House]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(
          `Transit Moon은 Natal 차트의 ${data.transitMoonHouse}번째 하우스에 위치합니다.`
        );
      }

      // 4. Calculated Aspects (각도 관계)
      if (
        data.aspects &&
        Array.isArray(data.aspects) &&
        data.aspects.length > 0
      ) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🔮 [Calculated Aspects - 주요 각도 관계]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        data.aspects.forEach((aspect, index) => {
          console.log(`  ${index + 1}. ${aspect.description}`);
        });
        console.log(`\n총 ${data.aspects.length}개의 Aspect 발견`);
      } else if (
        data.aspects &&
        Array.isArray(data.aspects) &&
        data.aspects.length === 0
      ) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🔮 [Calculated Aspects - 주요 각도 관계]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("  (오늘은 주요 Aspect가 형성되지 않았습니다)");
      }

      // 5. 제미나이에게 전달한 프롬프트 (디버깅용)
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

      // 6. 제미나이 해석 결과
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✨ [제미나이 해석 결과]");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(data.interpretation);
      console.log("\n" + "=".repeat(60) + "\n");

      if (data.interpretation && typeof data.interpretation === "string") {
        const todayDate = getTodayDate();

        // share_id가 있으면 상태에 저장 (먼저 저장하여 로컬스토리지 저장 시 사용)
        const currentShareId = data.share_id;
        if (currentShareId) {
          setShareId(currentShareId);
          console.log("🔗 Share ID 저장:", currentShareId);
        }

        // 오늘의 운세를 로컬스토리지에 저장 (shareId 포함, 프로필별)
        saveTodayFortuneToStorage(selectedProfile.id, {
          interpretation: data.interpretation,
          chart: data.chart,
          transitChart: data.transitChart,
          aspects: data.aspects,
          transitMoonHouse: data.transitMoonHouse,
          shareId: currentShareId, // share_id도 함께 저장
        });

        // 운세 이력 저장 (share_id를 result_id로 저장하여 기기 변경 시 복구 가능)
        await saveFortuneHistory(
          selectedProfile.id,
          "daily",
          currentShareId || undefined
        );

        // 저장 후 상태 업데이트
        setInterpretation(data.interpretation);
        setFromCache(false); // 새로 뽑은 운세
        setFortuneDate(todayDate);

        console.log("✅ [운세 완료] 해석 결과 표시 및 로컬스토리지 저장 완료");
      } else {
        setInterpretation("결과를 불러올 수 없습니다.");
      }
    } catch (err) {
      setError(err.message || "요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
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
        className={`w-full max-w-[600px] mx-auto px-6 ${
          !user && !interpretation ? "" : "pb-20 sm:pb-24"
        }`}
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 메인 이미지 + CTA (로그아웃 상태) */}
        {!user && !interpretation && (
          <div className="w-full">
            <div className="relative w-full inline-block">
              <img
                src="/assets/main.png"
                alt="진짜미래"
                className="w-full h-auto object-contain block"
              />
              {/* 중앙 애니메이션 영역 */}
              <div className="absolute top-[44.5%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[15%] sm:w-[12%] md:w-[10%] max-w-[320px] aspect-square z-10">
                {/* Article 이미지 1 */}
                <img
                  src="/assets/article.png"
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain animate-article-cross-fade-1"
                />
                {/* Article 이미지 2 */}
                <img
                  src="/assets/article1.png"
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain animate-article-cross-fade-2"
                />
              </div>
            </div>
            {/* CTA: 진짜미래 보기 */}
            <div className="w-full mt-6 sm:mt-8 mb-6 sm:mb-8 px-0">
              <Link
                to="/login"
                className="block w-full py-4 px-6 rounded-full text-center font-semibold text-base sm:text-lg transition-all duration-200 hover:opacity-90"
                style={{
                  backgroundColor: colors.primary,
                  color: "#000000",
                }}
              >
                진짜미래 보러가기
              </Link>
            </div>
          </div>
        )}

        {/* 인앱 브라우저 안내 메시지 */}
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

        {/* 공유된 운세 표시 (로그인 여부 무관 - 친구가 공유한 결과만 표시) */}
        {isSharedFortune && interpretation && (
          <div className="mb-6 sm:mb-8">
            <div className="p-4 bg-purple-900/30 border border-purple-600/50 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🔮</div>
                <div className="flex-1">
                  <p className="text-purple-200 text-base mb-2">
                    친구가 공유한 운세 결과예요.
                  </p>
                  {sharedUserInfo?.birthDate && (
                    <div className="text-xs sm:text-sm text-slate-300 mt-3 bg-slate-700/50 px-4 py-3 rounded">
                      <p>📅 {formatBirthDate(sharedUserInfo.birthDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <FortuneResult
              title="공유된 운세"
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
        )}

        {/* 기존 로직: 공유된 운세가 아닌 경우에만 표시 */}
        {!isSharedFortune && (
          <>
            {/* 로그인하지 않은 경우: 이미지만 표시 (로그인 영역 제거) */}
            {!user ? null : (
              <>
                <div className="py-8 sm:py-12">
                  {/* 자유 질문 상담소 버튼 */}
                  <Link
                    to="/consultation"
                    className="block w-full mb-6 sm:mb-8 p-4 bg-gradient-to-r from-purple-600/30 to-pink-600/30 border border-purple-500/50 rounded-lg hover:border-purple-400 transition-all duration-300 shadow-lg hover:shadow-purple-500/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl">✨</div>
                        <div>
                          <h3 className="text-base sm:text-lg font-semibold text-white">
                            자유 질문 상담소
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-300 mt-1">
                            궁금한 것을 직접 물어보세요
                          </p>
                        </div>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>

                  {/* 페이지 소개 - 오늘의 운세 */}
                  <div className="mb-6 sm:mb-8">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                      오늘의 우주 날씨
                    </h2>
                    <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                      비가 오면 우산을 챙기듯, 오늘의 운을 미리 확인하세요. 매일
                      달라지는 행성들의 배치가 오늘 당신의 기분과 사건에 어떤
                      영향을 주는지, 하루를 잘 보내기 위한 행동 팁을
                      알려드립니다.
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

                  {/* 오늘의 운세 */}
                  {/* 로딩 중 */}
                  {loadingCache && (
                    <div className="mb-6 sm:mb-8 text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3"></div>
                      <p className="text-slate-400 text-sm">
                        오늘의 운세 확인 중...
                      </p>
                    </div>
                  )}

                  {/* 이미 오늘의 운세를 뽑은 경우 */}
                  {!loadingCache && interpretation && fromCache && (
                    <div className="mb-6 sm:mb-8">
                      <div
                        className="px-4 py-2 border rounded-lg mb-4"
                        style={{
                          borderColor: "#4B4B71",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-lg">✨</div>
                          <div className="flex-1">
                            <p
                              className="text-base"
                              style={{ color: colors.subText }}
                            >
                              내일 새로운 운세를 확인하러 또 오세요!
                            </p>
                          </div>
                        </div>
                      </div>
                      <FortuneResult
                        title="오늘의 우주 날씨"
                        interpretation={interpretation}
                        shareId={shareId}
                      />
                    </div>
                  )}

                  {/* 아직 오늘의 운세를 뽑지 않은 경우 */}
                  {!loadingCache && !interpretation && (
                    <>
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
                              <span>미래를 계산하는 중...</span>
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
                    </>
                  )}

                  {/* 새로 운세를 뽑은 경우 (캐시 아님) */}
                  {!loadingCache && interpretation && !fromCache && (
                    <div className="mt-8 sm:mt-12">
                      <FortuneResult
                        title="오늘의 우주 날씨"
                        interpretation={interpretation}
                        shareId={shareId}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {user && <BottomNavigation />}

      {/* 프로필 등록 모달 */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          // 프로필이 없으면 다시 안내 모달 표시
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
            <button
              onClick={() => {
                hasDismissedProfileModal.current = true;
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
