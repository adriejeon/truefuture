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
 * @param {string} fortuneType - 'daily' | 'yearly' | 'lifetime' | 'compatibility' | 'consultation'
 * @param {string|null} resultId - share_id / fortune_results.id (기기 변경 시 복구용)
 * @param {object} profile - 프로필 객체 (birth_date 등 yearly 기간 계산용)
 * @param {string|null} userQuestion - 상담(consultation) 시 사용자 질문
 */
export async function saveFortuneHistory(
  userId,
  profileId,
  fortuneType,
  resultId = null,
  profile = null,
  userQuestion = null
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
      ...(userQuestion &&
        fortuneType === "consultation" && { user_question: userQuestion }),
    };

    if (fortuneType === "yearly" && profile?.birth_date) {
      const birthDate = new Date(profile.birth_date);
      const currentYear = today.getFullYear();

      const thisYearBirthday = new Date(
        currentYear,
        birthDate.getMonth(),
        birthDate.getDate()
      );
      const nextYearBirthday = new Date(
        currentYear + 1,
        birthDate.getMonth(),
        birthDate.getDate()
      );

      historyData.year_period_start = thisYearBirthday
        .toISOString()
        .split("T")[0];
      historyData.year_period_end = new Date(
        nextYearBirthday.getTime() - 86400000
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
 * 상담 내역 조회 (consultation fortune_type만)
 * result_id별로 그룹화하여 후속 질문 포함
 * @param {string} userId
 * @returns {Promise<Array<{result_id, questions: Array<{id, user_question, created_at}>, latest_created_at}>>}
 */
export async function fetchConsultationHistory(userId) {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("fortune_history")
      .select("id, user_question, created_at, result_id")
      .eq("user_id", userId)
      .eq("fortune_type", "consultation")
      .not("user_question", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    if (!data || data.length === 0) return [];

    // result_id별로 그룹화
    const grouped = data.reduce((acc, item) => {
      if (!item.result_id) return acc;
      
      if (!acc[item.result_id]) {
        acc[item.result_id] = {
          result_id: item.result_id,
          questions: [],
          latest_created_at: item.created_at,
        };
      }
      
      acc[item.result_id].questions.push({
        id: item.id,
        user_question: item.user_question,
        created_at: item.created_at,
      });
      
      // 최신 날짜 업데이트
      if (new Date(item.created_at) > new Date(acc[item.result_id].latest_created_at)) {
        acc[item.result_id].latest_created_at = item.created_at;
      }
      
      return acc;
    }, {});

    // 배열로 변환하고 최신순 정렬
    const result = Object.values(grouped)
      .map(group => ({
        ...group,
        questions: group.questions.sort((a, b) => 
          new Date(a.created_at) - new Date(b.created_at)
        ),
      }))
      .sort((a, b) => 
        new Date(b.latest_created_at) - new Date(a.latest_created_at)
      )
      .slice(0, 50);

    return result;
  } catch (err) {
    console.error("❌ 상담 내역 조회 실패:", err);
    return [];
  }
}

/**
 * 궁합 내역 조회 (compatibility fortune_type만)
 * @param {string} userId
 * @returns {Promise<Array<{id, created_at, result_id, profile_id, profiles, fortune_results}>}
 */
export async function fetchCompatibilityHistory(userId) {
  if (!userId) return [];

  try {
    // 먼저 fortune_history 조회
    const { data: historyData, error: historyError } = await supabase
      .from("fortune_history")
      .select(
        `
        id,
        created_at,
        result_id,
        profile_id,
        profiles!inner(id, name, birth_date)
      `
      )
      .eq("user_id", userId)
      .eq("fortune_type", "compatibility")
      .not("result_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (historyError) throw historyError;
    if (!historyData || historyData.length === 0) return [];

    // result_id 목록 추출
    const resultIds = historyData
      .map((h) => h.result_id)
      .filter((id) => id !== null);

    if (resultIds.length === 0) return [];

    // fortune_results에서 user_info 조회
    const { data: resultsData, error: resultsError } = await supabase
      .from("fortune_results")
      .select("id, user_info")
      .in("id", resultIds);

    if (resultsError) throw resultsError;

    // 결과 병합
    const resultsMap = new Map((resultsData || []).map((r) => [r.id, r]));

    const mergedData = historyData.map((historyItem) => ({
      ...historyItem,
      fortune_results: resultsMap.get(historyItem.result_id) || null,
    }));

    return mergedData;
  } catch (err) {
    console.error("❌ 궁합 내역 조회 실패:", err);
    return [];
  }
}

/**
 * 특정 result_id로 운세 결과 조회
 * @param {string} resultId - fortune_results.id
 * @returns {Promise<{interpretation, chart, chart2, shareId}|null>}
 */
export async function fetchFortuneByResultId(resultId) {
  if (!resultId) return null;

  try {
    const { data: resultRow, error: resultError } = await supabase
      .from("fortune_results")
      .select("id, fortune_text, chart_data, user_info")
      .eq("id", resultId)
      .single();

    if (resultError || !resultRow?.fortune_text) {
      return null;
    }

    const cd = resultRow.chart_data || {};
    return {
      interpretation: resultRow.fortune_text,
      chart: cd.chart ?? null,
      chart2: cd.chart2 ?? null,
      shareId: resultRow.id,
      userInfo: resultRow.user_info ?? null,
    };
  } catch (err) {
    console.error(`❌ 운세 결과 조회 실패:`, err);
    return null;
  }
}

/**
 * 만료된 데일리 운세 삭제 (하루 지난 것)
 * @param {string} userId
 */
export async function deleteExpiredDailyFortunes(userId) {
  if (!userId) return;

  try {
    const todayDate = getTodayDate();
    const today = new Date(todayDate);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split("T")[0];

    // 어제 이전의 데일리 운세 이력 조회
    const { data: expiredHistory, error: historyError } = await supabase
      .from("fortune_history")
      .select("result_id")
      .eq("user_id", userId)
      .eq("fortune_type", "daily")
      .lt("fortune_date", todayDate)
      .not("result_id", "is", null);

    if (historyError) {
      console.error("만료된 데일리 운세 이력 조회 실패:", historyError);
      return;
    }

    if (!expiredHistory || expiredHistory.length === 0) return;

    const resultIds = expiredHistory
      .map((h) => h.result_id)
      .filter((id) => id !== null);

    if (resultIds.length === 0) return;

    // fortune_results에서 삭제
    const { error: deleteError } = await supabase
      .from("fortune_results")
      .delete()
      .in("id", resultIds)
      .eq("fortune_type", "daily");

    if (deleteError) {
      console.error("만료된 데일리 운세 삭제 실패:", deleteError);
    } else {
      console.log(`✅ 만료된 데일리 운세 ${resultIds.length}개 삭제 완료`);
    }
  } catch (err) {
    console.error("만료된 데일리 운세 삭제 중 오류:", err);
  }
}

/**
 * 만료된 1년 운세 삭제 (생일 지난 것)
 * @param {string} userId
 */
export async function deleteExpiredYearlyFortunes(userId) {
  if (!userId) return;

  try {
    // 프로필 조회
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, birth_date")
      .eq("user_id", userId);

    if (profilesError || !profiles || profiles.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();

    // 각 프로필별로 만료된 1년 운세 확인
    for (const profile of profiles) {
      const birthDate = new Date(profile.birth_date);
      const thisYearBirthday = new Date(
        currentYear,
        birthDate.getMonth(),
        birthDate.getDate()
      );
      thisYearBirthday.setHours(0, 0, 0, 0);

      // 올해 생일이 지났는지 확인
      if (today < thisYearBirthday) continue; // 아직 생일 안 지남

      // 이 프로필의 1년 운세 이력 조회
      const { data: yearlyHistory, error: historyError } = await supabase
        .from("fortune_history")
        .select("id, result_id, year_period_end")
        .eq("user_id", userId)
        .eq("profile_id", profile.id)
        .eq("fortune_type", "yearly")
        .not("result_id", "is", null);

      if (historyError || !yearlyHistory || yearlyHistory.length === 0)
        continue;

      // year_period_end가 오늘보다 이전인 것들 찾기
      const expiredHistory = yearlyHistory.filter((h) => {
        if (!h.year_period_end) return false;
        const periodEnd = new Date(h.year_period_end);
        periodEnd.setHours(0, 0, 0, 0);
        return periodEnd < today;
      });

      if (expiredHistory.length === 0) continue;

      const resultIds = expiredHistory
        .map((h) => h.result_id)
        .filter((id) => id !== null);

      if (resultIds.length === 0) continue;

      // fortune_results에서 삭제
      const { error: deleteError } = await supabase
        .from("fortune_results")
        .delete()
        .in("id", resultIds)
        .eq("fortune_type", "yearly");

      if (deleteError) {
        console.error(
          `프로필 ${profile.id}의 만료된 1년 운세 삭제 실패:`,
          deleteError
        );
      } else {
        console.log(
          `✅ 프로필 ${profile.id}의 만료된 1년 운세 ${resultIds.length}개 삭제 완료`
        );
      }
    }
  } catch (err) {
    console.error("만료된 1년 운세 삭제 중 오류:", err);
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
