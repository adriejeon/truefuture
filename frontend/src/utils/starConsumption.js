import { supabase } from "../lib/supabaseClient";

/**
 * 운세 타입별 필요 별 개수
 */
export const FORTUNE_STAR_COSTS = {
  daily: 3,
  yearly: 9,
  lifetime: 39,
  compatibility: 9,
  consultation: 9,
};

/**
 * 운세 타입별 한글 이름
 */
export const FORTUNE_TYPE_NAMES = {
  daily: "오늘 운세",
  yearly: "1년 운세",
  lifetime: "종합 운세",
  compatibility: "궁합",
  consultation: "자유 질문",
};

/**
 * 사용자의 현재 별 잔액 조회 (유효한 별만 계산)
 * @param {string} userId
 * @returns {Promise<{paid: number, bonus: number, total: number}>}
 */
export async function fetchUserStars(userId) {
  if (!userId) {
    throw new Error("사용자 ID가 필요합니다.");
  }

  try {
    // get_valid_stars RPC 함수를 사용하여 만료되지 않은 별만 조회
    const { data, error } = await supabase.rpc("get_valid_stars", {
      p_user_id: userId,
    });

    if (error) {
      console.error("❌ 유효한 별 조회 실패:", error);
      throw error;
    }

    const paid = data?.[0]?.paid_stars ?? 0;
    const bonus = data?.[0]?.bonus_stars ?? 0;

    return { paid, bonus, total: paid + bonus };
  } catch (err) {
    console.error("❌ 별 잔액 조회 중 오류:", err);
    // RPC가 없으면 기존 방식으로 폴백
    const { data, error } = await supabase
      .from("user_wallets")
      .select("paid_stars, bonus_stars")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const paid = data?.paid_stars ?? 0;
    const bonus = data?.bonus_stars ?? 0;

    return { paid, bonus, total: paid + bonus };
  }
}

/**
 * 별 차감 (Supabase RPC 함수 호출)
 * @param {string} userId
 * @param {number} amount - 차감할 별 개수
 * @param {string} description - 차감 사유 (예: "오늘 운세 조회")
 * @returns {Promise<{success: boolean, newBalance: {paid: number, bonus: number}}>}
 */
export async function consumeStars(userId, amount, description) {
  if (!userId) {
    throw new Error("사용자 ID가 필요합니다.");
  }

  if (amount <= 0) {
    throw new Error("차감할 별 개수는 0보다 커야 합니다.");
  }

  try {
    const { data, error } = await supabase.rpc("consume_stars", {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
    });

    if (error) {
      console.error("❌ 별 차감 실패:", error);
      throw error;
    }

    if (!data || !data.success) {
      throw new Error(data?.message || "별 차감에 실패했습니다.");
    }

    return data;
  } catch (err) {
    console.error("❌ 별 차감 중 오류:", err);
    throw err;
  }
}

/**
 * 별 잔액 확인 및 모달 타입 결정
 * @param {number} currentStars - 현재 보유 별
 * @param {number} requiredStars - 필요한 별
 * @returns {"sufficient" | "insufficient"} - sufficient: 잔액 충분(confirm 모달), insufficient: 잔액 부족(alert 모달)
 */
export function checkStarBalance(currentStars, requiredStars) {
  return currentStars >= requiredStars ? "sufficient" : "insufficient";
}
