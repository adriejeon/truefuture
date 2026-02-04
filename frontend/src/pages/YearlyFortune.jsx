import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BirthInputForm from "../components/BirthInputForm";
import BottomNavigation from "../components/BottomNavigation";
import FortuneResult from "../components/FortuneResult";
import SocialLoginButtons from "../components/SocialLoginButtons";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import TypewriterLoader from "../components/TypewriterLoader";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { restoreFortuneIfExists } from "../services/fortuneService";
import { loadSharedFortune, formatBirthDate } from "../utils/sharedFortune";
import { logDebugInfoIfPresent } from "../utils/debugFortune";

function YearlyFortune() {
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
  const [fortuneTab, setFortuneTab] = useState("daily"); // "daily" | "yearly" | "lifetime"
  const [fromCache, setFromCache] = useState(false);
  const [fortuneDate, setFortuneDate] = useState("");
  const [loadingCache, setLoadingCache] = useState(false);

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
      console.log("🔗 공유된 1년 운세 ID 발견:", sharedId);
      loadShared(sharedId);
    }
  }, [searchParams]);

  // 공유된 운세 조회 함수
  const loadShared = async (id) => {
    setLoading(true);
    setError("");

    try {
      const data = await loadSharedFortune(id);

      console.log("✅ 공유된 1년 운세 조회 성공:", data);
      logDebugInfoIfPresent(data);

      setInterpretation(data.interpretation);
      setIsSharedFortune(true);
      setShareId(id);
      setSharedUserInfo(data.userInfo);
    } catch (err) {
      console.error("❌ 공유된 1년 운세 조회 실패:", err);
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

  // 탭/프로필별 저장된 결과 복구
  useEffect(() => {
    if (!selectedProfile || isSharedFortune || !user) return;
    if (searchParams.get("id")) return;

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
    const type = fortuneTab === "yearly" ? "yearly" : "lifetime";

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
      handleRequireLogin();
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
    setLoading(true);
    setError("");
    setInterpretation("");
    try {
      const requestBody = {
        ...formData,
        fortuneType: "daily",
        reportType: "daily",
      };
      const { data, error: functionError } = await supabase.functions.invoke(
        "get-fortune",
        { body: requestBody }
      );
      if (functionError)
        throw new Error(functionError.message || "서버 오류가 발생했습니다.");
      if (!data || data.error)
        throw new Error(data?.error || "서버 오류가 발생했습니다.");
      logDebugInfoIfPresent(data);
      if (data.interpretation && typeof data.interpretation === "string") {
        const todayDate = getTodayDate();
        const currentShareId = data.share_id || null;
        setShareId(currentShareId);
        saveTodayFortuneToStorage(selectedProfile.id, {
          interpretation: data.interpretation,
          chart: data.chart,
          transitChart: data.transitChart,
          aspects: data.aspects,
          transitMoonHouse: data.transitMoonHouse,
          shareId: currentShareId,
        });
        await saveFortuneHistory(
          selectedProfile.id,
          "daily",
          currentShareId ?? undefined
        );
        setInterpretation(data.interpretation);
        setFromCache(false);
        setFortuneDate(todayDate);
      } else {
        setInterpretation("결과를 불러올 수 없습니다.");
      }
    } catch (err) {
      setError(err.message || "요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitYearly = async (e) => {
    e.preventDefault();

    if (isSharedFortune && !user) {
      handleRequireLogin();
      return;
    }
    if (!selectedProfile) {
      setError("프로필을 선택해주세요.");
      setShowProfileModal(true);
      return;
    }
    const availability = await checkFortuneAvailability(
      selectedProfile.id,
      "yearly"
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
        fortuneType: "yearly",
        reportType: "yearly",
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
        }
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
      console.log("🔍 [YearlyFortune] API 응답 전체:", data);
      console.log(
        "🔍 [YearlyFortune] API 응답 data.share_id:",
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
        console.warn(
          "⚠️ [YearlyFortune] share_id가 응답에 없거나 유효하지 않습니다."
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

      // 2. Solar Return Chart (솔라 리턴 차트)
      if (data.solarReturnChart) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🌞 [Solar Return Chart - 솔라 리턴 차트]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`Solar Return 시간: ${data.solarReturnChart.date}`);
        console.log(
          `위치: 위도 ${data.solarReturnChart.location?.lat}, 경도 ${data.solarReturnChart.location?.lng}`
        );

        // Solar Return 상승점
        if (data.solarReturnChart.houses?.angles?.ascendant !== undefined) {
          const asc = data.solarReturnChart.houses.angles.ascendant;
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
            `\nSolar Return Ascendant: ${
              signs[ascSignIndex]
            } ${ascDegreeInSign.toFixed(1)}°`
          );
        }

        // Solar Return 행성 위치
        console.log("\n행성 위치:");
        if (data.solarReturnChart.planets) {
          const planetNames = {
            sun: "Sun",
            moon: "Moon",
            mercury: "Mercury",
            venus: "Venus",
            mars: "Mars",
            jupiter: "Jupiter",
            saturn: "Saturn",
          };
          Object.entries(data.solarReturnChart.planets).forEach(
            ([name, planet]) => {
              const displayName = planetNames[name] || name;
              console.log(
                `  - ${displayName
                  .toUpperCase()
                  .padEnd(8)}: ${planet.sign.padEnd(12)} ${planet.degreeInSign
                  .toFixed(1)
                  .padStart(5)}° (SR House ${planet.house})`
              );
            }
          );
        }
      }

      // 3. Profection 정보 (연주법)
      if (data.profectionData) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📅 [Annual Profection - 연주법]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`나이: ${data.profectionData.age}세 (만 나이)`);
        console.log(
          `활성화된 하우스 (Profection House): ${data.profectionData.profectionHouse}번째 하우스`
        );
        console.log(
          `프로펙션 별자리 (Profection Sign): ${data.profectionData.profectionSign}`
        );
        console.log(
          `올해의 주인 (Lord of the Year): ${data.profectionData.lordOfTheYear}`
        );
        console.log(
          `\n💡 해석 힌트: 올해는 ${data.profectionData.profectionHouse}번째 하우스의 주제가 인생의 중심이 되며, ${data.profectionData.lordOfTheYear}가 1년의 길흉을 주관합니다.`
        );
      }

      // 4. Solar Return Overlay 정보
      if (data.solarReturnOverlay) {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🔮 [Solar Return Overlay - SR 행성의 Natal 하우스 위치]");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(
          `Solar Return Ascendant는 Natal 차트의 ${data.solarReturnOverlay.solarReturnAscendantInNatalHouse}번째 하우스에 위치합니다.`
        );
        console.log("\nSolar Return 행성들의 Natal 차트 하우스 위치:");
        if (data.solarReturnOverlay.planetsInNatalHouses) {
          const planetNames = {
            sun: "SR Sun",
            moon: "SR Moon",
            mercury: "SR Mercury",
            venus: "SR Venus",
            mars: "SR Mars",
            jupiter: "SR Jupiter",
            saturn: "SR Saturn",
          };
          Object.entries(data.solarReturnOverlay.planetsInNatalHouses).forEach(
            ([name, house]) => {
              const displayName = planetNames[name] || name;
              console.log(
                `  - ${displayName.padEnd(12)}: Natal ${house}번째 하우스`
              );
            }
          );
        }
        console.log(
          "\n💡 해석 힌트: SR 행성이 Natal 차트의 어느 하우스에 들어오는지에 따라 올해 그 영역에서 해당 행성의 영향력이 강하게 나타납니다."
        );
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
        setInterpretation(data.interpretation);
        if (data.share_id) setShareId(data.share_id);

        // 운세 이력 저장 (share_id를 result_id로 저장하여 복구 가능)
        await saveFortuneHistory(
          selectedProfile.id,
          "yearly",
          data.share_id ?? undefined
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

  const handleSubmitLifetime = async (e) => {
    e.preventDefault();
    if (isSharedFortune && !user) {
      handleRequireLogin();
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
    setLoading(true);
    setError("");
    setInterpretation("");
    setShareId(null);
    try {
      const requestBody = {
        ...formData,
        fortuneType: "lifetime",
        reportType: "lifetime",
      };
      const { data, error: functionError } = await supabase.functions.invoke(
        "get-fortune",
        { body: requestBody }
      );
      if (functionError)
        throw new Error(functionError.message || "서버 오류가 발생했습니다.");
      if (!data || data.error)
        throw new Error(data?.error || "서버 오류가 발생했습니다.");
      logDebugInfoIfPresent(data);
      if (data.interpretation && typeof data.interpretation === "string") {
        setInterpretation(data.interpretation);
        setShareId(data.share_id || null);
        await saveFortuneHistory(
          selectedProfile.id,
          "lifetime",
          data.share_id ?? undefined
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
            className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
            style={{ position: "relative", zIndex: 1 }}
          >
            {/* 상단: 친구가 공유한 결과임을 안내 + 친구 생년월일만 */}
            <div className="mb-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-2xl">🔮</div>
                <div className="flex-1">
                  <p className="text-black text-base mb-2">
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
              title="나만의 1년 공략법"
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

  const getSubmitHandler = () => {
    if (fortuneTab === "daily") return handleSubmitDaily;
    if (fortuneTab === "yearly") return handleSubmitYearly;
    return handleSubmitLifetime;
  };
  const getResultTitle = () => {
    if (fortuneTab === "daily") return "오늘의 우주 날씨";
    if (fortuneTab === "yearly") return "나만의 1년 공략법";
    return "내 인생 사용 설명서";
  };
  const showRestoring = fortuneTab !== "daily" && restoring && !interpretation;
  const showLoadingCache = fortuneTab === "daily" && loadingCache;

  return (
    <div
      className="w-full py-8 sm:py-12"
      style={{ position: "relative", zIndex: 1 }}
    >
      <div
        className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 페이지 타이틀 - 진짜 운세 */}
        <div className="mb-4">
          <p className="text-slate-300 text-sm sm:text-base">
            데일리 운세, 1년 운세, 종합 운세를 확인해 보세요.
          </p>
        </div>

        {/* 탭: 데일리 운세 | 1년 운세 | 종합 운세 */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ backgroundColor: '#121230' }}>
          {[
            { id: "daily", label: "데일리 운세" },
            { id: "yearly", label: "1년 운세" },
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
              오늘의 우주 날씨
            </h3>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              비가 오면 우산을 챙기듯, 오늘의 운을 미리 확인하세요. 매일
              달라지는 행성들의 배치가 오늘 당신의 기분과 사건에 어떤 영향을
              주는지 알려드립니다.
            </p>
          </div>
        )}
        {fortuneTab === "yearly" && (
          <div className="mb-6 sm:mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">
              나만의 1년 공략법
            </h3>
            <p className="text-slate-400 text-sm mb-1">
              이번 연도 생일부터 다음 연도 생일까지.
            </p>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              점성학의 1년은 내 생일부터 시작됩니다. 이번 생일부터 다음
              생일까지, 주어진 1년의 테마와 구체적인 행동 전략을 제안합니다.
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
            onCreateProfile={() => setShowProfileModal(true)}
            onDeleteProfile={deleteProfile}
            loading={profilesLoading}
          />
        </div>

        <form
          onSubmit={getSubmitHandler()}
          className="space-y-4 sm:space-y-6 mb-6 sm:mb-8"
        >
          <button
            type="submit"
            disabled={
              loading ||
              !selectedProfile ||
              (fortuneTab === "daily" && loadingCache)
            }
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 text-lg text-white font-semibold rounded-lg shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative touch-manipulation flex items-center justify-center gap-2 sm:gap-3 hover:shadow-[0_0_8px_rgba(97,72,235,0.3),0_0_12px_rgba(255,82,82,0.2)]"
            style={{
              zIndex: 1,
              position: "relative",
              background:
                "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
            }}
          >
            <span>진짜미래 확인하기</span>
          </button>
        </form>

        {/* 로딩 모달 */}
        {loading && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/[0.08] min-h-screen p-4"
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
        {!showLoadingCache && !showRestoring && interpretation && (
          <FortuneResult
            title={getResultTitle()}
            interpretation={interpretation}
            shareId={shareId}
          />
        )}
      </div>
      {user && <BottomNavigation activeTab="yearly" />}

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

export default YearlyFortune;
