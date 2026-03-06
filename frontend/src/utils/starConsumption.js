import { supabase } from "../lib/supabaseClient";

/**
 * 운세 타입별 필요 운세권 개수
 */
export const FORTUNE_STAR_COSTS = {
  daily: 1,        // 데일리 운세권 1장
  yearly: 1,       // 일반 운세권 1장
  lifetime: 1,     // 단건 결제 (1990원)
  compatibility: 1, // 일반 운세권 1장
  consultation: 1,  // 일반 운세권 1장
};

/**
 * 운세 타입별 한글 이름
 */
export const FORTUNE_TYPE_NAMES = {
  daily: "오늘 운세",
  yearly: "1년 운세",
  lifetime: "종합 운세",
  compatibility: "진짜궁합",
  consultation: "자유 질문",
};

/**
 * 차감 시 사용한 description으로 환불 재화 타입 추론
 * @param {string} description - consume_stars에 넣었던 description
 * @returns {'PAID' | 'BONUS' | 'PROBE'}
 */
export function getCurrencyTypeFromDescription(description) {
  if (!description || typeof description !== "string") return "PAID";
  const d = description;
  if (d.includes("데일리") || d.includes("오늘 운세")) return "BONUS";
  if (d.includes("종합운세") || d.includes("종합 운세") || d.includes("탐사선")) return "PROBE";
  return "PAID";
}

/**
 * 운세 생성 실패 시 재화 환불 (p_refund_type은 description으로 자동 판단)
 * @param {string} userId
 * @param {number} amount - 환불할 개수
 * @param {string} transactionDescription - 거래 내역에 남길 설명 (예: "운세 생성 실패(에러/타임아웃)로 인한 자동 환불")
 * @param {string} consumptionDescription - 차감 시 사용했던 description (getCurrencyTypeFromDescription에 전달)
 * @returns {Promise<void>}
 */
export async function refundStars(userId, amount, transactionDescription, consumptionDescription) {
  if (!userId) throw new Error("사용자 ID가 필요합니다.");
  const p_refund_type = getCurrencyTypeFromDescription(consumptionDescription);
  const { error } = await supabase.rpc("refund_stars", {
    p_user_id: userId,
    p_amount: amount,
    p_description: transactionDescription,
    p_refund_type,
  });
  if (error) throw error;
}

/**
 * 사용자의 현재 운세권 잔액 조회 (유효한 운세권만 계산)
 * @param {string} userId
 * @returns {Promise<{paid: number, bonus: number, total: number}>}
 */
export async function fetchUserStars(userId) {
  if (!userId) {
    throw new Error("사용자 ID가 필요합니다.");
  }

  try {
    // get_valid_stars RPC 함수를 사용하여 만료되지 않은 운세권만 조회
    const { data, error } = await supabase.rpc("get_valid_stars", {
      p_user_id: userId,
    });

    if (error) {
      console.error("❌ 유효한 운세권 조회 실패:", error);
      throw error;
    }

    const paid = data?.[0]?.paid_stars ?? 0;
    const bonus = data?.[0]?.bonus_stars ?? 0;
    const probe = data?.[0]?.probe_stars ?? 0;
    const total = data?.[0]?.total_stars ?? paid + bonus + probe;

    return { paid, bonus, probe, total };
  } catch (err) {
    console.error("❌ 운세권 잔액 조회 중 오류:", err);
    // RPC가 없으면 기존 방식으로 폴백
    const { data, error } = await supabase
      .from("user_wallets")
      .select("paid_stars, bonus_stars, probe_stars")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const paid = data?.paid_stars ?? 0;
    const bonus = data?.bonus_stars ?? 0;
    const probe = data?.probe_stars ?? 0;

    return { paid, bonus, probe, total: paid + bonus + probe };
  }
}

/**
 * 운세권 차감 (Supabase RPC 함수 호출)
 * @param {string} userId
 * @param {number} amount - 차감할 운세권 개수
 * @param {string} description - 차감 사유 (예: "오늘 운세 조회")
 * @returns {Promise<{success: boolean, newBalance: {paid: number, bonus: number}}>}
 */
export async function consumeStars(userId, amount, description) {
  if (!userId) {
    throw new Error("사용자 ID가 필요합니다.");
  }

  if (amount <= 0) {
    throw new Error("차감할 운세권 개수는 0보다 커야 합니다.");
  }

  try {
    const { data, error } = await supabase.rpc("consume_stars", {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
    });

    if (error) {
      console.error("❌ 운세권 차감 실패:", error);
      throw error;
    }

    if (!data || !data.success) {
      throw new Error(data?.message || "운세권 차감에 실패했습니다.");
    }

    return data;
  } catch (err) {
    console.error("❌ 운세권 차감 중 오류:", err);
    throw err;
  }
}

/**
 * 운세권 잔액 확인 및 모달 타입 결정
 * @param {number} currentStars - 현재 보유 운세권
 * @param {number} requiredStars - 필요한 운세권
 * @returns {"sufficient" | "insufficient"} - sufficient: 잔액 충분(confirm 모달), insufficient: 잔액 부족(alert 모달)
 */
export function checkStarBalance(currentStars, requiredStars) {
  return currentStars >= requiredStars ? "sufficient" : "insufficient";
}
