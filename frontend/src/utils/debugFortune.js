/**
 * get-fortune 응답의 디버그 정보를 브라우저 콘솔에 출력합니다.
 * 개발자 도구(F12) → Console에서 확인 가능합니다.
 */

/**
 * 차트 요약 한 줄 (날짜, Asc, 행성 수)
 * @param {object} chart - chart 또는 chart_data.chart
 * @returns {string}
 */
function chartSummary(chart) {
  if (!chart) return "(없음)";
  const date = chart.date ?? "(날짜 없음)";
  const asc = chart.houses?.angles?.ascendant;
  const ascStr = asc != null ? `${(asc % 30).toFixed(1)}° in sign #${Math.floor(asc / 30) + 1}` : "—";
  const planetCount = chart.planets ? Object.keys(chart.planets).length : 0;
  return `date=${date}, Asc=${ascStr}, planets=${planetCount}`;
}

/**
 * 자유상담소/데일리/종합/궁합 공통: Gemini에 넘긴 차트·프롬프트·항성 등 인풋을 콘솔에 출력합니다.
 * - 차트 요약 (chart, chart2, transitChart 등)
 * - User Prompt (또는 geminiInput.userPrompt)
 * - System Instruction (또는 geminiInput.systemInstruction)
 * - debugInfo (fullPromptSentToGemini, neo4jContext, rawGeminiResponse 등)
 *
 * @param {object} data - get-fortune API 응답 객체
 * @param {{ fortuneType?: string }} options - fortuneType: 'daily' | 'lifetime' | 'consultation' | 'compatibility'
 */
export function logFortuneInput(data, options = {}) {
  const fortuneType = options.fortuneType ?? data.fortuneType ?? "unknown";

  console.groupCollapsed(
    `🔍 [진짜미래] Gemini 인풋 — ${fortuneType} (차트·프롬프트·항성 등)`,
  );

  // 1. 차트 정보 요약
  console.group("📊 차트 정보");
  if (data.chart) {
    console.log("chart:", chartSummary(data.chart));
  }
  if (data.chart2) {
    console.log("chart2:", chartSummary(data.chart2));
  }
  if (data.transitChart) {
    console.log("transitChart:", chartSummary(data.transitChart));
  }
  if (data.aspects && Array.isArray(data.aspects)) {
    console.log("aspects:", data.aspects);
  }
  if (data.transitMoonHouse != null) {
    console.log("transitMoonHouse:", data.transitMoonHouse);
  }
  if (data.synastryResult) {
    console.log("synastryResult:", data.synastryResult);
  }
  console.groupEnd();

  // 2. User Prompt (자유상담은 geminiInput.userPrompt)
  const userPrompt =
    data.userPrompt ?? data.geminiInput?.userPrompt ?? null;
  if (userPrompt) {
    console.group("📝 User Prompt (제미나이에게 전달한 사용자/차트 프롬프트)");
    console.log(userPrompt);
    console.groupEnd();
  } else {
    console.log("📝 User Prompt: (없음)");
  }

  // 3. System Instruction
  const systemInstruction =
    data.systemInstruction ?? data.geminiInput?.systemInstruction ?? null;
  if (systemInstruction) {
    console.group("📋 System Instruction (시스템 지시문)");
    console.log(systemInstruction);
    console.groupEnd();
  } else {
    console.log("📋 System Instruction: (없음)");
  }

  // 4. debugInfo (fullPromptSentToGemini, neo4jContext, rawGeminiResponse 등)
  if (data.debugInfo) {
    console.group("🛠️ debugInfo");
    console.log(data.debugInfo);
    if (data.debugInfo.fullPromptSentToGemini) {
      console.log("fullPromptSentToGemini (전체):", data.debugInfo.fullPromptSentToGemini);
    }
    console.groupEnd();
  } else {
    console.log("🛠️ debugInfo: (없음)");
  }

  console.groupEnd();
}
