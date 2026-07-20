// Supabase Edge Function for True Future - 점성술 서비스
// Gemini API 호출을 서버 사이드에서 처리하여 CORS 및 지역 차단 문제 해결

// Deno 전역 타입 선언 (Supabase Edge Functions는 Deno 런타임 사용)
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 타입 및 프롬프트 import
import {
  FortuneType,
  UserData,
  CompatibilityData,
  ChartData,
  TransitNatalPlacement,
} from "./types.ts";

// promptFactory: language 파라미터로 KO/EN 모듈을 동적 선택
import { getModules } from "./promptFactory.ts";

// 점성술 계산 유틸리티 import
import {
  calculateChart,
  calculateAspects,
  getTransitMoonHouseInNatalChart,
  getSignFromLongitude,
  PLANET_NAMES,
  calculateSolarReturnDateTime,
  getActiveSolarReturnYear,
  calculateProfection,
  getSolarReturnOverlays,
  calculateFirdaria,
  analyzeLordInteraction,
  analyzeCareerPotential,
  analyzeWealthPotential,
  analyzeHealthPotential,
  calculateLotOfMarriage,
  analyzeLoveQualities,
  identifySpouseCandidate,
  analyzeLoveTiming,
  calculateSecondaryProgression,
  calculatePrimaryDirections,
  calculateProgressedEventsTimeline,
  calculateProfectionTimeline,
  calculateLordOfYearTransitAspects,
  calculateTransitToTransitAspects,
  getLordOfYearTransitStatus,
  getPlanetLongitudeAndSpeed,
  getLordKeyFromName,
  getLordOfYearProfectionAngleEntry,
  calculateLordAspectsWithPhase,
  calculateDailyAngleStrikes,
  getTransitPointNatalWsQs,
} from "./utils/astrologyCalculator.ts";
import { calculateSynastry } from "./utils/synastryCalculator.ts";
import {
  scanShortTermEvents,
  formatShortTermEventsForPrompt,
} from "./utils/predictiveScanner.ts";
import {
  analyzeNatalFixedStars,
  formatNatalFixedStarsForPrompt,
  getLordOfYearFixedStarConjunctions,
  formatLordStarConjunctionsForPrompt,
} from "./utils/advancedAstrology.ts";
// 데일리 "오늘의 신호 등급" 스코어링 (연주–항성 회합 최상위 가중)
import {
  computeDailySpotlight,
  formatDailySpotlightForPrompt,
} from "./utils/dailySpotlight.ts";
// 데일리 Phase 2 트리거 (일월식·시저지·정지·MPD→SR→달)
import { computeDailyTriggerSignals } from "./utils/dailyTriggers.ts";

// Neo4j 전문 해석 데이터 조회
import {
  getNeo4jContext,
  isDayChartFromSun,
  fetchConsultationContext,
  getDailyReceptionRejectionMeta,
} from "./utils/neo4jContext.ts";
import { resolveTimezoneOffsetHours } from "./utils/timezoneUtils.ts";
// 해석 지식베이스 (차트 맞춤 규칙 룩업 → 프롬프트 주입, KO 전용)
import { buildKnowledgeContext } from "./utils/knowledgeBase.ts";
// Vertex AI 인증/엔드포인트 헬퍼 (서비스 계정 OAuth2 Bearer)
import {
  getVertexAccessToken,
  buildVertexUrl,
  normalizeVertexRequest,
  logVertexRequestShape,
} from "../_shared/vertex.ts";

// ========== CORS 헤더 설정 ==========
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * 프론트로 노출하는 공통 실패 메시지.
 * Vertex/Gemini 원문 에러(예: 400 role 오류)는 서버 로그에만 남기고,
 * 사용자에게는 이 친화 메시지만 보여준다.
 */
const USER_FACING_ERROR =
  "운세 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";

/** birthDateTime 등이 NaN/Invalid Date인 상태로 calculateChart에 넘어가는 것 방지 */
function assertValidDate(d: Date, context: string): void {
  if (
    !(d instanceof Date) ||
    Number.isNaN(d.getTime()) ||
    !Number.isFinite(d.getTime())
  ) {
    throw new Error(`[${context}] Invalid date (got: ${String(d)})`);
  }
}

/**
 * YYYY-MM-DD 형식의 targetDate를 파싱/검증.
 * 값이 없으면 클라이언트 로컬 타임존 기준 오늘 날짜(YYYY-MM-DD)를 반환.
 * @param timezoneOffset - JS getTimezoneOffset() 값(분). KST = -540, EST = +300
 */
function resolveTargetDateYmd(input: unknown, timezoneOffset: number): string {
  // local = UTC - timezoneOffset * 60000
  // (timezoneOffset은 UTC-local 분 단위이므로, UTC에서 빼면 로컬이 됨)
  const localOffsetMs = timezoneOffset * 60 * 1000;

  const toYmd = (d: Date): string => {
    const local = new Date(d.getTime() - localOffsetMs);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth() + 1;
    const day = local.getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  if (typeof input !== "string" || input.trim() === "") {
    return toYmd(new Date());
  }

  const s = input.trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Invalid targetDate format. Expected YYYY-MM-DD");
  }
  const [, yy, mm, dd] = match;
  const y = Number(yy);
  const m = Number(mm);
  const d = Number(dd);
  const utc = new Date(Date.UTC(y, m - 1, d));
  // 캘린더 유효성 검증 (예: 2026-02-31 방지)
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    throw new Error("Invalid targetDate value.");
  }
  return s;
}

/**
 * targetDate(YYYY-MM-DD, 로컬 날짜)를 기준으로
 * 클라이언트 현지 시각 06:00 / 18:00 을 UTC Date로 변환해 반환.
 * @param timezoneOffset - JS getTimezoneOffset() 값(분). KST = -540, EST = +300
 *   UTC = Local + timezoneOffset * 60000
 */
function getDailyTransitDatesUtc(
  targetDateYmd: string,
  timezoneOffset: number,
): {
  amDateUtc: Date;
  pmDateUtc: Date;
} {
  const match = targetDateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Invalid targetDate format. Expected YYYY-MM-DD");
  }
  const [, yy, mm, dd] = match;
  const y = Number(yy);
  const m = Number(mm) - 1;
  const d = Number(dd);
  // 로컬 06:00 → UTC: 로컬 타임스탬프 + timezoneOffset(ms)
  // 예: KST(-540분) 06:00 → UTC = 06:00 + (-540min) = 21:00 전날
  // 예: EST(+300분) 06:00 → UTC = 06:00 + 300min = 11:00 당일
  const offsetMs = timezoneOffset * 60 * 1000;
  const amDateUtc = new Date(Date.UTC(y, m, d, 6, 0, 0) + offsetMs);
  const pmDateUtc = new Date(Date.UTC(y, m, d, 18, 0, 0) + offsetMs);
  return { amDateUtc, pmDateUtc };
}

// ========== AI 해석 관련 함수 ==========
const GEMINI_MODEL = "gemini-3.5-flash"; // 데일리·궁합 등 일반 타입
const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview"; // 플래그십 심층 리딩(종합운/연간) — 해석 깊이 우선
const GEMINI_FALLBACK_MODEL = "gemini-3.5-flash"; // 503/과부하 시 폴백
const GEMINI_CONSULTATION_FIRST_MODEL = "gemini-3.1-pro-preview"; // 자유 상담소 첫 질문 전용
const GEMINI_CONSULTATION_FOLLOWUP_MODEL = "gemini-3.5-flash"; // 자유 상담소 후속 질문
// 엔드포인트는 Vertex AI 헬퍼(buildVertexUrl)가 프로젝트/리전 기반으로 구성한다.

/** 503 또는 Overloaded 관련 에러인지 판별 (폴백 트리거용) */
function is503OrOverloaded(error: any): boolean {
  const msg = (error?.message ?? String(error)).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("overloaded")
  );
}

/**
 * Primary 모델 호출 후 503/과부하 시 Fallback 모델로 재시도.
 * 프롬프트·설정은 동일하게 유지.
 */
async function callGeminiAPIWithFallback(
  primaryModel: string,
  fallbackModel: string,
  apiKey: string,
  requestBody: any,
): Promise<any> {
  try {
    return await callGeminiAPI(primaryModel, apiKey, requestBody);
  } catch (e: any) {
    if (is503OrOverloaded(e)) {
      console.warn(
        "⚠️ Gemini 2.5 Pro 과부하로 인해 Flash 모델로 전환합니다.",
      );
      return await callGeminiAPI(fallbackModel, apiKey, requestBody);
    }
    throw e;
  }
}

/**
 * 운세 타입에 따라 사용할 Gemini 모델을 반환
 * 자유 상담소(CONSULTATION)는 첫 질문/후속 질문 구분은 getConsultationModel()에서 처리
 */
function getGeminiModel(fortuneType: FortuneType): string {
  // 해석 깊이가 핵심 가치인 플래그십 리딩(종합운·연간)은 pro 티어로.
  // (데일리·궁합은 flash 유지, 자유 상담은 getConsultationModel에서 별도 처리)
  if (fortuneType === FortuneType.LIFETIME) {
    return GEMINI_PRO_MODEL;
  }
  return GEMINI_MODEL;
}

/** 자유 상담소: 첫 질문은 2.5 Pro, 후속 질문은 3 Flash */
function getConsultationModel(isFollowUp: boolean): string {
  return isFollowUp ? GEMINI_CONSULTATION_FOLLOWUP_MODEL : GEMINI_CONSULTATION_FIRST_MODEL;
}

/** 자유 상담소: 첫 질문용 generation config (Pro 모델 사용) */
function getConsultationFirstQuestionConfig(): Record<string, number> {
  return {
    temperature: 0.9,
    topK: 50,
    topP: 0.95,
    maxOutputTokens: 10000,
  };
}

/** 자유 상담소: 후속 질문용 generation config (2.5 Flash 사용) */
function getConsultationFollowUpConfig(): Record<string, number> {
  return {
    temperature: 0.9,
    topK: 50,
    topP: 0.95,
    maxOutputTokens: 8000,
  };
}

/**
 * 운세 타입에 따라 사용할 Generation Config를 반환
 */
function getGenerationConfig(fortuneType: FortuneType): any {
  switch (fortuneType) {
    case FortuneType.DAILY:
      return {
        temperature: 0.9,
        topK: 50,
        topP: 0.95,
        maxOutputTokens: 9000,
      };
    case FortuneType.COMPATIBILITY:
    case FortuneType.CONSULTATION:
      return {
        temperature: 0.9,
        topK: 50,
        topP: 0.95,
        maxOutputTokens: 15000,
      };
    default:
      return {
        temperature: 0.9,
        topK: 50,
        topP: 0.95,
        maxOutputTokens: 9000,
      };
  }
}

function compressChartData(chartData: any): string {
  const parts: string[] = [];

  const planetMap: any = {
    sun: "Sun",
    moon: "Moon",
    mercury: "Mercury",
    venus: "Venus",
    mars: "Mars",
    jupiter: "Jupiter",
    saturn: "Saturn",
  };

  if (chartData.planets) {
    const planetPositions = Object.entries(chartData.planets)
      .filter(([key]) => planetMap[key])
      .map(([key, p]: [string, any]) => {
        const name = planetMap[key];
        const deg = Math.round(p.degreeInSign || 0);
        return `${name}:${p.sign}(${deg}deg)`;
      });
    if (planetPositions.length > 0) {
      parts.push(planetPositions.join(","));
    }
  }

  if (chartData.houses?.angles?.ascendant !== undefined) {
    const asc = chartData.houses.angles.ascendant;
    const ascSign = getSignFromLongitude(asc);
    const ascDeg = Math.round(ascSign.degreeInSign || 0);
    parts.push(`Asc:${ascSign.sign}(${ascDeg}deg)`);
  }

  if (chartData.fortuna) {
    const fortDeg = Math.round(chartData.fortuna.degreeInSign || 0);
    parts.push(`Fort:${chartData.fortuna.sign}(${fortDeg}deg)`);
  }

  return parts.join(" ");
}

function getReportTypeDescription(fortuneType: FortuneType): string {
  const descriptions: Record<FortuneType, string> = {
    [FortuneType.DAILY]: "일일 운세",
    [FortuneType.LIFETIME]: "인생 종합운(사주)",
    [FortuneType.COMPATIBILITY]: "궁합 분석",
    [FortuneType.CONSULTATION]: "싱글턴 자유 질문",
  };

  return descriptions[fortuneType] || "일반 운세";
}

function buildUserPrompt(
  chartData: any,
  fortuneType: FortuneType,
  compatibilityChartData?: any,
  transitChartData?: any,
  aspects?: any[],
  transitMoonHouse?: number,
  solarReturnChartData?: any,
  profectionData?: any,
  solarReturnOverlay?: any,
  timeLordRetrogradeAlert?: { planet: string; isRetrograde: boolean } | null,
  lordTransitAspects?: any[],
  lordTransitStatus?: {
    isRetrograde: boolean;
    isDayChart: boolean;
    sectStatus: "day_sect" | "night_sect" | "neutral";
    isInSect: boolean;
  },
  lordStarConjunctionsText?: string,
  transitToTransitAspects?: any[],
  // 데일리 고전 점성술 리팩토링용 (오전/오후 분할, 4대 감응점, Neo4j 리셉션/리젝션)
  dailyFlowAM?: import("./types.ts").DailyFlowSummary,
  dailyFlowPM?: import("./types.ts").DailyFlowSummary,
  dailyAngleStrikes?: import("./types.ts").DailyAngleStrike[],
  lordProfectionAngleEntry?: import("./types.ts").LordProfectionAngleEntry | null,
  neo4jContextForDaily?: string | null,
  targetDateYmdKst?: string,
  transitMoonNatalPlacement?: TransitNatalPlacement | null,
  transitLordNatalPlacement?: TransitNatalPlacement | null,
  language?: string,
): string {
  const { formatter } = getModules(language ?? "ko");

  // DAILY: 고전 점성술 포맷 (오전/오후, 4대 감응점 타격, Neo4j 리셉션/리젝션)
  if (
    fortuneType === FortuneType.DAILY &&
    dailyFlowAM != null &&
    dailyFlowPM != null &&
    dailyAngleStrikes != null
  ) {
    return formatter.generateDailyUserPrompt(
      chartData as ChartData,
      targetDateYmdKst || new Date().toISOString().split("T")[0],
      profectionData ?? null,
      dailyFlowAM,
      dailyFlowPM,
      dailyAngleStrikes,
      neo4jContextForDaily ?? null,
      lordProfectionAngleEntry ?? null,
      timeLordRetrogradeAlert ?? null,
      lordTransitStatus ?? null,
      lordStarConjunctionsText ?? null,
      transitMoonHouse,
      transitMoonNatalPlacement ?? null,
      transitLordNatalPlacement ?? null,
    );
  }

  // LIFETIME 운세의 경우 상세 프롬프트 사용
  if (fortuneType === FortuneType.LIFETIME) {
    return formatter.generateLifetimeUserPrompt(chartData as ChartData);
  }

  // COMPATIBILITY 운세의 경우 두 사람의 상세 프롬프트 사용
  if (fortuneType === FortuneType.COMPATIBILITY && compatibilityChartData) {
    return formatter.generateCompatibilityUserPrompt(
      chartData as ChartData,
      compatibilityChartData as ChartData,
    );
  }

  // 폴백: 기존 압축 방식 (사용되지 않을 것으로 예상)
  const reportTypeDesc = getReportTypeDescription(fortuneType);
  const compressedData = compressChartData(chartData);

  let prompt = `${reportTypeDesc} 분석:\n\n${compressedData}`;

  // 궁합의 경우 두 번째 차트 데이터 추가
  if (fortuneType === FortuneType.COMPATIBILITY && compatibilityChartData) {
    const compressedData2 = compressChartData(compatibilityChartData);
    prompt += `\n\n두 번째 사람:\n${compressedData2}`;
  }

  return prompt;
}

async function callGeminiAPI(
  modelName: string,
  _apiKey: string,
  requestBody: any,
): Promise<any> {
  const endpoint = buildVertexUrl(modelName, "generateContent");
  const accessToken = await getVertexAccessToken();

  // Vertex는 contents[].role 이 "user"|"model" 이어야 함 → 항상 정규화 후 전송
  const normalizedBody = normalizeVertexRequest(requestBody);
  logVertexRequestShape(normalizedBody, { model: modelName, method: "generateContent" });

  const maxRetries = 3;
  let delay = 1000; // 초기 지연 시간: 1초

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify(normalizedBody),
      });

      // 503 Service Unavailable (Model Overloaded): 재시도 없이 즉시 throw → 상위에서 폴백 모델로 전환
      if (response.status === 503) {
        const errorText = await response.text();
        console.warn(
          "⚠️ Gemini API 503 Service Unavailable (Model Overloaded). 폴백 모델로 전환할 수 있습니다.",
        );
        throw new Error(
          `Gemini API 503 Service Unavailable (Model Overloaded). ${errorText.substring(0, 200)}`,
        );
      }

      // 429 Rate Limit: 재시도
      if (response.status === 429) {
        if (attempt < maxRetries) {
          console.warn(
            `⚠️ 429 Too Many Requests. ${delay}ms 후 재시도합니다... (남은 시도: ${maxRetries - attempt})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // 지수 백오프
          continue;
        } else {
          const errorText = await response.text();
          console.error("\n" + "=".repeat(60));
          console.error("❌ Gemini API Rate Limit 초과 (429)");
          console.error("=".repeat(60));
          console.error("최대 재시도 횟수(3회)를 초과했습니다.");
          console.error("에러 응답:", errorText);
          console.error("=".repeat(60) + "\n");
          throw new Error(
            `Gemini API Quota Exceeded (429): 최대 재시도 횟수를 초과했습니다. ${errorText.substring(0, 200)}`,
          );
        }
      }

      // 429, 503이 아닌 다른 에러 처리
      if (!response.ok) {
        const errorText = await response.text();
        console.error("\n" + "=".repeat(60));
        console.error("❌ Gemini API 요청 실패");
        console.error("=".repeat(60));
        console.error("상태 코드:", response.status);
        console.error("상태 텍스트:", response.statusText);
        console.error("에러 응답:", errorText);
        console.error("=".repeat(60) + "\n");

        // API 키 관련 에러인지 확인
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Gemini API 인증 실패: API 키가 유효하지 않거나 만료되었습니다.",
          );
        }

        throw new Error(
          `Gemini API 요청 실패 (${response.status}): ${
            response.statusText
          }. ${errorText.substring(0, 200)}`,
        );
      }

      // 성공적인 응답 처리
      const apiResponse = await response.json();

      if (apiResponse.error) {
        console.error("\n" + "=".repeat(60));
        console.error("❌ Gemini API 에러 응답");
        console.error("=".repeat(60));
        console.error("에러:", JSON.stringify(apiResponse.error, null, 2));
        console.error("=".repeat(60) + "\n");

        throw new Error(
          `Gemini API error: ${
            apiResponse.error.message || JSON.stringify(apiResponse.error)
          }`,
        );
      }

      return apiResponse;
    } catch (error: any) {
      // 네트워크 에러나 기타 예외는 재시도하지 않고 바로 던짐
      // (429, 503 에러는 위의 response.status 체크에서 처리됨)
      console.error("\n" + "=".repeat(60));
      console.error("❌ Gemini API 호출 중 예외 발생");
      console.error("=".repeat(60));
      console.error("에러:", error.message);
      console.error("스택:", error.stack);
      console.error("=".repeat(60) + "\n");
      throw error;
    }
  }

  // 이 코드는 도달하지 않지만 TypeScript를 위해 추가
  throw new Error("Unexpected error in callGeminiAPI");
}

/** SSE 응답 헤더 (Server-Sent Events 규격) */
const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

/**
 * Gemini streamGenerateContent 호출.
 * 청크별 텍스트를 yield하는 비동기 제너레이터 반환.
 * 503/과부하 시 fallback 모델로 재시도.
 */
async function* callGeminiAPIStream(
  primaryModel: string,
  fallbackModel: string,
  _apiKey: string,
  requestBody: any,
): AsyncGenerator<string, void, unknown> {
  const accessToken = await getVertexAccessToken();
  const authHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
  };
  const endpoint = buildVertexUrl(primaryModel, "streamGenerateContent");

  // Vertex는 contents[].role 이 "user"|"model" 이어야 함 → 항상 정규화 후 전송
  const normalizedBody = normalizeVertexRequest(requestBody);
  logVertexRequestShape(normalizedBody, {
    model: primaryModel,
    method: "streamGenerateContent",
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(normalizedBody),
    });
  } catch (e: any) {
    console.error("❌ Gemini stream fetch 실패:", e?.message);
    throw e;
  }

  if (response.status === 503 && is503OrOverloaded(new Error("503"))) {
    console.warn("⚠️ Gemini 스트림 503 → 폴백 모델로 재시도");
    const fallbackEndpoint = buildVertexUrl(fallbackModel, "streamGenerateContent");
    logVertexRequestShape(normalizedBody, {
      model: fallbackModel,
      method: "streamGenerateContent",
    });
    response = await fetch(fallbackEndpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(normalizedBody),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error(
        `Gemini API Quota Exceeded (429): ${errorText.substring(0, 200)}`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Gemini API 인증 실패: API 키가 유효하지 않습니다.");
    }
    throw new Error(
      `Gemini stream 요청 실패 (${response.status}): ${errorText.substring(0, 300)}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Gemini stream: response body 없음");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]" || jsonStr === "") continue;
        try {
          const data = JSON.parse(jsonStr);
          const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          if (typeof text === "string" && text) {
            yield text;
          }
        } catch (_) {
          // JSON 파싱 실패 시 해당 라인 스킵
        }
      }
    }
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr && jsonStr !== "[DONE]") {
          try {
            const data = JSON.parse(jsonStr);
            const text =
              data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (typeof text === "string" && text) yield text;
          } catch (_) {}
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * SSE ReadableStream 생성: Gemini 청크를 프론트로 전달하면서 fullText 누적,
 * 스트림 종료 시 Supabase에 insert 후 [DONE] 전송하고 스트림 닫기.
 * - insert 성공 직후 consumeTransactionId가 있으면 star_transactions.consume_status를 SUCCESS로 확정.
 * - catch 시 에러 이벤트 전송 후 재throw하여 serve() 최상단 catch에서 refund_stars 실행되도록 유도.
 * - cancel() 시(클라이언트 연결 끊김) 아직 완료 전이면 refund_stars로 자동 환불.
 */
function createFortuneSSEStream(
  geminiStream: AsyncGenerator<string, void, unknown>,
  insertPayloadBuilder: (fullText: string) => Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  options?: {
    onInsert?: (shareId: string) => void;
    userId?: string;
    profileId?: string | null;
    fortuneType?: string;
    /** fortune_history.fortune_date에 저장할 날짜 (YYYY-MM-DD). DAILY targetDate에 사용 */
    fortuneDate?: string;
    /** 프론트 콘솔 디버깅용: 차트·프롬프트·debugInfo (logFortuneInput에 전달) */
    debugPayload?: Record<string, unknown>;
    /** 스트림 완료 시 SUCCESS 확정 및 cancel 시 환불에 사용 */
    consumeTransactionId?: string | null;
    authUserId?: string | null;
    consumeAmount?: number;
    consumeDescription?: string;
  },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let fullText = "";
  const cancelledRef = { current: false };
  let completed = false;
  let refunded = false;

  /**
   * 스트림이 정상 완료(completed)되지 않은 상태로 중단된 경우 차감분을 환불한다.
   * - Gemini/서버 오류로 start()가 throw될 때, 그리고 클라이언트 연결 끊김(cancel)일 때 공통 사용
   * - refunded 가드로 중복 환불 방지
   */
  const refundConsumed = async (reason: string): Promise<void> => {
    if (refunded || completed) return;
    if (
      !(
        options?.consumeTransactionId &&
        options?.authUserId &&
        options?.consumeAmount != null &&
        options.consumeAmount > 0
      )
    ) {
      return;
    }
    refunded = true;
    // 서비스 롤 키로 환불(RLS 영향 없이 확실히 복구). autoRefundConsumed는 함수 선언이라 호이스팅됨.
    await autoRefundConsumed({
      authUserId: options.authUserId,
      consumeAmount: options.consumeAmount,
      consumeDescription: options.consumeDescription ?? "",
      consumeTransactionId: options.consumeTransactionId,
      reason,
    });
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of geminiStream) {
          if (cancelledRef.current) break;
          fullText += chunk;
          const sseData = `data: ${JSON.stringify({ text: chunk })}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        }

        if (cancelledRef.current) {
          return;
        }

        const normalizedFullText = fullText
          .trim()
          .replace(/^```(?:markdown)?\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();
        const insertPayload = insertPayloadBuilder(normalizedFullText);
        const { data: resultData, error: resultError } = await supabase
          .from("fortune_results")
          .insert(insertPayload)
          .select("id")
          .single();

        if (resultError) {
          console.error("❌ [스트림] fortune_results insert 실패:", resultError);
          // 사용자에게는 아래 catch에서 친화 메시지를 전송하고, 여기서는 원문만 로그로 남긴다.
          throw new Error(resultError.message);
        }

        if (resultData?.id && options?.userId && options?.fortuneType && options?.profileId) {
          const shareId = resultData.id;
          const { error: historyError } = await supabase
            .from("fortune_history")
            .insert({
              user_id: options.userId,
              profile_id: options.profileId ?? null,
              result_id: shareId,
              fortune_type: options.fortuneType,
              fortune_date:
                (typeof options?.fortuneDate === "string" && options.fortuneDate.trim())
                  ? options.fortuneDate.trim()
                  : new Date().toISOString().split("T")[0],
            });
          if (historyError) {
            console.error("❌ [스트림] fortune_history insert 실패:", historyError);
          }
          options.onInsert?.(shareId);
        }

        if (options?.consumeTransactionId) {
          try {
            await supabase
              .from("star_transactions")
              .update({ consume_status: "SUCCESS" })
              .eq("id", options.consumeTransactionId)
              .eq("type", "CONSUME");
          } catch (e) {
            console.warn("⚠️ [스트림] consume_status SUCCESS 업데이트 실패:", e);
          }
        }
        completed = true;

        const shareId = resultData?.id ?? null;
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              share_id: shareId,
            })}\n\n`,
          ),
        );
      } catch (e: any) {
        // 원문 에러(Vertex 400 등)는 서버 로그에만 남기고, 프론트에는 친화 메시지만 전달
        console.error("❌ [스트림] 에러:", e?.message);
        // 스트림이 정상 완료되지 못했으므로 차감분 자동 환불
        await refundConsumed("운세 생성 실패(스트림 처리 오류)로 인한 자동 환불");
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: USER_FACING_ERROR })}\n\n`,
          ),
        );
        throw e;
      } finally {
        controller.close();
      }
    },
    cancel() {
      cancelledRef.current = true;
      void refundConsumed("운세 생성 실패(클라이언트 연결 끊김)로 인한 자동 환불");
    },
  });
}

function parseGeminiResponse(apiResponse: any): string {
  if (
    !apiResponse ||
    !apiResponse.candidates ||
    !Array.isArray(apiResponse.candidates)
  ) {
    throw new Error("Invalid API response: missing candidates array.");
  }

  if (apiResponse.candidates.length === 0) {
    throw new Error("Invalid API response: no candidates returned.");
  }

  const candidate = apiResponse.candidates[0];

  if (candidate.finishReason && candidate.finishReason === "MAX_TOKENS") {
    console.warn("Warning: Response was truncated due to MAX_TOKENS limit.");
  } else if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(
      `API response finished with reason: ${candidate.finishReason}`,
    );
  }

  const content = candidate.content;
  if (
    !content ||
    !content.parts ||
    !Array.isArray(content.parts) ||
    content.parts.length === 0
  ) {
    throw new Error("Invalid API response: missing content parts.");
  }

  const text = content.parts[0].text;
  if (!text || typeof text !== "string") {
    throw new Error("Invalid API response: missing or invalid text content.");
  }

  // Markdown 텍스트를 그대로 반환 (코드 블록 제거)
  let markdownText = text.trim();

  // 혹시 코드 블록으로 감싸져 있다면 제거
  markdownText = markdownText.replace(/^```(?:markdown)?\s*\n?/i, "");
  markdownText = markdownText.replace(/\n?```\s*$/i, "");
  markdownText = markdownText.trim();

  return markdownText;
}

const DIGNITY_SECTION_HEADER =
  "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[차트 위계/섹트/헤이즈 해석]\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

function logGeminiPromptDebug(
  fortuneType: FortuneType | string,
  systemInstruction: string,
  userPrompt: string,
) {
  console.log(
    JSON.stringify({
      logType: "GEMINI_PROMPT_DEBUG",
      fortuneType: fortuneType,
      systemPrompt: systemInstruction,
      userPrompt: userPrompt,
    }),
  );
}

async function getInterpretation(
  chartData: any,
  fortuneType: FortuneType,
  apiKey: string,
  gender?: string,
  birthDate?: string,
  location?: { lat: number; lng: number },
  compatibilityChartData?: any,
  transitChartData?: any,
  aspects?: any[],
  transitMoonHouse?: number,
  solarReturnChartData?: any,
  profectionData?: any,
  solarReturnOverlay?: any,
  synastryResult?: any,
  shortTermPromptSection?: string,
  timeLordRetrogradeAlert?: { planet: string; isRetrograde: boolean } | null,
  lordTransitAspects?: any[],
  lordTransitStatus?: {
    isRetrograde: boolean;
    isDayChart: boolean;
    sectStatus: "day_sect" | "night_sect" | "neutral";
    isInSect: boolean;
  },
  lordStarConjunctionsText?: string,
  relationshipType?: string,
  transitToTransitAspects?: any[],
  // 데일리 고전 점성술: 오전/오후 흐름, 4대 감응점 타격, 연주 앵글 진입
  dailyFlowAM?: import("./types.ts").DailyFlowSummary,
  dailyFlowPM?: import("./types.ts").DailyFlowSummary,
  dailyAngleStrikes?: import("./types.ts").DailyAngleStrike[],
  lordProfectionAngleEntry?: import("./types.ts").LordProfectionAngleEntry | null,
  targetDateYmdKst?: string,
  transitMoonNatalPlacement?: TransitNatalPlacement | null,
  transitLordNatalPlacement?: TransitNatalPlacement | null,
  category?: string, // CONSULTATION 카테고리 추가
  language?: string, // 언어 파라미터 ('ko' | 'en')
  streamOptions?: {
    supabase: ReturnType<typeof createClient>;
    insertPayloadBuilder: (fullText: string) => Record<string, unknown>;
    opts?: {
      userId?: string;
      profileId?: string | null;
      fortuneType?: string;
      consumeTransactionId?: string | null;
      authUserId?: string | null;
      consumeAmount?: number;
      consumeDescription?: string;
    };
  },
): Promise<any> {
  try {
    if (!apiKey) {
      throw new Error(
        "Missing GCP_SERVICE_ACCOUNT_JSON environment variable (Vertex AI 서비스 계정 키).",
      );
    }

    // LIFETIME 운세: streamOptions가 있으면 스트리밍 응답(SSE)으로 통일 (4개 병렬 호출 후 한 번에 전송)
    if (fortuneType === FortuneType.LIFETIME && streamOptions) {
      const result = await generateLifetimeFortune(
        chartData,
        apiKey,
        gender,
        birthDate,
        location,
        compatibilityChartData,
        transitChartData,
        aspects,
        transitMoonHouse,
        language,
      );
      if (result.error || !result.success) {
        return result;
      }
      const fullText = result.interpretation ?? "";
      async function* lifetimeChunkGenerator(): AsyncGenerator<string, void, unknown> {
        yield fullText;
      }
      const debugPayload: Record<string, unknown> = {
        chart: chartData,
        userPrompt: result.userPrompt,
        systemInstruction: result.systemInstruction,
        debugInfo: result.debugInfo,
      };
      const stream = createFortuneSSEStream(
        lifetimeChunkGenerator(),
        streamOptions.insertPayloadBuilder,
        streamOptions.supabase,
        { ...streamOptions.opts, debugPayload },
      );
      return { stream };
    }

    // LIFETIME 운세 (streamOptions 없음: 폴백 비스트리밍)
    if (fortuneType === FortuneType.LIFETIME) {
      return await generateLifetimeFortune(
        chartData,
        apiKey,
        gender,
        birthDate,
        location,
        compatibilityChartData,
        transitChartData,
        aspects,
        transitMoonHouse,
        language,
      );
    }

    // Neo4j 전문 해석 데이터: 데일리 포함 모든 타입에서 조회 (데일리는 프롬프트 내 [Neo4j 리셉션/리젝션] 섹션에 사용)
    const isDayChart = isDayChartFromSun(chartData?.planets ?? null);
    const neo4jContext = getNeo4jContext(
      chartData?.planets ?? null,
      isDayChart,
    );

    // COMPATIBILITY 케이스의 경우 synastryResult와 relationshipType을 전달
    // CONSULTATION 케이스의 경우 category를 전달
    const { prompts: promptMod } = getModules(language ?? "ko");
    const systemInstructionText =
      fortuneType === FortuneType.COMPATIBILITY &&
      compatibilityChartData &&
      synastryResult
        ? promptMod.getSystemInstruction(
            fortuneType,
            chartData as ChartData,
            compatibilityChartData as ChartData,
            synastryResult,
            relationshipType,
          )
        : promptMod.getSystemInstruction(fortuneType, undefined, undefined, undefined, undefined, category);

    const systemInstruction = {
      parts: [
        {
          text: systemInstructionText,
        },
      ],
    };

    let userPrompt = buildUserPrompt(
      chartData,
      fortuneType,
      compatibilityChartData,
      transitChartData,
      aspects,
      transitMoonHouse,
      solarReturnChartData,
      profectionData,
      solarReturnOverlay,
      timeLordRetrogradeAlert,
      lordTransitAspects,
      lordTransitStatus,
      lordStarConjunctionsText,
      transitToTransitAspects,
      dailyFlowAM,
      dailyFlowPM,
      dailyAngleStrikes,
      lordProfectionAngleEntry,
      neo4jContext || null,
      targetDateYmdKst,
      transitMoonNatalPlacement,
      transitLordNatalPlacement,
      language,
    );

    // 데일리 고전 포맷은 이미 프롬프트 내에 Neo4j 포함; 그 외 타입은 여기서 덧붙임
    if (
      !(
        fortuneType === FortuneType.DAILY &&
        dailyFlowAM != null &&
        dailyFlowPM != null &&
        dailyAngleStrikes != null
      ) &&
      neo4jContext
    ) {
      userPrompt = userPrompt + DIGNITY_SECTION_HEADER + neo4jContext;
    }

    if (shortTermPromptSection) {
      userPrompt = userPrompt + "\n\n" + shortTermPromptSection;
    }

    // 해석 지식베이스 주입 (KO 전용): 차트 배치에 맞는 규칙을 룩업해 덧붙임
    if (!(language ?? "ko").toLowerCase().startsWith("en")) {
      const knowledgeContext = buildKnowledgeContext(chartData, fortuneType);
      if (knowledgeContext) {
        userPrompt = userPrompt + "\n\n" + knowledgeContext;
      }
    }

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: userPrompt,
            },
          ],
        },
      ],
      systemInstruction: systemInstruction,
      generationConfig: getGenerationConfig(fortuneType),
    };

    const modelName = getGeminiModel(fortuneType);

    if (streamOptions) {
      const fullPromptSentToGemini =
        "=== System ===\n" +
        systemInstructionText +
        "\n\n=== User ===\n" +
        userPrompt;
      const debugPayload: Record<string, unknown> = {
        chart: chartData,
        userPrompt,
        systemInstruction: systemInstructionText,
        debugInfo: {
          fullPromptSentToGemini,
          neo4jContext: neo4jContext || "(없음)",
        },
      };
      if (compatibilityChartData) debugPayload.chart2 = compatibilityChartData;
      if (synastryResult) debugPayload.synastryResult = synastryResult;
      if (transitChartData) debugPayload.transitChart = transitChartData;
      if (aspects?.length) debugPayload.aspects = aspects;
      if (transitMoonHouse != null) debugPayload.transitMoonHouse = transitMoonHouse;

      // Gemini API 호출 직전 (서버 로그 전용, 한 줄 JSON)
      logGeminiPromptDebug(fortuneType, systemInstructionText, userPrompt);
      const geminiStream = callGeminiAPIStream(
        modelName,
        GEMINI_FALLBACK_MODEL,
        apiKey,
        requestBody,
      );
      const stream = createFortuneSSEStream(
        geminiStream,
        streamOptions.insertPayloadBuilder,
        streamOptions.supabase,
        { ...streamOptions.opts, debugPayload },
      );
      return { stream };
    }

    // Gemini API 호출 직전 (서버 로그 전용, 한 줄 JSON)
    logGeminiPromptDebug(fortuneType, systemInstructionText, userPrompt);
    const apiResponse = await callGeminiAPIWithFallback(
      modelName,
      GEMINI_FALLBACK_MODEL,
      apiKey,
      requestBody,
    );
    const interpretationText = parseGeminiResponse(apiResponse);

    const fullPromptSentToGemini =
      "=== System ===\n" +
      systemInstructionText +
      "\n\n=== User ===\n" +
      userPrompt;

    return {
      success: true,
      fortuneType: fortuneType,
      interpretation: interpretationText,
    };
  } catch (error: any) {
    return {
      success: false,
      error: true,
      message:
        error.message || "Unknown error occurred during AI interpretation.",
      details: error.toString(),
    };
  }
}

/**
 * Lifetime 운세 생성: API를 네 번 병렬 호출하여 결과를 합침
 * - Nature: 성격
 * - Love: 연애
 * - MoneyCareer: 금전 & 커리어
 * - HealthTotal: 건강 & 총평
 */
async function generateLifetimeFortune(
  chartData: any,
  apiKey: string,
  gender?: string,
  birthDate?: string,
  location?: { lat: number; lng: number },
  compatibilityChartData?: any,
  transitChartData?: any,
  aspects?: any[],
  transitMoonHouse?: number,
  language?: string,
): Promise<any> {
  try {
    const isDayChart = isDayChartFromSun(chartData?.planets ?? null);
    const neo4jContext = getNeo4jContext(
      chartData?.planets ?? null,
      isDayChart,
    );

    // 지표성 계산 (Love, Career, Wealth)
    let analysisData = "";

    // 연애/결혼 지표성
    if (gender) {
      const genderCode =
        gender === "F" || gender === "female" || gender === "여자" ? "F" : "M";
      const lotOfMarriage = calculateLotOfMarriage(chartData, genderCode);
      const loveQualities = analyzeLoveQualities(chartData);
      const spouseCandidate = identifySpouseCandidate(chartData, genderCode);

      analysisData += "\n\n## 연애/결혼 지표성\n";
      analysisData += `- Lot of Marriage: ${lotOfMarriage.sign} ${Math.round(lotOfMarriage.longitude)}°\n`;
      analysisData += `- Love Quality Score: ${loveQualities.score} (${loveQualities.statusDescription})\n`;
      analysisData += `- Best Spouse Candidate: ${spouseCandidate.bestSpouseCandidate}\n`;
      analysisData += `- Candidate Scores: ${Object.entries(
        spouseCandidate.scores,
      )
        .filter(([_, score]) => score > 0)
        .map(([planet, score]) => `${planet}(${score})`)
        .join(", ")}\n`;
    }

    // 직업 지표성
    const careerAnalysis = analyzeCareerPotential(chartData);
    const bestCareer =
      careerAnalysis.candidates.length > 0
        ? careerAnalysis.candidates.reduce((a, b) =>
            b.score > a.score ? b : a,
          )
        : null;
    analysisData += "\n## 직업 지표성\n";
    analysisData += `- POF Sign: ${careerAnalysis.pofSign}\n`;
    analysisData += `- Best Candidate: ${bestCareer?.planetName ?? "—"} (${bestCareer?.role ?? "—"}, score ${bestCareer?.score ?? 0})\n`;
    analysisData += `- Candidates: ${careerAnalysis.candidates.map((c) => `${c.planetName}(${c.role})`).join(", ") || "—"}\n`;

    // 금전 지표성
    const wealthAnalysis = analyzeWealthPotential(chartData);
    analysisData += "\n## 금전 지표성\n";
    analysisData += `- Acquisition Sign: ${wealthAnalysis.acquisitionSign}\n`;
    analysisData += `- Ruler: ${wealthAnalysis.ruler.planetName} (score ${wealthAnalysis.ruler.score})\n`;
    analysisData += `- Occupants: ${wealthAnalysis.occupants.map((o) => o.planetName).join(", ") || "—"}\n`;

    // 건강 지표성
    const healthAnalysis = analyzeHealthPotential(chartData);
    analysisData += "\n## 건강 지표성\n";
    analysisData += `- Overall Score: ${healthAnalysis.overallScore}/10\n`;
    analysisData += `- Moon Affliction: ${healthAnalysis.moonHealth.isAfflicted ? "Yes" : "No"}\n`;
    analysisData += `- Mental Health Risk: ${healthAnalysis.mentalHealth.riskLevel}\n`;
    analysisData += `- Physical Health Risk: ${healthAnalysis.physicalHealth.riskLevel}\n`;
    analysisData += `- Congenital Issues: ${healthAnalysis.congenitalIssues.hasRisk ? "Yes" : "No"}${healthAnalysis.congenitalIssues.bodyParts.length > 0 ? ` (취약 부위: ${healthAnalysis.congenitalIssues.bodyParts.join(", ")})` : ""}\n`;
    analysisData += `- Summary: ${healthAnalysis.summary}\n`;

    const { prompts: lifetimePromptMod, formatter: lifetimeFormatterMod } = getModules(language ?? "ko");
    const natureSystemText = lifetimePromptMod.getLifetimePrompt_Nature();
    const loveSystemText = lifetimePromptMod.getLifetimePrompt_Love();
    const moneyCareerSystemText = lifetimePromptMod.getLifetimePrompt_MoneyCareer();
    const healthTotalSystemText = lifetimePromptMod.getLifetimePrompt_HealthTotal();

    let userPrompt = buildUserPrompt(
      chartData,
      FortuneType.LIFETIME,
      compatibilityChartData,
      transitChartData,
      aspects,
      transitMoonHouse,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, // targetDateYmdKst
      undefined, // transitMoonNatalPlacement
      undefined, // transitLordNatalPlacement
      language,
    );

    // 지표성 데이터 추가
    userPrompt += analysisData;

    // 네이탈 항성 회합 분석 (세차 보정, Identity/Career/Love/Roots/Health)
    const natalFixedStars = analyzeNatalFixedStars(
      chartData,
      birthDate ?? chartData.date,
    );
    const fixedStarNature = formatNatalFixedStarsForPrompt(natalFixedStars, {
      themes: ["Identity", "Roots"],
      includeHealth: false,
    });
    const fixedStarLove = formatNatalFixedStarsForPrompt(natalFixedStars, {
      themes: ["Love"],
      includeHealth: false,
    });
    const fixedStarCareer = formatNatalFixedStarsForPrompt(natalFixedStars, {
      themes: ["Career"],
      includeHealth: false,
    });
    const fixedStarHealth = formatNatalFixedStarsForPrompt(natalFixedStars, {
      themes: ["Health"],
      includeHealth: true,
    });

    let userPromptBase = neo4jContext
      ? userPrompt + DIGNITY_SECTION_HEADER + neo4jContext
      : userPrompt;

    // 해석 지식베이스 주입 (KO 전용): 종합운은 성격·연애·직업·재물·건강 규칙을 폭넓게 덧붙임
    if (!(language ?? "ko").toLowerCase().startsWith("en")) {
      const knowledgeContext = buildKnowledgeContext(
        chartData,
        FortuneType.LIFETIME,
      );
      if (knowledgeContext) {
        userPromptBase = userPromptBase + "\n\n" + knowledgeContext;
      }
    }

    // Nature 요청 본문 (Identity + Roots 항성)
    const requestBodyNature = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                userPromptBase +
                (natalFixedStars.length > 0 ? "\n\n" + fixedStarNature : ""),
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: natureSystemText,
          },
        ],
      },
      generationConfig: {
        temperature: 0.9,
        topK: 50,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // Love 요청 본문 (Love 항성)
    const requestBodyLove = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                userPromptBase +
                (natalFixedStars.length > 0 ? "\n\n" + fixedStarLove : ""),
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: loveSystemText,
          },
        ],
      },
      generationConfig: {
        temperature: 0.9,
        topK: 50,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // MoneyCareer 요청 본문 (Career 항성)
    const requestBodyMoneyCareer = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                userPromptBase +
                (natalFixedStars.length > 0 ? "\n\n" + fixedStarCareer : ""),
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: moneyCareerSystemText,
          },
        ],
      },
      generationConfig: {
        temperature: 0.9,
        topK: 50,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // HealthTotal 요청 본문 (Health 항성: 6/8/12 로드 + 흉성)
    const requestBodyHealthTotal = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                userPromptBase +
                (natalFixedStars.length > 0 ? "\n\n" + fixedStarHealth : ""),
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: healthTotalSystemText,
          },
        ],
      },
      generationConfig: {
        temperature: 0.9,
        topK: 50,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // Lifetime 운세는 flash 모델 사용
    const modelName = getGeminiModel(FortuneType.LIFETIME);

    // Gemini API 호출 직전 (서버 로그 전용, 한 줄 JSON)
    logGeminiPromptDebug(
      FortuneType.LIFETIME,
      `${natureSystemText}\n\n${loveSystemText}\n\n${moneyCareerSystemText}\n\n${healthTotalSystemText}`,
      userPrompt,
    );

    // 병렬 호출로 속도 최적화 (4배 빠름!)
    const [resultNature, resultLove, resultMoneyCareer, resultHealthTotal] =
      await Promise.all([
        callGeminiAPIWithFallback(
          modelName,
          GEMINI_FALLBACK_MODEL,
          apiKey,
          requestBodyNature,
        ),
        callGeminiAPIWithFallback(
          modelName,
          GEMINI_FALLBACK_MODEL,
          apiKey,
          requestBodyLove,
        ),
        callGeminiAPIWithFallback(
          modelName,
          GEMINI_FALLBACK_MODEL,
          apiKey,
          requestBodyMoneyCareer,
        ),
        callGeminiAPIWithFallback(
          modelName,
          GEMINI_FALLBACK_MODEL,
          apiKey,
          requestBodyHealthTotal,
        ),
      ]);

    // 결과 파싱
    const interpretationNature = parseGeminiResponse(resultNature);
    const interpretationLove = parseGeminiResponse(resultLove);
    const interpretationMoneyCareer = parseGeminiResponse(resultMoneyCareer);
    const interpretationHealthTotal = parseGeminiResponse(resultHealthTotal);

    // 결과 합치기 (줄바꿈만 사용, 구분선 없음)
    const combinedInterpretation = `${interpretationNature}\n\n${interpretationLove}\n\n${interpretationMoneyCareer}\n\n${interpretationHealthTotal}`;

    const fullPromptSentToGemini =
      "=== System (Nature) ===\n" +
      natureSystemText +
      "\n\n=== User ===\n" +
      userPrompt;

    return {
      success: true,
      fortuneType: FortuneType.LIFETIME,
      interpretation: combinedInterpretation,
    };
  } catch (error: any) {
    console.error("❌ Lifetime 운세 생성 중 에러:", error);
    return {
      success: false,
      error: true,
      message:
        error.message ||
        "Unknown error occurred during Lifetime fortune generation.",
      details: error.toString(),
    };
  }
}

/** 차감 시 사용한 description으로 환불 재화 타입 추론 (프론트 getCurrencyTypeFromDescription와 동일) */
function getRefundTypeFromDescription(description: string): "PAID" | "BONUS" | "PROBE" {
  if (!description || typeof description !== "string") return "PAID";
  const d = description;
  if (d.includes("데일리") || d.includes("오늘 운세")) return "BONUS";
  if (d.includes("종합운세") || d.includes("종합 운세") || d.includes("탐사선")) return "PROBE";
  return "PAID";
}

/**
 * 운세 생성 실패 시 차감된 운세권을 서비스 롤 키로 자동 환불.
 * - 서비스 롤 클라이언트를 별도 생성해 RLS 영향 없이 refund_stars 실행
 * - 해당 CONSUME 트랜잭션을 FAILED로 마킹해 중복 환불(크론 롤백 등) 방지
 * 비스트리밍 경로(AI 해석 에러객체 반환 / 최상단 catch)에서 공통 사용.
 */
async function autoRefundConsumed(params: {
  authUserId: string | null;
  consumeAmount: number;
  consumeDescription: string;
  consumeTransactionId: string | null;
  reason: string;
}): Promise<void> {
  const { authUserId, consumeAmount, consumeDescription, consumeTransactionId, reason } =
    params;
  if (!authUserId || !(consumeAmount > 0)) return;
  try {
    const refundUrl = Deno.env.get("SUPABASE_URL");
    const refundKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!refundUrl || !refundKey) {
      console.error("❌ 환불 불가: SUPABASE_URL/SERVICE_ROLE_KEY 미설정");
      return;
    }
    const supabaseRefund = createClient(refundUrl, refundKey);
    const refundType = getRefundTypeFromDescription(consumeDescription);
    await supabaseRefund.rpc("refund_stars", {
      p_user_id: authUserId,
      p_amount: consumeAmount,
      p_description: reason,
      p_refund_type: refundType,
    });
    if (consumeTransactionId) {
      await supabaseRefund
        .from("star_transactions")
        .update({ consume_status: "FAILED" })
        .eq("id", consumeTransactionId)
        .eq("type", "CONSUME");
    }
    console.log("✅ 차감분 자동 환불 완료:", { authUserId, consumeAmount, refundType, reason });
  } catch (refundErr) {
    console.error("❌ refund_stars 롤백 실패:", refundErr);
  }
}

// ========== 메인 핸들러 ==========
serve(async (req) => {
  // CORS Preflight 처리
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let consumed = false;
  let consumeAmount = 0;
  let consumeDescription = "";
  let consumeTransactionId: string | null = null;
  let authUserId: string | null = null;

  try {
    // Supabase 클라이언트 초기화
    // Supabase Edge Functions는 자동으로 다음 환경 변수를 제공:
    // - SUPABASE_URL
    // - SUPABASE_ANON_KEY
    // - SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Supabase 환경 변수가 설정되지 않았습니다.");
      console.error("SUPABASE_URL:", supabaseUrl ? "설정됨" : "누락");
      console.error(
        "SUPABASE_SERVICE_ROLE_KEY:",
        supabaseServiceKey ? "설정됨" : "누락",
      );
      return new Response(
        JSON.stringify({
          error: "서버 설정 오류: Supabase 환경 변수가 필요합니다.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // URL 파싱
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      // 상대 경로인 경우 절대 URL로 변환
      const baseUrl = supabaseUrl.replace(/\/rest\/v1$/, "");
      url = new URL(req.url, baseUrl);
    }
    const id = url.searchParams.get("id");

    // [수정 포인트] ID가 있고 GET 요청이면 -> 인증 건너뛰기
    if (req.method === "GET" && id) {
      // [수정] 공유 운세 조회용 Admin 클라이언트 (세션 감지 차단 및 헤더 강제 설정)
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            // 들어오는 요청의 토큰을 무시하고 Service Key로 덮어씌움
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        },
      });

      // DB 조회 및 반환 로직 (Auth 검사 없이 진행, 복구용 chart_data 포함)
      const { data, error } = await supabaseAdmin
        .from("fortune_results")
        .select("fortune_text, user_info, fortune_type, created_at, chart_data")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("❌ 운세 조회 실패:", error);
        return new Response(
          JSON.stringify({ error: "운세를 찾을 수 없습니다." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const fortuneType = data.fortune_type || "daily";
      const payload: any = {
        success: true,
        interpretation: data.fortune_text,
        userInfo: data.user_info,
        fortuneType,
        createdAt: data.created_at,
        isShared: true,
      };

      // consultation 공유 시: 부모 1건 조회 후, parent_result_id = id 인 자식(후속 질문) 전부 조회 → followUps로 반환
      if (fortuneType === "consultation") {
        const { data: childRows, error: childError } = await supabaseAdmin
          .from("fortune_results")
          .select("fortune_text, user_info")
          .eq("parent_result_id", id)
          .order("created_at", { ascending: true });

        if (childError) {
          console.error("❌ 후속 질문(자식) 조회 실패:", childError);
        }

        const children = childRows ?? [];
        const followUps: { question: string; interpretation: string }[] = children.map((row) => {
          const userInfo = (row?.user_info ?? {}) as { userQuestion?: string };
          const question =
            (userInfo.userQuestion && String(userInfo.userQuestion).trim()) || "(질문 없음)";
          const interpretation = row?.fortune_text != null ? String(row.fortune_text) : "";
          return { question, interpretation };
        });

        payload.followUps = followUps;
      }

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 그 외 요청(운세 생성 POST)은 여기서부터 인증 검사 시작
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized: Authorization header가 필요합니다.",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // POST 요청만 허용 (운세 생성)
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 [보안 강화] 실제 유저 토큰 검증
    // Authorization 헤더에서 토큰 추출 (Bearer 제거)
    const token = authHeader.replace("Bearer ", "");

    // 해당 토큰으로 Supabase 클라이언트 생성 (유저 검증용)
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // 실제 유저 정보 검증
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      console.error("❌ 유저 토큰 검증 실패:", authError);
      return new Response(
        JSON.stringify({
          error: "Unauthorized: 유효한 사용자 인증이 필요합니다.",
          details: authError?.message || "Invalid user token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    authUserId = user.id;

    // Supabase Admin 클라이언트 생성 (DB 저장용)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 요청 본문 파싱
    const requestData = await req.json();

    // language 파라미터 추출 ('ko' 기본값, 'en' 지원)
    const requestLanguage: string =
      typeof requestData.language === "string" && requestData.language.toLowerCase().startsWith("en")
        ? "en"
        : "ko";

    // 클라이언트 디바이스 타임존 오프셋 (분 단위, JS getTimezoneOffset() 값)
    // 양수 = UTC 서쪽 (예: EST +300), 음수 = UTC 동쪽 (예: KST -540)
    // 기본값 -540 (KST 하위 호환)
    const timezoneOffset: number =
      typeof (requestData as any).timezoneOffset === "number"
        ? (requestData as any).timezoneOffset
        : -540;

    // DAILY(지정일 운세)용 targetDate 파싱 (없으면 클라이언트 로컬 오늘)
    let targetDateYmdKst: string;
    try {
      targetDateYmdKst = resolveTargetDateYmd((requestData as any)?.targetDate, timezoneOffset);
    } catch (e: any) {
      return new Response(
        JSON.stringify({
          error: e?.message ?? "Invalid targetDate",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // reportType을 fortuneType으로 매핑 (하위 호환성 유지)
    let fortuneType: FortuneType;
    if (requestData.fortuneType) {
      fortuneType = requestData.fortuneType as FortuneType;
    } else if (requestData.reportType) {
      // 기존 reportType을 FortuneType으로 변환
      const reportTypeMap: Record<string, FortuneType> = {
        daily: FortuneType.DAILY,
        lifetime: FortuneType.LIFETIME,
        compatibility: FortuneType.COMPATIBILITY,
        consultation: FortuneType.CONSULTATION,
      };
      fortuneType = reportTypeMap[requestData.reportType] || FortuneType.DAILY;
    } else {
      fortuneType = FortuneType.DAILY;
    }

    // DAILY 제한(프로필당 targetDate 1회): 기존 "하루 1회" → "동일 targetDate 1회"
    // 프론트에서 복구/제한을 하더라도, 백엔드에서 중복 생성은 방지한다.
    if (fortuneType === FortuneType.DAILY && requestData.profileId) {
      try {
        const { data: existingHistory, error: historyErr } = await supabase
          .from("fortune_history")
          .select("id, result_id")
          .eq("profile_id", requestData.profileId)
          .eq("fortune_type", FortuneType.DAILY)
          .eq("fortune_date", targetDateYmdKst)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (historyErr) {
          console.warn("⚠️ DAILY fortune_history 조회 실패 (무시하고 진행):", historyErr);
        } else if (existingHistory?.result_id) {
          return new Response(
            JSON.stringify({
              error:
                "이미 해당 프로필로 이 targetDate의 데일리 운세를 생성/조회했습니다.",
              result_id: existingHistory.result_id,
              targetDate: targetDateYmdKst,
              fortuneType: FortuneType.DAILY,
            }),
            {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      } catch (e) {
        console.warn("⚠️ DAILY 중복 제한 체크 실패 (무시하고 진행):", e);
      }
    }

    // ========== 운세권 차감 (스트리밍 전 서버에서 선차감, 실패 시 롤백) ==========
    const cost = Number(requestData?.cost) || 0;
    const description = typeof requestData?.description === "string" ? requestData.description.trim() : "";
    if (cost > 0 && description) {
      const { data: consumeResult, error: consumeError } = await supabase.rpc("consume_stars", {
        p_user_id: user.id,
        p_amount: cost,
        p_description: description,
      });
      if (consumeError) {
        console.error("❌ consume_stars RPC 오류:", consumeError);
        return new Response(
          JSON.stringify({
            error: consumeError.message || "운세권 차감에 실패했습니다.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (consumeResult && !(consumeResult as { success?: boolean }).success) {
        const msg = (consumeResult as { message?: string }).message || "운세권이 부족합니다.";
        return new Response(
          JSON.stringify({ error: msg }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      consumed = true;
      consumeAmount = cost;
      consumeDescription = description;
      const txId = (consumeResult as { transactionId?: string })?.transactionId;
      if (txId) consumeTransactionId = txId;
    }

    // ========== CONSULTATION 처리 (싱글턴 자유 질문) ==========
    if (fortuneType === FortuneType.CONSULTATION) {
      const { userQuestion, consultationTopic, birthDate, lat, lng } =
        requestData;

      // 필수 필드 검증
      if (
        !userQuestion ||
        typeof userQuestion !== "string" ||
        userQuestion.trim() === ""
      ) {
        return new Response(
          JSON.stringify({
            error: "userQuestion is required and must be a non-empty string",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (!birthDate || typeof lat !== "number" || typeof lng !== "number") {
        return new Response(
          JSON.stringify({ error: "birthDate, lat, lng are required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 생년월일 Date 변환 (출생지 로컬 시각 → UTC)
      const consultTzOpts = {
        lat: lat as number,
        lng: lng as number,
        timezone: (requestData as { timezone?: string }).timezone,
      };
      let birthDateTime: Date;
      try {
        const dateMatch = birthDate.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
        );
        if (!dateMatch) {
          throw new Error("Invalid date format");
        }
        const [_, year, month, day, hour, minute, second] = dateMatch;
        // 출생일 정오를 기준으로 출생지 타임존 오프셋 조회 (DST 안전)
        const noonApprox = new Date(Date.UTC(
          parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0,
        ));
        const birthCityOffsetHours = await resolveTimezoneOffsetHours(consultTzOpts, noonApprox);
        // UTC = Local - offsetHours * 3600000
        const localAsUtcTimestamp = Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second),
        );
        birthDateTime = new Date(localAsUtcTimestamp - birthCityOffsetHours * 60 * 60 * 1000);
        if (isNaN(birthDateTime.getTime()) || !Number.isFinite(birthDateTime.getTime())) {
          throw new Error("Invalid date");
        }
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Invalid birthDate format. Use YYYY-MM-DDTHH:mm:ss",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      assertValidDate(birthDateTime, "CONSULTATION Natal");

      // 만 나이 계산
      const now = new Date();
      let age = now.getUTCFullYear() - birthDateTime.getUTCFullYear();
      const bMonth = birthDateTime.getUTCMonth();
      const bDay = birthDateTime.getUTCDate();
      const nMonth = now.getUTCMonth();
      const nDay = now.getUTCDate();
      if (nMonth < bMonth || (nMonth === bMonth && nDay < bDay)) {
        age -= 1;
      }
      age = Math.max(0, age);

      const consultationTzOpts = {
        lat,
        lng,
        timezone: (requestData as { timezone?: string }).timezone,
      };

      // 1. Natal 차트 (출생 시점 기준 오프셋)
      const natalTzOffsetConsult = await resolveTimezoneOffsetHours(
        consultationTzOpts,
        birthDateTime,
      );
      let chartData;
      try {
        chartData = await calculateChart(birthDateTime, { lat, lng }, natalTzOffsetConsult);
      } catch (chartError: any) {
        console.error("❌ [CONSULTATION] 차트 계산 실패:", chartError);
        return new Response(
          JSON.stringify({
            error: `Chart calculation failed: ${chartError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Neo4j 상담 컨텍스트: 주간/월간 운세에서는 Gemini 인풋에 넣지 않음
      const topic = (requestData.consultationTopic || "GENERAL").toUpperCase();
      const skipNeo4jForConsultation =
        topic === "WEEKLY" || topic === "MONTHLY";
      const graphKnowledgePromise = skipNeo4jForConsultation
        ? Promise.resolve("")
        : Promise.resolve(
            fetchConsultationContext(
              requestData.consultationTopic || "GENERAL",
              chartData,
            ),
          );

      // 2. Firdaria
      const firdariaResult = calculateFirdaria(
        birthDateTime,
        { lat, lng },
        now,
      );

      // 3. Interaction (노드 기간이면 null)
      const isNode =
        firdariaResult.majorLord === "NorthNode" ||
        firdariaResult.majorLord === "SouthNode";
      const interactionResult =
        !isNode && firdariaResult.subLord
          ? analyzeLordInteraction(
              chartData,
              firdariaResult.majorLord,
              firdariaResult.subLord,
            )
          : null;

      // 4. Progression
      const progressionResult = calculateSecondaryProgression(chartData, age);

      // 5. Direction (Primary Directions, Placidus/Naibod — next 10 years only)
      const directionResult = calculatePrimaryDirections(
        chartData,
        age,
        birthDateTime,
      );

      const graphKnowledge = await graphKnowledgePromise;

      // 5a. Profection (모든 카테고리 공통)
      const natalAscSign = getSignFromLongitude(
        chartData.houses?.angles?.ascendant ?? 0,
      ).sign;
      const profectionData = calculateProfection(
        birthDateTime,
        now,
        natalAscSign,
        false,
      );

      // 5a-2. 10년 타임라인: Progression & Profection
      const progressionTimeline = calculateProgressedEventsTimeline(
        chartData,
        age,
        10,
      );
      const profectionTimeline = calculateProfectionTimeline(
        chartData,
        age,
        10,
      );

      // 5a-3. Solar Return 차트 및 Overlay 계산 (자유 상담소 추운용)
      let solarReturnChartData: ChartData | undefined;
      let solarReturnOverlay: any | undefined;
      try {
        const solarReturnYear = getActiveSolarReturnYear(birthDateTime, now);
        const natalSunLongitude = chartData.planets.sun.degree;
        const solarReturnDateTime = calculateSolarReturnDateTime(
          birthDateTime,
          solarReturnYear,
          natalSunLongitude,
        );
        const srTzOffsetConsult = await resolveTimezoneOffsetHours(
          consultationTzOpts,
          solarReturnDateTime,
        );
        solarReturnChartData = await calculateChart(
          solarReturnDateTime,
          { lat, lng },
          srTzOffsetConsult,
        );
        solarReturnOverlay = getSolarReturnOverlays(
          chartData,
          solarReturnChartData,
        );
      } catch (srErr: any) {
        console.warn(
          "⚠️ [CONSULTATION] Solar Return 계산 실패 (무시하고 진행):",
          srErr,
        );
      }

      // 5b. CONSULTATION: 현재 트랜짓 차트 (현재 시점 기준 오프셋)
      let consultationTransitChart: ChartData | undefined;
      try {
        const transitTzOffset = await resolveTimezoneOffsetHours(
          consultationTzOpts,
          now,
        );
        consultationTransitChart = await calculateChart(
          now,
          { lat, lng },
          transitTzOffset,
        );
      } catch (_) {
        // 무시
      }

      // 5c. Career/Wealth/Love 분석 (consultationTopic에 따라)
      const consultationTopicUpper = (requestData.consultationTopic || "")
        .trim()
        .toUpperCase();
      const careerAnalysis =
        consultationTopicUpper === "WORK"
          ? analyzeCareerPotential(chartData)
          : null;
      const wealthAnalysis =
        consultationTopicUpper === "MONEY"
          ? analyzeWealthPotential(chartData)
          : null;

      let loveAnalysis: {
        lotOfMarriage: { sign: string; longitude: number };
        loveQualities: ReturnType<typeof analyzeLoveQualities>;
        spouseCandidate: ReturnType<typeof identifySpouseCandidate>;
        loveTiming: ReturnType<typeof analyzeLoveTiming>;
        profectionSign: string;
      } | null = null;
      if (consultationTopicUpper === "LOVE") {
        const gender =
          requestData.gender === "F" ||
          requestData.gender === "female" ||
          requestData.gender === "여자"
            ? "F"
            : "M";
        const lotOfMarriage = calculateLotOfMarriage(chartData, gender);
        const loveQualities = analyzeLoveQualities(chartData);
        const spouseCandidate = identifySpouseCandidate(chartData, gender);
        const loveTiming = analyzeLoveTiming(
          chartData,
          age,
          spouseCandidate.bestSpouseCandidate,
          gender,
          {
            firdariaResult,
            progressionResult,
            directionHits: directionResult,
          },
        );
        loveAnalysis = {
          lotOfMarriage,
          loveQualities,
          spouseCandidate,
          loveTiming,
          profectionSign: profectionData.profectionSign,
        };
      }

      // 6. Prediction Prompt 생성 (내담자 기본 정보 + Natal Chart + Analysis Data + TIMING DATA 10년 + graphKnowledge)
      const { formatter: consultFormatter, prompts: consultPrompts } = getModules(requestLanguage);
      let systemContext = consultFormatter.generatePredictionPrompt(
        chartData,
        requestData.birthDate,
        { lat: requestData.lat, lng: requestData.lng },
        firdariaResult,
        interactionResult,
        progressionResult,
        directionResult,
        graphKnowledge,
        careerAnalysis,
        wealthAnalysis,
        loveAnalysis,
        requestData.consultationTopic || "OTHER",
        profectionData,
        progressionTimeline,
        profectionTimeline,
        solarReturnChartData,
        solarReturnOverlay,
        consultationTransitChart,
      );

      // 6a. CONSULTATION: 향후 6개월 단기 이벤트 스캔 (타임로드 역행·항성·역행/정지) → 프롬프트에 주입
      try {
        const scanResult = scanShortTermEvents(chartData, now, 6);
        const shortTermSection = formatShortTermEventsForPrompt(scanResult);
        systemContext = systemContext + "\n\n" + shortTermSection;
      } catch (scanErr: any) {
        console.warn(
          "⚠️ [CONSULTATION] 단기 이벤트 스캔 실패 (무시하고 진행):",
          scanErr,
        );
      }

      // 6b. CONSULTATION: 연주 트랜짓 각도·섹트·역행 + 연주–항성 회합
      // 주간/월간/연간에 따라 기간별 트랜짓 스캔 + 프로펙션/솔라리턴 전환 시점 계산
      try {
        const lordName = profectionData.lordOfTheYear;
        const lordKey = getLordKeyFromName(lordName);
        const topicUpper = topic.toUpperCase();

        // 기간 판단
        let scanDays = 0;
        let periodLabel = "";
        if (topicUpper === "WEEKLY") {
          scanDays = 7;
          periodLabel = "주간";
        } else if (topicUpper === "MONTHLY") {
          scanDays = 30;
          periodLabel = "월간";
        } else if (topicUpper === "YEARLY") {
          scanDays = 365;
          periodLabel = "연간";
        }

        // 월간/연간 운세: 생일 기준 프로펙션·솔라리턴 전환 시점 계산
        if (
          (topicUpper === "MONTHLY" || topicUpper === "YEARLY") &&
          scanDays > 0
        ) {
          const endDate = new Date(now);
          endDate.setDate(endDate.getDate() + scanDays);

          const birthMonth = birthDateTime.getUTCMonth();
          const birthDay = birthDateTime.getUTCDate();

          // 현재~종료 사이에 생일이 있는지 확인
          const currentBirthday = new Date(
            Date.UTC(now.getUTCFullYear(), birthMonth, birthDay),
          );
          const nextBirthday = new Date(
            Date.UTC(now.getUTCFullYear() + 1, birthMonth, birthDay),
          );

          let upcomingBirthday: Date | null = null;
          if (currentBirthday >= now && currentBirthday <= endDate) {
            upcomingBirthday = currentBirthday;
          } else if (nextBirthday >= now && nextBirthday <= endDate) {
            upcomingBirthday = nextBirthday;
          }

          if (upcomingBirthday) {
            // 생일 전: 현재 프로펙션·솔라리턴
            // 생일 후: 다음 프로펙션·솔라리턴
            const beforeBirthdayDays = Math.floor(
              (upcomingBirthday.getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            const afterBirthdayDays = scanDays - beforeBirthdayDays;

            // 현재 프로펙션·솔라리턴 (생일 전 기간)
            const currentProfection = profectionData;
            const currentSolarReturnYear = getActiveSolarReturnYear(
              birthDateTime,
              now,
            );
            const currentSRDateTime = calculateSolarReturnDateTime(
              birthDateTime,
              currentSolarReturnYear,
              chartData.planets.sun.degree,
            );
            let currentSRChart: ChartData | undefined;
            try {
              const currentSRTzOffset = await resolveTimezoneOffsetHours(
                consultationTzOpts,
                currentSRDateTime,
              );
              currentSRChart = await calculateChart(
                currentSRDateTime,
                { lat, lng },
                currentSRTzOffset,
              );
            } catch (_) {}

            // 다음 프로펙션·솔라리턴 (생일 후 기간)
            const afterBirthday = new Date(upcomingBirthday);
            afterBirthday.setDate(afterBirthday.getDate() + 1);
            const nextProfection = calculateProfection(
              birthDateTime,
              afterBirthday,
              getSignFromLongitude(chartData.houses.angles.ascendant).sign,
              false,
            );
            const nextSolarReturnYear = getActiveSolarReturnYear(
              birthDateTime,
              afterBirthday,
            );
            const nextSRDateTime = calculateSolarReturnDateTime(
              birthDateTime,
              nextSolarReturnYear,
              chartData.planets.sun.degree,
            );
            let nextSRChart: ChartData | undefined;
            try {
              const nextSRTzOffset = await resolveTimezoneOffsetHours(
                consultationTzOpts,
                nextSRDateTime,
              );
              nextSRChart = await calculateChart(
                nextSRDateTime,
                { lat, lng },
                nextSRTzOffset,
              );
            } catch (_) {}

            // 생일 전/후 각 솔라리턴의 Overlay + 차트 내 각도 계산 (행성 위치·각도까지 프롬프트에 포함)
            let currentSROverlay: Awaited<
              ReturnType<typeof getSolarReturnOverlays>
            > | null = null;
            let nextSROverlay: Awaited<
              ReturnType<typeof getSolarReturnOverlays>
            > | null = null;
            if (currentSRChart) {
              try {
                currentSROverlay = getSolarReturnOverlays(
                  chartData,
                  currentSRChart,
                );
              } catch (_) {}
            }
            if (nextSRChart) {
              try {
                nextSROverlay = getSolarReturnOverlays(chartData, nextSRChart);
              } catch (_) {}
            }
            const currentSRAspects = currentSRChart
              ? calculateAspects(currentSRChart, currentSRChart)
              : [];
            const nextSRAspects = nextSRChart
              ? calculateAspects(nextSRChart, nextSRChart)
              : [];

            // 프롬프트에 추가 (프로펙션·연주 + 솔라리턴 전체: 행성 위치, Overlay, SR 내 각도)
            const beforeBlock =
              currentSRChart != null
                ? consultFormatter.formatSolarReturnBlockForPrompt(
                    currentSRChart,
                    currentSROverlay ?? undefined,
                    currentSRAspects.length > 0 ? currentSRAspects : undefined,
                    requestLanguage === "en" ? "Before Birthday" : "생일 전",
                  )
                : "";
            const afterBlock =
              nextSRChart != null
                ? consultFormatter.formatSolarReturnBlockForPrompt(
                    nextSRChart,
                    nextSROverlay ?? undefined,
                    nextSRAspects.length > 0 ? nextSRAspects : undefined,
                    requestLanguage === "en" ? "After Birthday" : "생일 후",
                  )
                : "";

            const transitionSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[${periodLabel} 운세: 프로펙션·솔라리턴 전환 시점 분석]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${periodLabel} 기간 중 ${upcomingBirthday.toISOString().split("T")[0]}에 생일을 맞이합니다.
이는 프로펙션과 솔라 리턴이 전환되는 시점으로, 운세 해석 시 반드시 두 시기로 나눠 분석해야 합니다.

**생일 전 (${now.toISOString().split("T")[0]} ~ ${upcomingBirthday.toISOString().split("T")[0]}, 약 ${beforeBirthdayDays}일):**
- 프로펙션 하우스: ${currentProfection.profectionHouse}번째 하우스
- 프로펙션 별자리: ${currentProfection.profectionSign}
- 연주 (Lord of the Year): ${currentProfection.lordOfTheYear}
${beforeBlock ? "\n" + beforeBlock : ""}

**생일 후 (${upcomingBirthday.toISOString().split("T")[0]} ~ ${endDate.toISOString().split("T")[0]}, 약 ${afterBirthdayDays}일):**
- 프로펙션 하우스: ${nextProfection.profectionHouse}번째 하우스
- 프로펙션 별자리: ${nextProfection.profectionSign}
- 연주 (Lord of the Year): ${nextProfection.lordOfTheYear}
${afterBlock ? "\n" + afterBlock : ""}

💡 해석 가이드: 생일을 기점으로 인생의 흐름이 완전히 바뀝니다. 생일 전에는 현재 연주(${currentProfection.lordOfTheYear})가, 생일 후에는 새로운 연주(${nextProfection.lordOfTheYear})가 주도권을 갖습니다. 각 시기별 솔라 리턴 차트(행성 위치·Overlay·SR 내 각도)를 반드시 참고하여 timeline과 analysis에 반영하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            systemContext = systemContext + "\n\n" + transitionSection;
          } else {
            // 생일이 기간 내에 없으면 단일 프로펙션·솔라리턴만 표시
            const singlePeriodSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[${periodLabel} 운세: 기간 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
분석 기간: ${now.toISOString().split("T")[0]} ~ ${endDate.toISOString().split("T")[0]} (${scanDays}일)
이 기간 동안 프로펙션 전환은 없으며, 단일 연주(${profectionData.lordOfTheYear})가 전체 기간을 관장합니다.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            systemContext = systemContext + "\n\n" + singlePeriodSection;
          }
        }

        // 주간/월간/연간 기간별 트랜짓 스캔 (중간 시점 샘플링)
        if (scanDays > 0 && consultationTransitChart && lordName) {
          const sampleDates: Date[] = [];
          const interval = scanDays <= 7 ? 1 : scanDays <= 30 ? 7 : 30;
          for (let i = 0; i <= scanDays; i += interval) {
            const sampleDate = new Date(now);
            sampleDate.setDate(sampleDate.getDate() + i);
            sampleDates.push(sampleDate);
          }

          const transitSummary: string[] = [];
          transitSummary.push(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[${periodLabel} 기간 연주 트랜짓 변화 추이]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${periodLabel} 기간(${scanDays}일) 동안 연주 행성의 트랜짓 상태 변화:`);

          for (const sampleDate of sampleDates) {
            try {
              const sampleTzOffset = await resolveTimezoneOffsetHours(
                consultationTzOpts,
                sampleDate,
              );
              const sampleTransitChart = await calculateChart(
                sampleDate,
                { lat, lng },
                sampleTzOffset,
              );
              const sampleAspects = calculateLordOfYearTransitAspects(
                sampleTransitChart,
                lordName,
              );
              const sampleStatus = getLordOfYearTransitStatus(
                sampleTransitChart,
                lordName,
              );

              const dateStr = sampleDate.toISOString().split("T")[0];
              transitSummary.push(
                `\n[${dateStr}] 역행: ${sampleStatus.isRetrograde ? "O" : "X"}, 각도: ${sampleAspects.length}개`,
              );
              if (sampleAspects.length > 0 && sampleAspects.length <= 3) {
                sampleAspects.forEach((a) => {
                  transitSummary.push(`  - ${a.description}`);
                });
              }
            } catch (_) {}
          }

          transitSummary.push(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          systemContext = systemContext + "\n\n" + transitSummary.join("\n");
        } else {
          // 단일 시점 트랜짓 (기존 로직)
          if (consultationTransitChart && lordName) {
            const lordTransitAspects = calculateLordOfYearTransitAspects(
              consultationTransitChart,
              lordName,
            );
            const lordTransitStatus = getLordOfYearTransitStatus(
              consultationTransitChart,
              lordName,
            );
            const lordTransitSection = consultFormatter.formatLordOfYearTransitSectionForPrompt(
              lordTransitStatus,
              lordTransitAspects,
            );
            if (lordTransitSection) {
              systemContext = systemContext + "\n\n" + lordTransitSection;
            }
          }
        }

        // 연주–항성 회합 (현재 시점, 세차 적용)
        if (lordKey) {
          const { longitude: lordLon, speed: lordSpeed } =
            getPlanetLongitudeAndSpeed(lordKey, now);
          const lordStarConjunctions = getLordOfYearFixedStarConjunctions(
            lordLon,
            lordSpeed,
            lordName,
            now.getFullYear(),
          );
          const lordStarSection = formatLordStarConjunctionsForPrompt(
            lordName,
            lordStarConjunctions,
          );
          systemContext = systemContext + "\n\n" + lordStarSection;
        }
      } catch (starErr: any) {
        console.warn(
          "⚠️ [CONSULTATION] 연주 트랜짓/항성 계산 실패 (무시):",
          starErr?.message,
        );
      }

      // 7. Gemini 호출
      const apiKey = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Vertex 서비스 계정(GCP_SERVICE_ACCOUNT_JSON)이 설정되지 않았습니다" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 후속 질문 여부를 먼저 판단 (시스템 프롬프트 선택에 사용)
      const previousConversation = requestData.previousConversation as
        | Array<{ question: string; interpretation: string }>
        | undefined;
      const hasPreviousContext =
        Array.isArray(previousConversation) &&
        previousConversation.length > 0 &&
        previousConversation.every(
          (x) =>
            typeof x?.question === "string" &&
            typeof x?.interpretation === "string",
        );

      let contextBlock = "";
      if (hasPreviousContext) {
        const lines = previousConversation!.map(
          (pair, i) =>
            `[이전 질문 ${i + 1}]: ${pair.question.trim()}\n[점성술사 답변 ${i + 1}]:\n${pair.interpretation.trim()}`,
        );
        contextBlock = `[이전 대화 맥락 (동일 주제에 대한 선행 질문과 답변입니다. 이 맥락을 유지한 채 후속 질문에만 답하세요.)]\n${lines.join("\n\n")}\n\n`;
      }

      // 첫 질문과 동일한 카테고리별 해석·추운 규칙을 항상 포함
      let consultationSystemText = consultPrompts.getConsultationSystemPrompt(
        requestData.consultationTopic || "General",
      );
      // 후속 질문일 때: 위 규칙 위에 후속 전용 스키마·액션 지침 추가
      if (hasPreviousContext) {
        consultationSystemText =
          consultationSystemText +
          "\n\n" +
          consultPrompts.getConsultationFollowUpSystemPrompt(
            requestData.consultationTopic || "General",
          );
      }
      // 월간/연간 운세 카테고리 선택 시: 솔라리턴 해석 방법 가이드 추가
      const topicUpper = (requestData.consultationTopic || "")
        .trim()
        .toUpperCase();
      if (topicUpper === "MONTHLY" || topicUpper === "YEARLY") {
        consultationSystemText =
          consultationSystemText + "\n\n" + consultPrompts.getSolarReturnPrompt();
      }
      const systemInstruction = {
        parts: [{ text: consultationSystemText }],
      };

      const genderForPrompt =
        requestData.gender === "F" ||
        requestData.gender === "female" ||
        requestData.gender === "여자"
          ? "Female"
          : requestData.gender === "M" ||
              requestData.gender === "male" ||
              requestData.gender === "남자"
            ? "Male"
            : null;

      let userPrompt = `${systemContext}

${contextBlock}[User Question]: ${userQuestion.trim()}
[Category]: ${consultationTopic || "General"}${
        genderForPrompt ? `\n[Gender]: ${genderForPrompt}` : ""
      }`;

      // 해석 지식베이스 주입 (KO 전용)
      if (!requestLanguage.toLowerCase().startsWith("en")) {
        const knowledgeContext = buildKnowledgeContext(
          chartData,
          FortuneType.CONSULTATION,
        );
        if (knowledgeContext) {
          userPrompt = userPrompt + "\n\n" + knowledgeContext;
        }
      }

      const isFollowUp = !!hasPreviousContext;
      const generationConfig = isFollowUp
        ? getConsultationFollowUpConfig()
        : getConsultationFirstQuestionConfig();

      const requestBody = {
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction,
        generationConfig,
      };

      const modelName = getConsultationModel(isFollowUp);
      const currentUserId = user.id;
      const currentProfileId = requestData.profileId || null;

      // 스트리밍: generateContentStream → SSE → 스트림 종료 시 DB insert 후 [DONE]
      // Gemini API 호출 직전 (서버 로그 전용, 한 줄 JSON)
      logGeminiPromptDebug(
        fortuneType,
        systemInstruction.parts?.[0]?.text ?? "",
        userPrompt,
      );
      const geminiStream = callGeminiAPIStream(
        modelName,
        GEMINI_FALLBACK_MODEL,
        apiKey,
        requestBody,
      );
      const insertPayloadBuilder = (fullText: string) => ({
        user_id: currentUserId,
        user_info: {
          birthDate,
          lat,
          lng,
          userQuestion,
          consultationTopic,
          profileName: requestData.profileName ?? null,
        },
        fortune_text: fullText,
        fortune_type: fortuneType,
        ...(requestData.parentResultId && {
          parent_result_id: requestData.parentResultId,
        }),
        chart_data: {
          chart: chartData,
          firdaria: firdariaResult,
          interaction: interactionResult,
          progression: progressionResult,
          direction: directionResult,
          metadata: {
            userQuestion,
            consultationTopic,
            birthDate,
            lat,
            lng,
          },
        },
      });
      const sseStream = createFortuneSSEStream(
        geminiStream,
        insertPayloadBuilder,
        supabase,
        {
          userId: currentUserId,
          profileId: currentProfileId,
          fortuneType,
          consumeTransactionId: consumeTransactionId ?? null,
          authUserId: authUserId ?? null,
          consumeAmount,
          consumeDescription: consumeDescription ?? "",
          debugPayload: {
            chart: chartData,
            userPrompt,
            systemInstruction: systemInstruction.parts?.[0]?.text ?? "",
            debugInfo: {
              fullPromptSentToGemini:
                "=== System ===\n" +
                (systemInstruction.parts?.[0]?.text ?? "") +
                "\n\n=== User ===\n" +
                userPrompt,
            },
          },
        },
      );
      return new Response(sseStream, {
        status: 200,
        headers: sseHeaders,
      });
    }

    // 궁합인 경우 2명의 데이터 처리
    if (fortuneType === FortuneType.COMPATIBILITY) {
      const { user1, user2 } = requestData;

      if (
        !user1 ||
        !user1.birthDate ||
        typeof user1.lat !== "number" ||
        typeof user1.lng !== "number"
      ) {
        return new Response(
          JSON.stringify({
            error: "user1 data is required with birthDate, lat, lng",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (
        !user2 ||
        !user2.birthDate ||
        typeof user2.lat !== "number" ||
        typeof user2.lng !== "number"
      ) {
        return new Response(
          JSON.stringify({
            error: "user2 data is required with birthDate, lat, lng",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 두 명의 생년월일을 Date 객체로 변환 (각자의 출생지 로컬 시각 → UTC)
      let birthDateTime1: Date;
      let birthDateTime2: Date;
      try {
        // 사용자1: 출생지 타임존 기준 UTC 변환
        const dateMatch1 = user1.birthDate.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
        );
        if (!dateMatch1) {
          throw new Error("Invalid date format for user1");
        }
        const [_, year1, month1, day1, hour1, minute1, second1] = dateMatch1;

        const tzOpts1 = {
          lat: user1.lat as number,
          lng: user1.lng as number,
          timezone: (user1 as { timezone?: string }).timezone,
        };
        const noonApprox1 = new Date(Date.UTC(
          parseInt(year1), parseInt(month1) - 1, parseInt(day1), 12, 0, 0,
        ));
        const birthCityOffset1 = await resolveTimezoneOffsetHours(tzOpts1, noonApprox1);
        const localAsUtcTimestamp1 = Date.UTC(
          parseInt(year1), parseInt(month1) - 1, parseInt(day1),
          parseInt(hour1), parseInt(minute1), parseInt(second1),
        );
        birthDateTime1 = new Date(localAsUtcTimestamp1 - birthCityOffset1 * 60 * 60 * 1000);

        // 사용자2: 출생지 타임존 기준 UTC 변환
        const dateMatch2 = user2.birthDate.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
        );
        if (!dateMatch2) {
          throw new Error("Invalid date format for user2");
        }
        const [__, year2, month2, day2, hour2, minute2, second2] = dateMatch2;

        const tzOpts2 = {
          lat: user2.lat as number,
          lng: user2.lng as number,
          timezone: (user2 as { timezone?: string }).timezone,
        };
        const noonApprox2 = new Date(Date.UTC(
          parseInt(year2), parseInt(month2) - 1, parseInt(day2), 12, 0, 0,
        ));
        const birthCityOffset2 = await resolveTimezoneOffsetHours(tzOpts2, noonApprox2);
        const localAsUtcTimestamp2 = Date.UTC(
          parseInt(year2), parseInt(month2) - 1, parseInt(day2),
          parseInt(hour2), parseInt(minute2), parseInt(second2),
        );
        birthDateTime2 = new Date(localAsUtcTimestamp2 - birthCityOffset2 * 60 * 60 * 1000);

        if (
          isNaN(birthDateTime1.getTime()) ||
          isNaN(birthDateTime2.getTime()) ||
          !Number.isFinite(birthDateTime1.getTime()) ||
          !Number.isFinite(birthDateTime2.getTime())
        ) {
          throw new Error("Invalid date format");
        }

      } catch (error) {
        return new Response(
          JSON.stringify({
            error:
              "Invalid birthDate format. Use ISO format (YYYY-MM-DDTHH:mm:ss)",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      assertValidDate(birthDateTime1, "Compatibility User1");
      assertValidDate(birthDateTime2, "Compatibility User2");

      // 두 명의 타임존 오프셋 해석 (각 출생지·출생시 기준)
      const tzOffset1 = await resolveTimezoneOffsetHours(
        {
          lat: user1.lat,
          lng: user1.lng,
          timezone: (user1 as { timezone?: string }).timezone,
        },
        birthDateTime1,
      );
      const tzOffset2 = await resolveTimezoneOffsetHours(
        {
          lat: user2.lat,
          lng: user2.lng,
          timezone: (user2 as { timezone?: string }).timezone,
        },
        birthDateTime2,
      );

      // 두 명의 차트 계산
      let chartData1: ChartData;
      let chartData2: ChartData;
      try {
        chartData1 = await calculateChart(
          birthDateTime1,
          { lat: user1.lat, lng: user1.lng },
          tzOffset1,
        );
      } catch (chartError: any) {
        console.error("사용자1 차트 계산 실패:", chartError);
        return new Response(
          JSON.stringify({
            error: `Chart calculation failed for user1: ${
              chartError.message || "Unknown error"
            }`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      try {
        chartData2 = await calculateChart(
          birthDateTime2,
          { lat: user2.lat, lng: user2.lng },
          tzOffset2,
        );
      } catch (chartError: any) {
        console.error("사용자2 차트 계산 실패:", chartError);
        return new Response(
          JSON.stringify({
            error: `Chart calculation failed for user2: ${
              chartError.message || "Unknown error"
            }`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // AI 해석 요청 (궁합)
      const apiKey = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Vertex 서비스 계정(GCP_SERVICE_ACCOUNT_JSON)이 설정되지 않았습니다" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 궁합 분석 계산 (성별: 요청에 없으면 기본 M)
      const user1Gender =
        (user1 as { gender?: string }).gender === "F" ||
        (user1 as { gender?: string }).gender === "여자"
          ? "F"
          : "M";
      const user2Gender =
        (user2 as { gender?: string }).gender === "F" ||
        (user2 as { gender?: string }).gender === "여자"
          ? "F"
          : "M";

      // 관계 유형 추출 (기본값: "연인")
      const relationshipType = requestData.relationshipType || "연인";

      const synastryResult = calculateSynastry(
        chartData1,
        chartData2,
        user1Gender,
        user2Gender,
      );

      const interpretation = await getInterpretation(
        chartData1,
        fortuneType,
        apiKey,
        user1Gender,
        user1.birthDate,
        { lat: user1.lat, lng: user1.lng },
        chartData2,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        synastryResult,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        relationshipType,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // targetDateYmdKst (DAILY 전용)
        undefined, // transitMoonNatalPlacement
        undefined, // transitLordNatalPlacement
        undefined, // category (COMPATIBILITY 케이스에서는 사용하지 않음)
        requestLanguage, // language
        {
          supabase,
          insertPayloadBuilder: (fullText: string) => ({
            user_info: {
              user1: {
                birthDate: user1.birthDate,
                lat: user1.lat,
                lng: user1.lng,
              },
              user2: {
                birthDate: user2.birthDate,
                lat: user2.lat,
                lng: user2.lng,
              },
            },
            fortune_text: fullText,
            fortune_type: fortuneType,
            chart_data: {
              chart: chartData1,
              chart2: chartData2,
            },
          }),
          opts: {
            userId: user?.id,
            profileId: requestData.profileId ?? null,
            fortuneType,
            consumeTransactionId: consumeTransactionId ?? null,
            authUserId: authUserId ?? null,
            consumeAmount,
            consumeDescription: consumeDescription ?? "",
          },
        },
      );

      if (interpretation.stream) {
        return new Response(interpretation.stream, {
          status: 200,
          headers: sseHeaders,
        });
      }
      if (!interpretation.success || interpretation.error) {
        return new Response(
          JSON.stringify({
            error: `AI interpretation failed: ${
              interpretation.message || "Unknown error"
            }`,
            synastryResult: synastryResult,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 스트리밍이 아닌 경우(폴백): DB 저장 후 JSON 반환
      let shareId: string | undefined;
      try {
        const { data: insertData, error: insertError } = await supabase
          .from("fortune_results")
          .insert({
            user_info: {
              user1: {
                birthDate: user1.birthDate,
                lat: user1.lat,
                lng: user1.lng,
              },
              user2: {
                birthDate: user2.birthDate,
                lat: user2.lat,
                lng: user2.lng,
              },
            },
            fortune_text: interpretation.interpretation,
            fortune_type: fortuneType,
            chart_data: {
              chart: chartData1,
              chart2: chartData2,
            },
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("❌ [COMPATIBILITY] 운세 저장 실패:", insertError);
        } else if (insertData) {
          shareId = insertData.id;
        }
      } catch (saveError: any) {
        console.error("❌ [COMPATIBILITY] 운세 저장 중 예외 발생:", saveError);
      }

      const compatResponse: any = {
        success: true,
        interpretation: interpretation.interpretation,
        fortuneType: fortuneType,
        share_id: shareId || null,
        synastryResult: synastryResult,
      };
      return new Response(JSON.stringify(compatResponse), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 일반 운세 (1명의 데이터)
    const { birthDate, lat, lng } = requestData;

    // 필수 필드 검증
    if (!birthDate) {
      return new Response(JSON.stringify({ error: "birthDate is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({ error: "lat and lng must be numbers" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 타임존 옵션 (출생지 기준 — DST 역사 반영)
    const tzOpts = {
      lat,
      lng,
      timezone: (requestData as { timezone?: string }).timezone,
    };

    // 생년월일을 Date 객체로 변환 (출생지 로컬 시각 → UTC)
    let birthDateTime: Date;
    try {
      // 사용자 입력은 출생지의 현지 시각 (예: 뉴욕에서 태어난 경우 EST 기준)
      // 출생지의 IANA 타임존(tzOpts)으로 정확한 UTC를 계산

      // ISO 형식 문자열 파싱: YYYY-MM-DDTHH:mm:ss
      const dateMatch = birthDate.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
      );
      if (!dateMatch) {
        throw new Error("Invalid date format. Expected YYYY-MM-DDTHH:mm:ss");
      }

      const [_, year, month, day, hour, minute, second] = dateMatch;

      // 1. 출생일 정오(noon UTC)를 기준점으로 삼아 그날의 타임존 오프셋 조회
      //    (DST 경계선에서도 정오는 안전한 기준 — 출생 시각과 오프셋이 달라지는 경우 극히 드묾)
      const noonApprox = new Date(Date.UTC(
        parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0,
      ));
      const birthCityOffsetHours = await resolveTimezoneOffsetHours(tzOpts, noonApprox);

      // 2. 로컬 시각 숫자를 UTC 기준으로 일시 취급한 뒤 출생지 오프셋 차감
      //    UTC = Local - offsetHours * 3600000
      //    (KST +9h: 09:20 - 9h = 00:20Z / EST -5h: 09:20 - (-5h) = 14:20Z)
      const localAsUtcTimestamp = Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
      );
      birthDateTime = new Date(localAsUtcTimestamp - birthCityOffsetHours * 60 * 60 * 1000);

      if (isNaN(birthDateTime.getTime()) || !Number.isFinite(birthDateTime.getTime())) {
        throw new Error("Invalid date format");
      }

    } catch (error) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid birthDate format. Use ISO format (YYYY-MM-DDTHH:mm:ss)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    assertValidDate(birthDateTime, "Natal");

    // 1단계: Natal 차트 계산 (출생 시점 기준 오프셋)
    const natalTzOffset = await resolveTimezoneOffsetHours(tzOpts, birthDateTime);
    let chartData: ChartData;
    try {
      chartData = await calculateChart(birthDateTime, { lat, lng }, natalTzOffset);
    } catch (chartError: any) {
      console.error("차트 계산 실패:", chartError);
      return new Response(
        JSON.stringify({
          error: `Chart calculation failed: ${
            chartError.message || "Unknown error"
          }`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // DAILY 운세: 클라이언트 현지 시각 06:00 / 18:00 기준 트랜짓 차트
    let transitChartData: ChartData | undefined;
    let transitChartDataAM: ChartData | undefined;
    let transitChartDataPM: ChartData | undefined;
    let aspects: any[] | undefined;
    let transitToTransitAspects: any[] | undefined;
    let transitMoonHouse: number | undefined;
    let transitMoonNatalPlacement: TransitNatalPlacement | undefined;
    let transitLordNatalPlacement: TransitNatalPlacement | undefined;

    if (fortuneType === FortuneType.DAILY) {
      try {
        const { amDateUtc, pmDateUtc } =
          getDailyTransitDatesUtc(targetDateYmdKst, timezoneOffset);
        const tzOffsetAM = await resolveTimezoneOffsetHours(tzOpts, amDateUtc);
        const tzOffsetPM = await resolveTimezoneOffsetHours(tzOpts, pmDateUtc);
        transitChartDataAM = await calculateChart(
          amDateUtc,
          { lat, lng },
          tzOffsetAM,
        );
        transitChartDataPM = await calculateChart(
          pmDateUtc,
          { lat, lng },
          tzOffsetPM,
        );
        transitChartData = transitChartDataPM;

        aspects = calculateAspects(chartData, transitChartData);
        transitToTransitAspects =
          calculateTransitToTransitAspects(transitChartData);
        transitMoonHouse = getTransitMoonHouseInNatalChart(
          chartData,
          transitChartData,
        );
        transitMoonNatalPlacement = getTransitPointNatalWsQs(
          chartData,
          transitChartData.planets.moon.degree,
        );
      } catch (transitError: any) {
        console.error(
          "⚠️ Transit 차트 계산 실패 (기본 모드로 진행):",
          transitError,
        );
      }
    }

    // DAILY 프로펙션 데이터(아래 DAILY 계산 블록에서 채워짐). 다른 타입에선 미사용.
    let profectionData: any | undefined;

    // DAILY: 프로펙션/연주 계산 + 타임로드 역행 여부 + 연주 행성의 트랜짓 상태·각도
    let timeLordRetrogradeAlert: {
      planet: string;
      isRetrograde: boolean;
    } | null = null;
    let dailyLordTransitAspects: any[] | undefined;
    let dailyLordTransitStatus:
      | {
          isRetrograde: boolean;
          isDayChart: boolean;
          sectStatus: "day_sect" | "night_sect" | "neutral";
          isInSect: boolean;
        }
      | undefined;
    let dailyLordStarConjunctionsText: string | undefined;
    let dailyLordStarConjunctions: any[] = [];
    let dailyFlowAM: import("./types.ts").DailyFlowSummary | undefined;
    let dailyFlowPM: import("./types.ts").DailyFlowSummary | undefined;
    let dailyAngleStrikes: import("./types.ts").DailyAngleStrike[] | undefined;
    let lordProfectionAngleEntry: import("./types.ts").LordProfectionAngleEntry | null =
      null;

    if (fortuneType === FortuneType.DAILY && transitChartData) {
      try {
        // DAILY 지정일 운세는 targetDate 로컬 18:00 시점을 기준 시각으로 사용
        const { pmDateUtc: now } =
          getDailyTransitDatesUtc(targetDateYmdKst, timezoneOffset);
        const natalAscSign = getSignFromLongitude(
          chartData.houses.angles.ascendant,
        ).sign;
        const dailyProfection = calculateProfection(
          birthDateTime,
          now,
          natalAscSign,
          false,
        );
        profectionData = dailyProfection;
        const lordName = dailyProfection.lordOfTheYear;
        const lordKeyMap: Record<string, string> = {
          Sun: "sun",
          Moon: "moon",
          Mercury: "mercury",
          Venus: "venus",
          Mars: "mars",
          Jupiter: "jupiter",
          Saturn: "saturn",
        };
        const lordKey = lordKeyMap[lordName];
        const transitLord = lordKey
          ? (
              transitChartData.planets as Record<
                string,
                { isRetrograde?: boolean; degree?: number }
              >
            )?.[lordKey]
          : undefined;
        if (lordKey && transitLord && typeof transitLord.degree === "number") {
          transitLordNatalPlacement = getTransitPointNatalWsQs(
            chartData,
            transitLord.degree,
          );
        }
        const isRetrograde = transitLord?.isRetrograde === true;
        timeLordRetrogradeAlert = {
          planet: lordName,
          isRetrograde,
        };
        dailyLordTransitAspects = calculateLordOfYearTransitAspects(
          transitChartData,
          lordName,
        );
        dailyLordTransitStatus = getLordOfYearTransitStatus(
          transitChartData,
          lordName,
        );
        // 연주–항성 회합 (등급별 orb: 1~2등성 40'/30', 3등성 30'/20', 세차 적용)
        try {
          const { longitude: lordLon, speed: lordSpeed } =
            getPlanetLongitudeAndSpeed(lordKey, now);
          const lordStarConjunctions = getLordOfYearFixedStarConjunctions(
            lordLon,
            lordSpeed,
            lordName,
            now.getFullYear(),
          );
          dailyLordStarConjunctions = lordStarConjunctions;
          dailyLordStarConjunctionsText = formatLordStarConjunctionsForPrompt(
            lordName,
            lordStarConjunctions,
          );
        } catch (starErr: any) {
          console.warn(
            "⚠️ [DAILY] 연주–항성 회합 계산 실패 (무시):",
            starErr?.message,
          );
        }
        if (isRetrograde) {
        }

        // 고전 점성술: 연주 앵글 진입, 접근/분리 각도, 4대 감응점 타격 + Neo4j 리셉션/리젝션
        if (transitChartDataAM && transitChartDataPM) {
          lordProfectionAngleEntry = getLordOfYearProfectionAngleEntry(
            transitChartDataPM,
            lordName,
            dailyProfection.profectionSign,
          );
          const lordAspectsWithPhase = calculateLordAspectsWithPhase(
            transitChartDataAM,
            transitChartDataPM,
            lordName,
          );
          dailyAngleStrikes = calculateDailyAngleStrikes(
            chartData,
            transitChartDataAM,
            transitChartDataPM,
          );
          for (const strike of dailyAngleStrikes) {
            const { metaTag } = getDailyReceptionRejectionMeta(
              strike.striker,
              strike.targetSign,
            );
            strike.neo4jMetaTag = metaTag;
          }
          dailyFlowAM = {
            label: "AM",
            lordRetrograde: isRetrograde,
            lordAspects: lordAspectsWithPhase.filter((a) => a.phase === "Applying"),
            angleStrikes: dailyAngleStrikes.filter((s) => s.phase === "Applying"),
          };
          dailyFlowPM = {
            label: "PM",
            lordRetrograde: isRetrograde,
            lordAspects: lordAspectsWithPhase.filter(
              (a) => a.phase === "Separating",
            ),
            angleStrikes: dailyAngleStrikes.filter(
              (s) => s.phase === "Separating",
            ),
          };

          // 오늘의 신호 등급(스포트라이트 스코어링) — 연주 상태가 다 계산된 뒤 종합.
          // 연주–항성 회합을 최상위 축으로, 날 등급(잔잔/주목/뚜렷/중대)을 산출해
          // 데일리 프롬프트의 해석 강도·분량을 게이팅한다. 실패 시 기존 항성 텍스트 유지.
          try {
            const firdaria = calculateFirdaria(birthDateTime, { lat, lng }, now);
            // Phase 2 트리거(일월식·시저지·정지·MPD→SR→달) — 실패해도 무시하고 진행
            let triggerSignals: any[] = [];
            try {
              const lordLonNow = lordKey
                ? getPlanetLongitudeAndSpeed(lordKey, now).longitude
                : 0;
              triggerSignals = await computeDailyTriggerSignals({
                targetDate: now,
                location: { lat, lng },
                birthDate: birthDateTime,
                natalSunLon: chartData.planets.sun.degree,
                natalPoints: {
                  Sun: chartData.planets.sun.degree,
                  Moon: chartData.planets.moon.degree,
                  Ascendant: chartData.houses.angles.ascendant,
                  Midheaven: chartData.houses.angles.midheaven,
                  PartOfFortune: chartData.fortuna.degree,
                },
                natalPlanets: chartData.planets,
                annualProfectionSign: dailyProfection.profectionSign,
                lordName,
                lordLon: lordLonNow,
                transitMoonLon: transitChartData?.planets.moon.degree ?? 0,
              });
            } catch (trigErr: any) {
              console.warn(
                "⚠️ [DAILY] Phase2 트리거 계산 실패 (무시):",
                trigErr?.message,
              );
            }
            const spotlight = computeDailySpotlight({
              lordName,
              profectionSign: dailyProfection.profectionSign,
              natalPlanets: chartData.planets,
              firdariaSubLord: firdaria.subLord ?? null,
              lordStarConjunctions: dailyLordStarConjunctions,
              lordRetrograde: isRetrograde,
              lordProfectionAngleHouse: lordProfectionAngleEntry?.house ?? null,
              angleStrikes: dailyAngleStrikes ?? [],
              extraSignals: triggerSignals,
            });
            dailyLordStarConjunctionsText = formatDailySpotlightForPrompt(spotlight);
          } catch (spotErr: any) {
            console.warn(
              "⚠️ [DAILY] 스포트라이트 스코어링 실패 (기존 항성 텍스트 유지):",
              spotErr?.message,
            );
          }
        }
      } catch (err: any) {
        console.warn(
          "⚠️ [DAILY] 타임로드/연주 계산 실패 (무시):",
          err?.message,
        );
      }
    }


    // 2단계: AI 해석 요청
    const apiKey = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Vertex 서비스 계정(GCP_SERVICE_ACCOUNT_JSON)이 설정되지 않았습니다" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const chartDataForDb =
      fortuneType === FortuneType.DAILY && transitChartData
        ? {
            chart: chartData,
            transitChart: transitChartData,
            aspects: aspects ?? null,
            transitMoonHouse: transitMoonHouse ?? null,
            metadata: {
              targetDate: targetDateYmdKst,
              kstTransitTimes: {
                am: "06:00",
                pm: "18:00",
              },
            },
          }
        : fortuneType === FortuneType.LIFETIME
            ? { chart: chartData }
            : null;

    const profileName = requestData.profileName ?? null;
    const streamOptions = {
      supabase,
      insertPayloadBuilder: (fullText: string) => ({
        user_info: {
          birthDate,
          lat,
          lng,
          ...(fortuneType === FortuneType.DAILY && { targetDate: targetDateYmdKst }),
          ...(profileName && { profileName }),
        },
        fortune_text: fullText,
        fortune_type: fortuneType,
        ...(chartDataForDb && { chart_data: chartDataForDb }),
      }),
      opts: {
        userId: user?.id,
        profileId: requestData.profileId ?? null,
        fortuneType,
        ...(fortuneType === FortuneType.DAILY && { fortuneDate: targetDateYmdKst }),
        consumeTransactionId: consumeTransactionId ?? null,
        authUserId: authUserId ?? null,
        consumeAmount,
        consumeDescription: consumeDescription ?? "",
      },
    };

    const interpretation = await getInterpretation(
      chartData,
      fortuneType,
      apiKey,
      requestData.gender,
      birthDate,
      { lat: requestData.lat, lng: requestData.lng },
      undefined,
      transitChartData,
      aspects,
      transitMoonHouse,
      undefined, // solarReturnChartData (YEARLY 제거됨)
      profectionData, // DAILY 프로펙션
      undefined, // solarReturnOverlay (YEARLY 제거됨)
      undefined,
      undefined, // shortTermPromptSection (YEARLY 제거됨)
      timeLordRetrogradeAlert,
      dailyLordTransitAspects,
      dailyLordTransitStatus,
      dailyLordStarConjunctionsText,
      undefined,
      transitToTransitAspects,
      dailyFlowAM,
      dailyFlowPM,
      dailyAngleStrikes,
      lordProfectionAngleEntry ?? undefined,
      fortuneType === FortuneType.DAILY ? targetDateYmdKst : undefined,
      fortuneType === FortuneType.DAILY ? transitMoonNatalPlacement : undefined,
      fortuneType === FortuneType.DAILY ? transitLordNatalPlacement : undefined,
      undefined, // category (일반 운세 케이스에서는 사용하지 않음)
      requestLanguage, // language
      streamOptions,
    );

    if (interpretation.stream) {
      return new Response(interpretation.stream, {
        status: 200,
        headers: sseHeaders,
      });
    }

    if (!interpretation.success || interpretation.error) {
      // 원문 에러는 서버 로그에만 남긴다 (Vertex 400 등)
      console.error("\n" + "=".repeat(60));
      console.error("❌ AI 해석 실패");
      console.error("=".repeat(60));
      console.error("에러 메시지:", interpretation.message);
      console.error("에러 상세:", interpretation.details);
      console.error("=".repeat(60) + "\n");

      // 비스트리밍 경로(예: LIFETIME)는 여기서 최상단 catch를 거치지 않고 즉시 반환되므로
      // 차감된 운세권을 이 지점에서 직접 환불한다.
      if (consumed) {
        await autoRefundConsumed({
          authUserId,
          consumeAmount,
          consumeDescription,
          consumeTransactionId,
          reason: "운세 생성 실패(AI 해석 오류)로 인한 자동 환불",
        });
      }

      return new Response(
        JSON.stringify({
          error: USER_FACING_ERROR,
          errorType: "AI_INTERPRETATION_FAILED",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // LIFETIME 등 스트리밍이 아닌 경우: Supabase에 운세 저장 후 JSON 반환
    let shareId: string | undefined;
    try {
      const { data: insertData, error: insertError } = await supabase
        .from("fortune_results")
        .insert({
          user_info: {
            birthDate: birthDate,
            lat: lat,
            lng: lng,
            ...(fortuneType === FortuneType.DAILY && { targetDate: targetDateYmdKst }),
            ...(profileName && { profileName }),
          },
          fortune_text: interpretation.interpretation,
          fortune_type: fortuneType,
          ...(chartDataForDb && { chart_data: chartDataForDb }),
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(`❌ [${fortuneType}] 운세 저장 실패:`, insertError);
        console.error("에러 상세:", JSON.stringify(insertError, null, 2));
      } else if (insertData) {
        shareId = insertData.id;
        // 스트리밍이 아닌 경우에도 fortune_history에 기록 (DAILY는 targetDate 기준으로 1회 제한/복구에 사용)
        if (user?.id && requestData.profileId) {
          try {
            await supabase.from("fortune_history").insert({
              user_id: user.id,
              profile_id: requestData.profileId ?? null,
              result_id: shareId,
              fortune_type: fortuneType,
              fortune_date:
                fortuneType === FortuneType.DAILY
                  ? targetDateYmdKst
                  : new Date().toISOString().split("T")[0],
            });
          } catch (historyErr) {
            console.warn("⚠️ fortune_history insert 실패(무시):", historyErr);
          }
        }
      } else {
        console.warn(`⚠️ [${fortuneType}] insertData가 null입니다.`);
      }
    } catch (saveError: any) {
      console.error(`❌ [${fortuneType}] 운세 저장 중 예외 발생:`, saveError);
      console.error("에러 스택:", saveError.stack);
    }

    const responseData: any = {
      success: true,
      interpretation: interpretation.interpretation,
      fortune: interpretation.interpretation,
      fortuneType: fortuneType,
      share_id: shareId || null,
    };

    // 재화 차감 건을 SUCCESS로 확정 (PENDING → SUCCESS)
    if (consumeTransactionId) {
      try {
        await supabase
          .from("star_transactions")
          .update({ consume_status: "SUCCESS" })
          .eq("id", consumeTransactionId)
          .eq("type", "CONSUME");
      } catch (e) {
        console.warn("⚠️ consume_status SUCCESS 업데이트 실패 (크론 롤백 대상이 될 수 있음):", e);
      }
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ Edge Function 에러 발생");
    console.error("=".repeat(60));
    console.error("에러 메시지:", error.message);
    console.error("에러 스택:", error.stack);
    console.error("에러 타입:", error.name);
    console.error("=".repeat(60) + "\n");

    // 스트리밍 전 차감했던 경우 서버에서 자동 환불 (네트워크 단절 시에도 복구 가능)
    if (consumed) {
      await autoRefundConsumed({
        authUserId,
        consumeAmount,
        consumeDescription,
        consumeTransactionId,
        reason: "운세 생성 실패(에러/타임아웃)로 인한 자동 환불",
      });
    }

    // 원문 에러는 위에서 로그로 남겼고, 프론트에는 친화 메시지만 노출한다.
    return new Response(
      JSON.stringify({
        error: USER_FACING_ERROR,
        errorType: error.name || "UNKNOWN_ERROR",
        details:
          Deno.env.get("DENO_ENV") === "development" ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
