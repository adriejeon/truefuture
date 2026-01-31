/**
 * get-fortune 응답의 debugInfo를 브라우저 콘솔에 상세 출력합니다.
 * 개발자 도구(F12) → Console에서만 확인 가능합니다.
 *
 * @param {object} data - get-fortune API 응답 객체 (data.debugInfo 존재 시에만 로그)
 */
export function logDebugInfoIfPresent(data) {
  if (!data?.debugInfo) return;

  console.groupCollapsed("🔍 [Debug] get-fortune 디버그 정보");
  console.log(
    "🚀 [Debug] Gemini 프롬프트 (fullPromptSentToGemini):",
    data.debugInfo.fullPromptSentToGemini ?? "(없음)",
  );
  console.log(
    "🧠 [Debug] Neo4j 해석 데이터 (neo4jContext):",
    data.debugInfo.neo4jContext ?? "(없음)",
  );
  console.log(
    "📦 [Debug] Gemini 원본 응답 (rawGeminiResponse):",
    data.debugInfo.rawGeminiResponse ?? "(없음)",
  );
  console.log("📋 [Debug] debugInfo 전체:", data.debugInfo);
  console.groupEnd();
}
