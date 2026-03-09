/**
 * 친구 추천: 초대 코드 저장/조회 및 추천 등록 RPC 호출
 * - 로그인/가입 페이지 진입 시 URL의 ref 파라미터를 저장
 * - OAuth 콜백 등에서 회원가입 완료 후 register_referral RPC 호출 (실패해도 로그인 흐름은 유지)
 */

const PENDING_REFERRAL_KEY = 'pending_referral_code';

/**
 * localStorage에 저장된 대기 중인 초대 코드 조회
 * @returns {string|null}
 */
export function getPendingReferralCode() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PENDING_REFERRAL_KEY);
  } catch {
    return null;
  }
}

/**
 * 초대 코드를 localStorage에 저장 (OAuth 리다이렉트 후에도 유지)
 * @param {string} code
 */
export function setPendingReferralCode(code) {
  if (typeof window === 'undefined' || !code || !String(code).trim()) return;
  try {
    window.localStorage.setItem(PENDING_REFERRAL_KEY, String(code).trim());
  } catch {
    // ignore
  }
}

/**
 * 저장된 초대 코드 제거 (등록 시도 후 호출)
 */
export function clearPendingReferralCode() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    // ignore
  }
}

/**
 * 대기 중인 초대 코드가 있으면 register_referral RPC를 호출합니다.
 * 실패(탈퇴 재가입, 잘못된 코드 등)해도 예외를 던지지 않고 로그만 남기며,
 * 호출 후 저장된 코드는 제거합니다.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient - Supabase 클라이언트
 * @param {string} refereeId - 방금 가입/로그인한 유저의 auth.users.id
 * @returns {Promise<{ success: boolean, message?: string }>} RPC 결과 (실패 시에도 로그인 흐름은 막지 않음)
 */
export async function registerReferralIfPending(supabaseClient, refereeId) {
  const code = getPendingReferralCode();
  clearPendingReferralCode();

  if (!code || !refereeId) {
    return { success: false, message: '저장된 초대 코드 또는 유저 정보 없음' };
  }

  if (!supabaseClient?.rpc) {
    console.warn('[referral] Supabase 클라이언트가 없어 추천 등록을 건너뜁니다.');
    return { success: false, message: 'Supabase 클라이언트 없음' };
  }

  try {
    const { data, error } = await supabaseClient.rpc('register_referral', {
      p_referee_id: refereeId,
      p_referral_code: code,
    });

    if (error) {
      console.warn('[referral] register_referral RPC 오류:', error.message);
      return { success: false, message: error.message };
    }

    const result = data ?? {};
    if (result.success) {
      return { success: true, message: result.message };
    }

    // success: false (유효하지 않은 코드, 재가입 유저, 자기 자신 등) — 로그인은 정상 진행
    console.info('[referral] 추천 미등록:', result.message ?? result);
    return { success: false, message: result.message ?? '추천 등록되지 않음' };
  } catch (err) {
    console.warn('[referral] 추천 등록 중 예외 (로그인은 계속 진행):', err);
    return { success: false, message: err?.message ?? '예외 발생' };
  }
}
