import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

export function useProfiles() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 프로필 목록 조회
  const fetchProfiles = useCallback(async () => {
    if (!user) {
      setProfiles([]);
      setSelectedProfile(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      setProfiles(data || []);

      // 기본 프로필이 있으면 선택, 없으면 첫 번째 프로필 선택
      const defaultProfile = data?.find((p) => p.is_default);
      const profileToSelect = defaultProfile || data?.[0] || null;

      // localStorage에 저장된 프로필 ID 확인
      const savedProfileId = localStorage.getItem("selected_profile_id");
      const savedProfile = data?.find((p) => p.id === savedProfileId);

      setSelectedProfile(savedProfile || profileToSelect);

      // 선택된 프로필 ID 저장
      if (savedProfile || profileToSelect) {
        localStorage.setItem(
          "selected_profile_id",
          (savedProfile || profileToSelect).id,
        );
      }
    } catch (err) {
      console.error("프로필 조회 실패:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 프로필 생성
  const createProfile = useCallback(
    async (profileData) => {
      if (!user) throw new Error("로그인이 필요합니다.");

      setLoading(true);
      setError(null);

      try {
        // 생년월일과 시간을 TIMESTAMPTZ와 TIME 형식으로 변환
        const birthDateTime = `${profileData.birthDate.replace(/\./g, "-")}T${profileData.birthTime}:00`;

        const newProfile = {
          user_id: user.id,
          name: profileData.name,
          birth_date: birthDateTime,
          birth_time: profileData.birthTime,
          gender: profileData.gender,
          city_name: profileData.cityName,
          lat: profileData.lat,
          lng: profileData.lng,
          timezone: profileData.timezone,
          is_default: profiles.length === 0, // 첫 프로필은 기본 프로필로 설정
        };

        const { data, error: insertError } = await supabase
          .from("profiles")
          .insert(newProfile)
          .select()
          .single();

        if (insertError) throw insertError;

        // 프로필 목록 새로고침
        await fetchProfiles();

        // 새로 생성한 프로필을 선택
        setSelectedProfile(data);
        localStorage.setItem("selected_profile_id", data.id);

        return data;
      } catch (err) {
        console.error("프로필 생성 실패:", err);
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user, profiles.length, fetchProfiles],
  );

  // 프로필 업데이트
  const updateProfile = useCallback(
    async (profileId, profileData) => {
      if (!user) throw new Error("로그인이 필요합니다.");

      setLoading(true);
      setError(null);

      try {
        const birthDateTime = `${profileData.birthDate.replace(/\./g, "-")}T${profileData.birthTime}:00`;

        const updates = {
          name: profileData.name,
          birth_date: birthDateTime,
          birth_time: profileData.birthTime,
          gender: profileData.gender,
          city_name: profileData.cityName,
          lat: profileData.lat,
          lng: profileData.lng,
          timezone: profileData.timezone,
        };

        const { error: updateError } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", profileId);

        if (updateError) throw updateError;

        // 프로필 목록 새로고침
        await fetchProfiles();
      } catch (err) {
        console.error("프로필 업데이트 실패:", err);
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user, fetchProfiles],
  );

  // 프로필 삭제
  const deleteProfile = useCallback(
    async (profileId) => {
      if (!user) throw new Error("로그인이 필요합니다.");

      setLoading(true);
      setError(null);

      try {
        const { error: deleteError } = await supabase
          .from("profiles")
          .delete()
          .eq("id", profileId);

        if (deleteError) throw deleteError;

        // 프로필 목록 새로고침
        await fetchProfiles();

        // 삭제한 프로필이 선택된 프로필이었다면 다른 프로필 선택
        if (selectedProfile?.id === profileId) {
          const remainingProfiles = profiles.filter((p) => p.id !== profileId);
          const newSelected = remainingProfiles[0] || null;
          setSelectedProfile(newSelected);
          if (newSelected) {
            localStorage.setItem("selected_profile_id", newSelected.id);
          } else {
            localStorage.removeItem("selected_profile_id");
          }
        }
      } catch (err) {
        console.error("프로필 삭제 실패:", err);
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user, selectedProfile, profiles, fetchProfiles],
  );

  // 프로필 선택
  const selectProfile = useCallback((profile) => {
    setSelectedProfile(profile);
    if (profile) {
      localStorage.setItem("selected_profile_id", profile.id);
    } else {
      localStorage.removeItem("selected_profile_id");
    }
  }, []);

  // 운세 조회 가능 여부 체크
  const checkFortuneAvailability = useCallback(
    async (profileId, fortuneType) => {
      if (!user || !profileId)
        return { available: false, reason: "프로필을 선택해주세요" };

      try {
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile)
          return { available: false, reason: "프로필을 찾을 수 없습니다" };

        // 운세 이력 조회
        const { data: history, error: historyError } = await supabase
          .from("fortune_history")
          .select("*")
          .eq("profile_id", profileId)
          .eq("fortune_type", fortuneType)
          .order("created_at", { ascending: false });

        if (historyError) throw historyError;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        switch (fortuneType) {
          case "lifetime":
            // 평생 1번만
            if (history && history.length > 0) {
              return {
                available: false,
                reason: "인생 종합운은 이미 확인하셨습니다",
              };
            }
            return { available: true };

          case "yearly":
            // 1년에 1번 (생일 기준)
            if (history && history.length > 0) {
              const lastHistory = history[0];
              const birthDate = new Date(profile.birth_date);
              const currentYear = today.getFullYear();

              // 올해 생일 계산
              const thisYearBirthday = new Date(
                currentYear,
                birthDate.getMonth(),
                birthDate.getDate(),
              );

              // 이미 올해 생일 이후에 조회했는지 확인
              if (lastHistory.year_period_start) {
                const periodStart = new Date(lastHistory.year_period_start);

                // 올해 생일과 같은 날이거나 이후라면 이미 조회한 것
                if (periodStart >= thisYearBirthday) {
                  return {
                    available: false,
                    reason:
                      "1년 운세는 생일 기준 1년에 한 번만 확인하실 수 있습니다",
                  };
                }
              }
            }
            return { available: true };

          case "daily":
            // 하루에 1번
            if (history && history.length > 0) {
              const lastHistory = history[0];
              const lastDate = new Date(lastHistory.fortune_date);
              lastDate.setHours(0, 0, 0, 0);

              if (lastDate.getTime() === today.getTime()) {
                return {
                  available: false,
                  reason: "오늘의 운세는 하루에 한 번만 확인하실 수 있습니다",
                };
              }
            }
            return { available: true };

          case "compatibility":
            // 제한 없음
            return { available: true };

          default:
            return { available: false, reason: "알 수 없는 운세 타입입니다" };
        }
      } catch (err) {
        console.error("운세 가능 여부 체크 실패:", err);
        return { available: false, reason: err.message };
      }
    },
    [user, profiles],
  );

  // 운세 조회 이력 저장 (resultId: share_id, fortune_results.id - 기기 변경 시 복구용)
  const saveFortuneHistory = useCallback(
    async (profileId, fortuneType, resultId = null) => {
      if (!user || !profileId) return;

      try {
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const historyData = {
          user_id: user.id,
          profile_id: profileId,
          fortune_type: fortuneType,
          fortune_date: today.toISOString().split("T")[0],
          ...(resultId && { result_id: resultId }),
        };

        // 1년 운세의 경우 기간 계산
        if (fortuneType === "yearly") {
          const birthDate = new Date(profile.birth_date);
          const currentYear = today.getFullYear();

          // 올해 생일
          const thisYearBirthday = new Date(
            currentYear,
            birthDate.getMonth(),
            birthDate.getDate(),
          );

          // 다음 생일
          const nextYearBirthday = new Date(
            currentYear + 1,
            birthDate.getMonth(),
            birthDate.getDate(),
          );

          historyData.year_period_start = thisYearBirthday
            .toISOString()
            .split("T")[0];
          historyData.year_period_end = new Date(
            nextYearBirthday.getTime() - 86400000,
          )
            .toISOString()
            .split("T")[0];
        }

        const { error: insertError } = await supabase
          .from("fortune_history")
          .insert(historyData);

        if (insertError) throw insertError;

        console.log("✅ 운세 조회 이력 저장 완료:", historyData);
      } catch (err) {
        console.error("운세 이력 저장 실패:", err);
      }
    },
    [user, profiles],
  );

  // 컴포넌트 마운트 시 프로필 조회
  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  return {
    profiles,
    selectedProfile,
    loading,
    error,
    fetchProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
    checkFortuneAvailability,
    saveFortuneHistory,
  };
}
