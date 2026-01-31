import { supabase } from "../lib/supabaseClient";

/**
 * 한국 시간대 기준 현재 시간 (UTC+9)
 */
function getKoreaTime() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * 오늘 날짜 YYYY-MM-DD (한국 시간대)
 */
function getTodayDate() {
  const koreaTime = getKoreaTime();
  const year = koreaTime.getUTCFullYear();
  const month = String(koreaTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(koreaTime.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 운세 조회 이력 저장 (DB 전용, React/Hook 미의존)
 * @param {string} userId - user.id
 * @param {string} profileId
 * @param {string} fortuneType - 'daily' | 'yearly' | 'lifetime' | 'compatibility'
 * @param {string|null} resultId - share_id / fortune_results.id (기기 변경 시 복구용)
 * @param {object} profile - 프로필 객체 (birth_date 등 yearly 기간 계산용)
 */
export async function saveFortuneHistory(
  userId,
  profileId,
  fortuneType,
  resultId = null,
  profile = null,
) {
  if (!userId || !profileId) return;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const historyData = {
      user_id: userId,
      profile_id: profileId,
      fortune_type: fortuneType,
      fortune_date: getTodayDate(),
      ...(resultId && { result_id: resultId }),
    };

    if (fortuneType === "yearly" && profile?.birth_date) {
      const birthDate = new Date(profile.birth_date);
      const currentYear = today.getFullYear();

      const thisYearBirthday = new Date(
        currentYear,
        birthDate.getMonth(),
        birthDate.getDate(),
      );
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
}

/**
 * DB에서 운세 복구 (기기 변경/프로필 전환 시)
 * @param {string} profileId
 * @param {string} fortuneType - 'daily' | 'lifetime' | 'yearly' | 'compatibility'
 * @returns {Promise<{interpretation, chart, transitChart, aspects, transitMoonHouse, shareId}|null>}
 */
export async function restoreFortuneIfExists(profileId, fortuneType = "daily") {
  if (!profileId) return null;

  try {
    const todayDate = getTodayDate();

    // result_id가 있는 기록만 대상 (공통)
    let historyQuery = supabase
      .from("fortune_history")
      .select("result_id")
      .eq("profile_id", profileId)
      .eq("fortune_type", fortuneType)
      .not("result_id", "is", null);

    if (fortuneType === "daily") {
      // Case A: 오늘 날짜인 daily만
      historyQuery = historyQuery.eq("fortune_date", todayDate).maybeSingle();
    } else {
      // Case B: lifetime / yearly — 날짜 조건 없이 최신 1건
      historyQuery = historyQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    const { data: historyRow, error: historyError } = await historyQuery;

    if (historyError || !historyRow?.result_id) {
      return null;
    }

    const { data: resultRow, error: resultError } = await supabase
      .from("fortune_results")
      .select("id, fortune_text, chart_data")
      .eq("id", historyRow.result_id)
      .single();

    if (resultError || !resultRow?.fortune_text) {
      return null;
    }

    const cd = resultRow.chart_data || {};
    return {
      interpretation: resultRow.fortune_text,
      chart: cd.chart ?? null,
      transitChart: cd.transitChart ?? null,
      aspects: cd.aspects ?? null,
      transitMoonHouse: cd.transitMoonHouse ?? null,
      shareId: resultRow.id,
    };
  } catch (err) {
    console.error(`❌ [복구] ${fortuneType} 운세 복구 실패:`, err);
    return null;
  }
}
