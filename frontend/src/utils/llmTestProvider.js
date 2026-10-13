/**
 * LLM 비교 테스트용 공급자 선택 (관리자 전용).
 * 브라우저 콘솔에서 localStorage.setItem("tf_llm_provider", "openai") 처럼 지정하면
 * get-fortune / premium-report 요청에 llmProvider 를 실어 보낸다.
 * 값: "openai" | "gemini" | "gemini-3.8"  (해제: localStorage.removeItem("tf_llm_provider"))
 * 서버가 admin_users 등록 여부를 확인하므로, 일반 사용자가 값을 넣어도 무시된다.
 */
const KEY = "tf_llm_provider";
const ALLOWED = new Set(["openai", "gemini", "gemini-3.8"]);

export function withLlmTestProvider(body) {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (v && ALLOWED.has(v)) return { ...body, llmProvider: v };
  } catch (_) {
    // 저장소 접근 불가(사파리 개인정보 보호 모드 등) — 무시
  }
  return body;
}
