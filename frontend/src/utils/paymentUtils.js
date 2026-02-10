/**
 * 결제 관련 유틸리티 함수
 */

/**
 * 이메일 형식 유효성 검증
 * @param {string} email - 검증할 이메일 주소
 * @returns {boolean} 유효한 이메일 형식인지 여부
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") {
    return false;
  }
  // 기본적인 이메일 형식 검증 (RFC 5322의 간단한 버전)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * 사용자 이메일을 검증하고, 유효하지 않으면 대체 이메일을 생성합니다.
 * @param {Object} user - Supabase 사용자 객체
 * @returns {string} 유효한 이메일 주소 (원본 또는 생성된 대체 이메일)
 */
export function getValidEmailForPayment(user) {
  // 사용자의 이메일 가져오기
  const userEmail = user?.email;

  // 이메일이 있고 유효한 형식이면 그대로 반환
  if (userEmail && isValidEmail(userEmail)) {
    return userEmail;
  }

  // 이메일이 없거나 유효하지 않은 경우 대체 이메일 생성
  const userId = user?.id || Date.now().toString();
  const fallbackEmail = `no-email-${userId}@truefuture.kr`;
  
  console.warn(
    `[결제] 사용자 이메일이 유효하지 않아 대체 이메일을 사용합니다: ${fallbackEmail}`,
    { originalEmail: userEmail, userId }
  );

  return fallbackEmail;
}

/**
 * IMP.request_pay 호출을 위한 buyer_email 값 준비
 * @param {Object} user - Supabase 사용자 객체
 * @returns {string} 결제에 사용할 이메일 주소
 */
export function prepareBuyerEmail(user) {
  return getValidEmailForPayment(user);
}
