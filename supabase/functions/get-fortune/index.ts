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
} from "./types.ts";
import {
  getSystemInstruction,
  getConsultationSystemPrompt,
  getSolarReturnPrompt,
  getLifetimePrompt_Nature,
  getLifetimePrompt_Love,
  getLifetimePrompt_MoneyCareer,
  getLifetimePrompt_HealthTotal,
} from "./geminiPrompts.ts";

// 차트 포맷팅 유틸리티 import
import {
  generateDailyUserPrompt,
  generateYearlyUserPrompt,
  generateLifetimeUserPrompt,
  generateCompatibilityUserPrompt,
  generatePredictionPrompt,
  formatLordOfYearTransitSectionForPrompt,
  formatSolarReturnBlockForPrompt,
} from "./utils/chartFormatter.ts";

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

// Neo4j 전문 해석 데이터 조회
import {
  getNeo4jContext,
  isDayChartFromSun,
  fetchConsultationContext,
} from "./utils/neo4jContext.ts";

// ========== CORS 헤더 설정 ==========
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ========== AI 해석 관련 함수 ==========
const GEMINI_MODEL = "gemini-3-pro-preview"; // 전 타입 공통: 종합운세, 데일리, 1년 운세, 궁합 + 자유 상담소 첫 질문
const GEMINI_CONSULTATION_FOLLOWUP_MODEL = "gemini-2.5-flash"; // 자유 상담소 후속 질문 전용
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * 운세 타입에 따라 사용할 Gemini 모델을 반환
 * 자유 상담소(CONSULTATION)는 첫 질문/후속 질문 구분은 getConsultationModel()에서 처리
 */
function getGeminiModel(_fortuneType: FortuneType): string {
  return GEMINI_MODEL;
}

/** 자유 상담소: 첫 질문이면 Pro, 후속 질문이면 2.5 Flash */
function getConsultationModel(isFollowUp: boolean): string {
  return isFollowUp ? GEMINI_CONSULTATION_FOLLOWUP_MODEL : GEMINI_MODEL;
}

/** 자유 상담소: 첫 질문용 generation config (Pro 모델 사용) */
function getConsultationFirstQuestionConfig(): Record<string, number> {
  return {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 8000,
  };
}

/** 자유 상담소: 후속 질문용 generation config (2.5 Flash 사용) */
function getConsultationFollowUpConfig(): Record<string, number> {
  return {
    temperature: 0.7,
    topK: 40,
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
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8000,
      };
    case FortuneType.COMPATIBILITY:
    case FortuneType.YEARLY:
    case FortuneType.CONSULTATION:
      return {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 15000,
      };
    default:
      return {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 3000,
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
    [FortuneType.YEARLY]: "1년 운세",
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
  transitToTransitAspects?: any[], // 트랜짓 to 트랜짓 각도 추가
): string {
  // DAILY 운세의 경우 새로운 상세 프롬프트 사용 (프로펙션/연주 + 연주 행성 트랜짓 상태·각도·항성 회합 포함)
  if (
    fortuneType === FortuneType.DAILY &&
    transitChartData &&
    aspects &&
    transitMoonHouse !== undefined
  ) {
    return generateDailyUserPrompt(
      chartData as ChartData,
      transitChartData as ChartData,
      aspects,
      transitMoonHouse,
      timeLordRetrogradeAlert ?? null,
      profectionData ?? null,
      lordTransitStatus ?? null,
      lordTransitAspects,
      lordStarConjunctionsText ?? null,
      transitToTransitAspects, // 트랜짓 to 트랜짓 각도 추가
    );
  }

  // YEARLY 운세의 경우 Solar Return 프롬프트 사용
  if (
    fortuneType === FortuneType.YEARLY &&
    solarReturnChartData &&
    profectionData &&
    solarReturnOverlay
  ) {
    return generateYearlyUserPrompt(
      chartData as ChartData,
      solarReturnChartData as ChartData,
      profectionData,
      solarReturnOverlay,
    );
  }

  // LIFETIME 운세의 경우 상세 프롬프트 사용
  if (fortuneType === FortuneType.LIFETIME) {
    return generateLifetimeUserPrompt(chartData as ChartData);
  }

  // COMPATIBILITY 운세의 경우 두 사람의 상세 프롬프트 사용
  if (fortuneType === FortuneType.COMPATIBILITY && compatibilityChartData) {
    return generateCompatibilityUserPrompt(
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
  apiKey: string,
  requestBody: any,
): Promise<any> {
  const endpoint = `${GEMINI_API_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`;

  const maxRetries = 3;
  let delay = 1000; // 초기 지연 시간: 1초

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt === 0) {
        console.log("📤 Gemini API 호출 시작");
      } else {
        console.log(`🔄 Gemini API 재시도 (${attempt}/${maxRetries})...`);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      // 429 Rate Limit 또는 503 Service Unavailable 에러인 경우 재시도
      if (response.status === 429 || response.status === 503) {
        if (attempt < maxRetries) {
          const statusMessage =
            response.status === 429
              ? "429 Too Many Requests"
              : "503 Service Unavailable (Model Overloaded)";
          console.warn(
            `⚠️ ${statusMessage}. ${delay}ms 후 재시도합니다... (남은 시도: ${
              maxRetries - attempt
            })`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // 지수 백오프: 1000ms -> 2000ms -> 4000ms
          continue; // 다음 시도로 진행
        } else {
          // 최대 재시도 횟수 초과
          const errorText = await response.text();
          const statusMessage =
            response.status === 429
              ? "Rate Limit 초과 (429)"
              : "Service Unavailable (503)";
          console.error("\n" + "=".repeat(60));
          console.error(`❌ Gemini API ${statusMessage}`);
          console.error("=".repeat(60));
          console.error("최대 재시도 횟수(3회)를 초과했습니다.");
          console.error("에러 응답:", errorText);
          console.error("=".repeat(60) + "\n");

          const errorType =
            response.status === 429 ? "Quota Exceeded" : "Service Unavailable";
          throw new Error(
            `Gemini API ${errorType} (${
              response.status
            }): 최대 재시도 횟수를 초과했습니다. ${errorText.substring(0, 200)}`,
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

      if (attempt > 0) {
        console.log(`✅ Gemini API 호출 성공 (재시도 ${attempt}회 후)`);
      } else {
        console.log("✅ Gemini API 호출 성공");
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

const NEO4J_SECTION_HEADER =
  "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[Neo4j 전문 해석 데이터]\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

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
  relationshipType?: string, // 관계 유형 추가
  transitToTransitAspects?: any[], // 트랜짓 to 트랜짓 각도 추가
): Promise<any> {
  try {
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }

    // LIFETIME 운세는 별도 함수에서 처리
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
      );
    }

    // Neo4j 전문 해석 데이터: 데일리 운세에서는 Gemini 인풋에 넣지 않음
    const isDayChart = isDayChartFromSun(chartData?.planets ?? null);
    const neo4jContext =
      fortuneType === FortuneType.DAILY
        ? null
        : await getNeo4jContext(chartData?.planets ?? null, isDayChart);

    // COMPATIBILITY 케이스의 경우 synastryResult와 relationshipType을 전달
    const systemInstructionText =
      fortuneType === FortuneType.COMPATIBILITY &&
      compatibilityChartData &&
      synastryResult
        ? getSystemInstruction(
            fortuneType,
            chartData as ChartData,
            compatibilityChartData as ChartData,
            synastryResult,
            relationshipType, // 관계 유형 추가
          )
        : getSystemInstruction(fortuneType);

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
      transitToTransitAspects, // 트랜짓 to 트랜짓 각도 추가
    );

    if (neo4jContext) {
      userPrompt = userPrompt + NEO4J_SECTION_HEADER + neo4jContext;
    }

    if (shortTermPromptSection) {
      userPrompt = userPrompt + "\n\n" + shortTermPromptSection;
    }

    const requestBody = {
      contents: [
        {
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
    const apiResponse = await callGeminiAPI(modelName, apiKey, requestBody);
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
      userPrompt: userPrompt,
      systemInstruction: systemInstructionText,
      debugInfo: {
        fullPromptSentToGemini,
        neo4jContext: neo4jContext || "(없음)",
        rawGeminiResponse: apiResponse,
      },
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
): Promise<any> {
  try {
    const isDayChart = isDayChartFromSun(chartData?.planets ?? null);
    const neo4jContext = await getNeo4jContext(
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

    const natureSystemText = getLifetimePrompt_Nature();
    const loveSystemText = getLifetimePrompt_Love();
    const moneyCareerSystemText = getLifetimePrompt_MoneyCareer();
    const healthTotalSystemText = getLifetimePrompt_HealthTotal();

    let userPrompt = buildUserPrompt(
      chartData,
      FortuneType.LIFETIME,
      compatibilityChartData,
      transitChartData,
      aspects,
      transitMoonHouse,
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

    const userPromptBase = neo4jContext
      ? userPrompt + NEO4J_SECTION_HEADER + neo4jContext
      : userPrompt;

    // Nature 요청 본문 (Identity + Roots 항성)
    const requestBodyNature = {
      contents: [
        {
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
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // Love 요청 본문 (Love 항성)
    const requestBodyLove = {
      contents: [
        {
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
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // MoneyCareer 요청 본문 (Career 항성)
    const requestBodyMoneyCareer = {
      contents: [
        {
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
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // HealthTotal 요청 본문 (Health 항성: 6/8/12 로드 + 흉성)
    const requestBodyHealthTotal = {
      contents: [
        {
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
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 10000,
      },
    };

    // Lifetime 운세는 flash 모델 사용
    const modelName = getGeminiModel(FortuneType.LIFETIME);

    // 병렬 호출로 속도 최적화 (4배 빠름!)
    console.log(
      "🔄 Lifetime 운세: Nature, Love, MoneyCareer, HealthTotal을 병렬로 호출합니다...",
    );
    const [resultNature, resultLove, resultMoneyCareer, resultHealthTotal] =
      await Promise.all([
        callGeminiAPI(modelName, apiKey, requestBodyNature),
        callGeminiAPI(modelName, apiKey, requestBodyLove),
        callGeminiAPI(modelName, apiKey, requestBodyMoneyCareer),
        callGeminiAPI(modelName, apiKey, requestBodyHealthTotal),
      ]);

    console.log("✅ 4개 API 호출 완료");

    // 결과 파싱
    const interpretationNature = parseGeminiResponse(resultNature);
    const interpretationLove = parseGeminiResponse(resultLove);
    const interpretationMoneyCareer = parseGeminiResponse(resultMoneyCareer);
    const interpretationHealthTotal = parseGeminiResponse(resultHealthTotal);

    // 결과 합치기 (줄바꿈만 사용, 구분선 없음)
    const combinedInterpretation = `${interpretationNature}\n\n${interpretationLove}\n\n${interpretationMoneyCareer}\n\n${interpretationHealthTotal}`;

    console.log("✅ Lifetime 운세: 네 결과를 성공적으로 합쳤습니다.");

    const fullPromptSentToGemini =
      "=== System (Nature) ===\n" +
      natureSystemText +
      "\n\n=== User ===\n" +
      userPrompt;

    return {
      success: true,
      fortuneType: FortuneType.LIFETIME,
      interpretation: combinedInterpretation,
      userPrompt: userPrompt,
      systemInstruction: `${natureSystemText}\n\n${loveSystemText}\n\n${moneyCareerSystemText}\n\n${healthTotalSystemText}`,
      debugInfo: {
        fullPromptSentToGemini,
        neo4jContext: neo4jContext || "(없음)",
        rawGeminiResponse: {
          nature: resultNature,
          love: resultLove,
          moneyCareer: resultMoneyCareer,
          healthTotal: resultHealthTotal,
        },
      },
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

// ========== 메인 핸들러 ==========
serve(async (req) => {
  // CORS Preflight 처리
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      const payload = {
        success: true,
        interpretation: data.fortune_text,
        userInfo: data.user_info,
        fortuneType,
        createdAt: data.created_at,
        chart_data: data.chart_data ?? null,
        isShared: true,
      };

      // consultation 공유 시 후속 질문 목록 포함
      if (fortuneType === "consultation") {
        const { data: historyRows } = await supabaseAdmin
          .from("fortune_history")
          .select("user_question, created_at")
          .eq("result_id", id)
          .eq("fortune_type", "consultation")
          .not("user_question", "is", null)
          .order("created_at", { ascending: true });

        const { data: childResults } = await supabaseAdmin
          .from("fortune_results")
          .select("id, fortune_text, created_at, user_info")
          .eq("parent_result_id", id)
          .order("created_at", { ascending: true });

        const questions = (historyRows || []).map((r) => r.user_question);
        const childInterpretations = (childResults || []).map((r) => r.fortune_text);
        const followUps: { question: string; interpretation: string }[] = [];
        for (let i = 0; i < childInterpretations.length; i++) {
          const childInfo = (childResults || [])[i]?.user_info as { userQuestion?: string } | undefined;
          const questionText =
            questions[i + 1] ?? childInfo?.userQuestion ?? "(질문 없음)";
          followUps.push({
            question: questionText,
            interpretation: childInterpretations[i],
          });
        }
        Object.assign(payload, { followUps });
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

    console.log("✅ 유저 인증 성공:", user.id);

    // Supabase Admin 클라이언트 생성 (DB 저장용)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 요청 본문 파싱
    const requestData = await req.json();

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
        yearly: FortuneType.YEARLY,
        consultation: FortuneType.CONSULTATION,
      };
      fortuneType = reportTypeMap[requestData.reportType] || FortuneType.DAILY;
    } else {
      fortuneType = FortuneType.DAILY;
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

      // 생년월일 Date 변환 (KST→UTC)
      let birthDateTime: Date;
      try {
        const dateMatch = birthDate.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
        );
        if (!dateMatch) {
          throw new Error("Invalid date format");
        }
        const [_, year, month, day, hour, minute, second] = dateMatch;
        const tempUtcTimestamp = Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second),
        );
        birthDateTime = new Date(tempUtcTimestamp - 9 * 60 * 60 * 1000);
        if (isNaN(birthDateTime.getTime())) throw new Error("Invalid date");
        console.log(
          `🕐 [CONSULTATION] Timezone 보정 완료: ${birthDateTime.toISOString()}`,
        );
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

      // 1. Natal 차트
      let chartData;
      try {
        chartData = await calculateChart(birthDateTime, { lat, lng });
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
        : fetchConsultationContext(
            requestData.consultationTopic || "GENERAL",
            chartData,
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
        const timezoneOffsetHours = Math.round(lng / 15);
        solarReturnChartData = await calculateChart(
          solarReturnDateTime,
          { lat, lng },
          timezoneOffsetHours,
        );
        solarReturnOverlay = getSolarReturnOverlays(
          chartData,
          solarReturnChartData,
        );
        console.log(`✅ [CONSULTATION] Solar Return 차트 계산 완료`);
      } catch (srErr: any) {
        console.warn(
          "⚠️ [CONSULTATION] Solar Return 계산 실패 (무시하고 진행):",
          srErr,
        );
      }

      // 5b. CONSULTATION: 현재 트랜짓 차트 (연주 트랜짓 상태·각도·항성·3외행성용)
      let consultationTransitChart: ChartData | undefined;
      try {
        const timezoneOffsetHours = Math.round(lng / 15);
        consultationTransitChart = await calculateChart(
          now,
          { lat, lng },
          timezoneOffsetHours,
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
      let systemContext = generatePredictionPrompt(
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
        console.log(
          `📅 [CONSULTATION] 6개월 단기 이벤트 ${scanResult.events.length}건 스캔 완료`,
        );
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
            const timezoneOffsetHours = Math.round(lng / 15);
            let currentSRChart: ChartData | undefined;
            try {
              currentSRChart = await calculateChart(
                currentSRDateTime,
                { lat, lng },
                timezoneOffsetHours,
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
              nextSRChart = await calculateChart(
                nextSRDateTime,
                { lat, lng },
                timezoneOffsetHours,
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
                ? formatSolarReturnBlockForPrompt(
                    currentSRChart,
                    currentSROverlay ?? undefined,
                    currentSRAspects.length > 0 ? currentSRAspects : undefined,
                    "생일 전",
                  )
                : "";
            const afterBlock =
              nextSRChart != null
                ? formatSolarReturnBlockForPrompt(
                    nextSRChart,
                    nextSROverlay ?? undefined,
                    nextSRAspects.length > 0 ? nextSRAspects : undefined,
                    "생일 후",
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
              const timezoneOffsetHours = Math.round(lng / 15);
              const sampleTransitChart = await calculateChart(
                sampleDate,
                { lat, lng },
                timezoneOffsetHours,
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
            const lordTransitSection = formatLordOfYearTransitSectionForPrompt(
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
      const apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      let consultationSystemText = getConsultationSystemPrompt(
        requestData.consultationTopic || "General",
      );
      // 월간/연간 운세 카테고리 선택 시: 솔라리턴 해석 방법 가이드 추가
      const topicUpper = (requestData.consultationTopic || "")
        .trim()
        .toUpperCase();
      if (topicUpper === "MONTHLY" || topicUpper === "YEARLY") {
        consultationSystemText =
          consultationSystemText + "\n\n" + getSolarReturnPrompt();
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

      // 후속 질문 시 이전 대화 맥락 (선택)
      const previousConversation = requestData.previousConversation as
        | Array<{ question: string; interpretation: string }>
        | undefined;
      const hasPreviousContext =
        Array.isArray(previousConversation) &&
        previousConversation.length > 0 &&
        previousConversation.every(
          (x) =>
            typeof x?.question === "string" && typeof x?.interpretation === "string",
        );

      let contextBlock = "";
      if (hasPreviousContext) {
        const lines = previousConversation!.map(
          (pair, i) =>
            `[이전 질문 ${i + 1}]: ${pair.question.trim()}\n[점성술사 답변 ${i + 1}]:\n${pair.interpretation.trim()}`,
        );
        contextBlock = `[이전 대화 맥락 (동일 주제에 대한 선행 질문과 답변입니다. 이 맥락을 유지한 채 후속 질문에만 답하세요.)]\n${lines.join("\n\n")}\n\n`;
      }

      const userPrompt = `${contextBlock}[User Question]: ${userQuestion.trim()}
[Category]: ${consultationTopic || "General"}${
        genderForPrompt ? `\n[Gender]: ${genderForPrompt}` : ""
      }

${systemContext}`;

      const isFollowUp = !!hasPreviousContext;
      const generationConfig = isFollowUp
        ? getConsultationFollowUpConfig()
        : getConsultationFirstQuestionConfig();

      const requestBody = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction,
        generationConfig,
      };

      const modelName = getConsultationModel(isFollowUp);
      let interpretation;
      try {
        const apiResponse = await callGeminiAPI(modelName, apiKey, requestBody);
        const interpretationText = parseGeminiResponse(apiResponse);
        interpretation = {
          success: true,
          interpretation: interpretationText,
        };
      } catch (geminiError: any) {
        console.error("❌ [CONSULTATION] Gemini 호출 실패:", geminiError);
        return new Response(
          JSON.stringify({
            error: `AI interpretation failed: ${geminiError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 8. DB 저장 (정규화: fortune_results → fortune_history)
      let shareId: string | undefined;

      try {
        console.log("💾 [CONSULTATION] 운세 저장 시작...");

        // Step 1: 현재 사용자 ID는 이미 상단에서 검증됨 (line 863~866)
        const currentUserId = user.id;
        const currentProfileId = requestData.profileId || null;

        // Step 2: fortune_results에 먼저 insert (user_info NOT NULL 요구사항 충족)
        const insertPayload = {
          user_id: currentUserId,
          user_info: {
            birthDate,
            lat,
            lng,
            userQuestion,
            consultationTopic,
            profileName: requestData.profileName ?? null,
          }, // NOT NULL 컬럼
          fortune_text: interpretation.interpretation,
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
        };
        const { data: resultData, error: resultError } = await supabase
          .from("fortune_results")
          .insert(insertPayload)
          .select("id")
          .single();

        if (resultError) {
          throw resultError;
        }

        if (!resultData?.id) {
          throw new Error("fortune_results insert 성공했으나 id 반환 없음");
        }

        shareId = resultData.id;
        console.log("✅ [CONSULTATION] fortune_results 저장 성공:", shareId);

        // Step 3: fortune_history에 user와 result 연결
        const { error: historyError } = await supabase
          .from("fortune_history")
          .insert({
            user_id: currentUserId,
            profile_id: currentProfileId,
            result_id: shareId,
            fortune_type: fortuneType,
            fortune_date: new Date().toISOString().split("T")[0], // YYYY-MM-DD
          });

        if (historyError) {
          console.error(
            "❌ [CONSULTATION] fortune_history 저장 실패:",
            historyError,
          );
          console.error("  - user_id:", currentUserId);
          console.error("  - profile_id:", currentProfileId);
          console.error("  - result_id:", shareId);
          console.error("  - 에러 상세:", historyError);
          // fortune_results는 이미 저장되었으므로 롤백 불가
          // 에러 로깅만 하고 계속 진행
        } else {
          console.log("✅ [CONSULTATION] fortune_history 저장 성공");
        }
      } catch (saveError: any) {
        console.error("❌ [CONSULTATION] 운세 저장 중 예외 발생:", saveError);
        console.error("  - 에러 메시지:", saveError.message);
        console.error("  - 에러 스택:", saveError.stack);
        // 에러 발생 시에도 클라이언트에는 해석 결과를 반환
      }

      // 9. 성공 응답 반환 (프론트 콘솔 로깅용 geminiInput 포함)
      const systemInstructionText = systemInstruction.parts?.[0]?.text ?? "";
      return new Response(
        JSON.stringify({
          success: true,
          chart: chartData,
          interpretation: interpretation.interpretation,
          fortuneType,
          share_id: shareId || null,
          debugInfo: {
            firdaria: firdariaResult,
            interaction: interactionResult,
            progression: progressionResult,
            direction: directionResult,
          },
          geminiInput: {
            systemInstruction: systemInstructionText,
            userPrompt,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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

      // 두 명의 생년월일을 Date 객체로 변환 (KST -> UTC)
      let birthDateTime1: Date;
      let birthDateTime2: Date;
      try {
        // 사용자1: KST를 UTC로 변환 (Date.UTC 사용)
        const dateMatch1 = user1.birthDate.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
        );
        if (!dateMatch1) {
          throw new Error("Invalid date format for user1");
        }
        const [_, year1, month1, day1, hour1, minute1, second1] = dateMatch1;

        // Date.UTC로 타임스탬프 생성 후 9시간 차감
        const tempUtcTimestamp1 = Date.UTC(
          parseInt(year1),
          parseInt(month1) - 1,
          parseInt(day1),
          parseInt(hour1),
          parseInt(minute1),
          parseInt(second1),
        );
        const kstToUtcTimestamp1 = tempUtcTimestamp1 - 9 * 60 * 60 * 1000;
        birthDateTime1 = new Date(kstToUtcTimestamp1);

        // 사용자2: KST를 UTC로 변환 (Date.UTC 사용)
        const dateMatch2 = user2.birthDate.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
        );
        if (!dateMatch2) {
          throw new Error("Invalid date format for user2");
        }
        const [__, year2, month2, day2, hour2, minute2, second2] = dateMatch2;

        // Date.UTC로 타임스탬프 생성 후 9시간 차감
        const tempUtcTimestamp2 = Date.UTC(
          parseInt(year2),
          parseInt(month2) - 1,
          parseInt(day2),
          parseInt(hour2),
          parseInt(minute2),
          parseInt(second2),
        );
        const kstToUtcTimestamp2 = tempUtcTimestamp2 - 9 * 60 * 60 * 1000;
        birthDateTime2 = new Date(kstToUtcTimestamp2);

        if (
          isNaN(birthDateTime1.getTime()) ||
          isNaN(birthDateTime2.getTime())
        ) {
          throw new Error("Invalid date format");
        }

        console.log(
          `🕐 User1 Timezone 보정 완료: 입력(${hour1}:${minute1} KST) → 변환(${birthDateTime1.toISOString()})`,
        );
        console.log(
          `🕐 User2 Timezone 보정 완료: 입력(${hour2}:${minute2} KST) → 변환(${birthDateTime2.toISOString()})`,
        );
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

      // 두 명의 차트 계산
      let chartData1: ChartData;
      let chartData2: ChartData;
      try {
        chartData1 = await calculateChart(birthDateTime1, {
          lat: user1.lat,
          lng: user1.lng,
        });
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
        chartData2 = await calculateChart(birthDateTime2, {
          lat: user2.lat,
          lng: user2.lng,
        });
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
      const apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
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
      console.log(`🤝 관계 유형: ${relationshipType}`);

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
        undefined, // transitChartData
        undefined, // aspects
        undefined, // transitMoonHouse
        undefined, // solarReturnChartData
        undefined, // profectionData
        undefined, // solarReturnOverlay
        synastryResult, // synastryResult 추가
        undefined, // shortTermPromptSection
        undefined, // timeLordRetrogradeAlert
        undefined, // lordTransitAspects
        undefined, // lordTransitStatus
        undefined, // lordStarConjunctionsText
        relationshipType, // 관계 유형 추가
      );

      if (!interpretation.success || interpretation.error) {
        return new Response(
          JSON.stringify({
            error: `AI interpretation failed: ${
              interpretation.message || "Unknown error"
            }`,
            synastryResult: synastryResult, // 에러 발생 시에도 synastryResult 포함
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Supabase에 운세 저장 (복구용 chart_data 포함)
      let shareId: string | undefined;
      try {
        console.log("💾 [COMPATIBILITY] 운세 저장 시작...");
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
          console.error("에러 상세:", JSON.stringify(insertError, null, 2));
        } else if (insertData) {
          shareId = insertData.id;
          console.log("✅ [COMPATIBILITY] 운세 저장 성공:", shareId);
        } else {
          console.warn("⚠️ [COMPATIBILITY] insertData가 null입니다.");
        }
      } catch (saveError: any) {
        console.error("❌ [COMPATIBILITY] 운세 저장 중 예외 발생:", saveError);
        console.error("에러 스택:", saveError.stack);
      }

      // 성공 응답 반환 (프론트 콘솔 로깅용 userPrompt/systemInstruction/debugInfo 포함)
      console.log(
        `📤 [COMPATIBILITY] 응답 전송 - share_id: ${shareId || "null"}`,
      );
      console.log(
        `🧮 [COMPATIBILITY] Synastry Result 점수: ${synastryResult.overallScore}점`,
      );
      const compatResponse: any = {
        success: true,
        chart: chartData1,
        chart2: chartData2,
        interpretation: interpretation.interpretation,
        fortuneType: fortuneType,
        share_id: shareId || null,
        synastryResult: synastryResult,
      };
      if (interpretation.userPrompt)
        compatResponse.userPrompt = interpretation.userPrompt;
      if (interpretation.systemInstruction)
        compatResponse.systemInstruction = interpretation.systemInstruction;
      if (interpretation.debugInfo)
        compatResponse.debugInfo = interpretation.debugInfo;
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

    // 생년월일을 Date 객체로 변환
    let birthDateTime: Date;
    try {
      // 사용자 입력을 KST(한국 시간, GMT+9)로 간주하고 UTC로 변환
      // 예: 1991-10-23T09:20:00 (KST) -> 1991-10-23T00:20:00Z (UTC)

      // ISO 형식 문자열 파싱: YYYY-MM-DDTHH:mm:ss
      const dateMatch = birthDate.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
      );
      if (!dateMatch) {
        throw new Error("Invalid date format. Expected YYYY-MM-DDTHH:mm:ss");
      }

      const [_, year, month, day, hour, minute, second] = dateMatch;

      // [핵심 수정] Date.UTC()를 사용하여 로컬 타임존 영향 제거
      // 1. 입력된 숫자를 일단 "UTC 기준 시간"으로 만듦 (예: UTC 09:20)
      const tempUtcTimestamp = Date.UTC(
        parseInt(year),
        parseInt(month) - 1, // JavaScript month는 0-based
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
      );

      // 2. 거기서 9시간(KST Offset)을 뺌
      // 원리: "UTC 09:20" - 9시간 = "UTC 00:20" (이게 바로 KST 09:20과 같은 절대 시간)
      const kstToUtcTimestamp = tempUtcTimestamp - 9 * 60 * 60 * 1000;

      // 3. 최종 Date 객체 생성
      birthDateTime = new Date(kstToUtcTimestamp);

      if (isNaN(birthDateTime.getTime())) {
        throw new Error("Invalid date format");
      }

      console.log(
        `🕐 Timezone 보정 완료: 입력(${hour}:${minute} KST) → 변환(${birthDateTime.toISOString()})`,
      );
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

    // 1단계: Natal 차트 계산
    let chartData: ChartData;
    try {
      chartData = await calculateChart(birthDateTime, { lat, lng });
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

    // DAILY 운세의 경우: Transit 차트 및 Aspect 계산
    let transitChartData: ChartData | undefined;
    let aspects: any[] | undefined;
    let transitToTransitAspects: any[] | undefined;
    let transitMoonHouse: number | undefined;

    if (fortuneType === FortuneType.DAILY) {
      try {
        // 현재 시간의 Transit 차트 계산
        const now = new Date();
        transitChartData = await calculateChart(now, { lat, lng });

        // Natal to Transit Aspect 계산
        aspects = calculateAspects(chartData, transitChartData);

        // Transit to Transit Aspect 계산 (모든 트랜짓 행성 쌍 간의 각도)
        transitToTransitAspects =
          calculateTransitToTransitAspects(transitChartData);

        // Transit Moon이 Natal 차트의 몇 번째 하우스에 있는지 계산
        transitMoonHouse = getTransitMoonHouseInNatalChart(
          chartData,
          transitChartData,
        );
      } catch (transitError: any) {
        console.error(
          "⚠️ Transit 차트 계산 실패 (기본 모드로 진행):",
          transitError,
        );
        // Transit 계산 실패 시에도 기본 운세는 제공
      }
    }

    // YEARLY 운세의 경우: Solar Return 차트 및 Profection 계산
    let solarReturnChartData: ChartData | undefined;
    let profectionData: any | undefined;
    let solarReturnOverlay: any | undefined;

    if (fortuneType === FortuneType.YEARLY) {
      try {
        const now = new Date();
        // birthDateTime은 이미 위에서 KST -> UTC 변환됨 (line 982-1016에서 처리)
        // 여기서는 이미 변환된 birthDateTime을 사용

        // 1. 현재 적용 중인 Solar Return 연도 결정
        const solarReturnYear = getActiveSolarReturnYear(birthDateTime, now);
        console.log(`📅 Solar Return Year: ${solarReturnYear}`);

        // 2. Natal 태양의 황경
        const natalSunLongitude = chartData.planets.sun.degree;

        // 3. Solar Return 날짜/시간 계산
        const solarReturnDateTime = calculateSolarReturnDateTime(
          birthDateTime,
          solarReturnYear,
          natalSunLongitude,
        );
        console.log(
          `🌞 Solar Return DateTime: ${solarReturnDateTime.toISOString()}`,
        );

        // 4. Solar Return 차트 계산
        // 하우스 계산을 위해 Timezone Offset을 전달 (경도 기반 계산)
        // 경도 15도 = 1시간, 동경은 +, 서경은 -
        const timezoneOffsetHours = Math.round(lng / 15);
        console.log(
          `🌍 Timezone Offset (경도 ${lng}° 기준): ${timezoneOffsetHours}시간`,
        );

        solarReturnChartData = await calculateChart(
          solarReturnDateTime,
          { lat, lng },
          timezoneOffsetHours, // 하우스 계산용 Timezone Offset
        );

        // 5. Profection 계산 (Solar Return 모드: 단순 연도 차이 사용)
        const natalAscSign = getSignFromLongitude(
          chartData.houses.angles.ascendant,
        ).sign;
        profectionData = calculateProfection(
          birthDateTime,
          solarReturnDateTime,
          natalAscSign,
          true, // isSolarReturn = true: 단순 연도 차이로 나이 계산
        );

        // 6. Solar Return Overlay 계산
        solarReturnOverlay = getSolarReturnOverlays(
          chartData,
          solarReturnChartData,
        );

        console.log(`✅ YEARLY 운세 데이터 계산 완료`);
      } catch (yearlyError: any) {
        console.error("⚠️ YEARLY 운세 계산 실패:", yearlyError);
        // YEARLY 계산 실패 시 에러 반환
        return new Response(
          JSON.stringify({
            error: `YEARLY 운세 계산 실패: ${
              yearlyError.message || "Unknown error"
            }`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

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
    if (fortuneType === FortuneType.DAILY && transitChartData) {
      try {
        const now = new Date();
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
                { isRetrograde?: boolean }
              >
            )?.[lordKey]
          : undefined;
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
        // 연주–항성 회합 (현재 시점, 세차 적용)
        try {
          const { longitude: lordLon, speed: lordSpeed } =
            getPlanetLongitudeAndSpeed(lordKey, now);
          const lordStarConjunctions = getLordOfYearFixedStarConjunctions(
            lordLon,
            lordSpeed,
            lordName,
            now.getFullYear(),
          );
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
          console.log(
            `⚠️ [DAILY] 타임로드 ${lordName} 역행 — [CRITICAL WARNING] 프롬프트 주입`,
          );
        }
      } catch (err: any) {
        console.warn(
          "⚠️ [DAILY] 타임로드/연주 계산 실패 (무시):",
          err?.message,
        );
      }
    }

    // YEARLY: 향후 6개월 단기 이벤트 스캔 (타임로드–항성, 역행/정지)
    let shortTermPromptSection: string | undefined;
    if (fortuneType === FortuneType.YEARLY) {
      try {
        const scanResult = scanShortTermEvents(chartData, new Date(), 6);
        shortTermPromptSection = formatShortTermEventsForPrompt(scanResult);
        console.log(
          `📅 [YEARLY] 6개월 단기 이벤트 ${scanResult.events.length}건 스캔 완료`,
        );
      } catch (scanErr: any) {
        console.warn(
          "⚠️ [YEARLY] 단기 이벤트 스캔 실패 (무시하고 진행):",
          scanErr,
        );
      }
    }

    // 2단계: AI 해석 요청
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const interpretation = await getInterpretation(
      chartData,
      fortuneType,
      apiKey,
      requestData.gender, // gender
      birthDate, // birthDate
      { lat: requestData.lat, lng: requestData.lng }, // location
      undefined,
      transitChartData,
      aspects,
      transitMoonHouse,
      solarReturnChartData,
      profectionData,
      solarReturnOverlay,
      undefined,
      shortTermPromptSection,
      timeLordRetrogradeAlert,
      dailyLordTransitAspects,
      dailyLordTransitStatus,
      dailyLordStarConjunctionsText,
      undefined, // relationshipType
      transitToTransitAspects, // 트랜짓 to 트랜짓 각도
    );

    if (!interpretation.success || interpretation.error) {
      console.error("\n" + "=".repeat(60));
      console.error("❌ AI 해석 실패");
      console.error("=".repeat(60));
      console.error("에러 메시지:", interpretation.message);
      console.error("에러 상세:", interpretation.details);
      console.error("=".repeat(60) + "\n");

      return new Response(
        JSON.stringify({
          error: `AI 해석 실패: ${interpretation.message || "Unknown error"}`,
          details: interpretation.details,
          errorType: "AI_INTERPRETATION_FAILED",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Supabase에 운세 저장 (복구용 chart_data 포함)
    let shareId: string | undefined;
    const chartDataForDb =
      fortuneType === FortuneType.DAILY && transitChartData
        ? {
            chart: chartData,
            transitChart: transitChartData,
            aspects: aspects ?? null,
            transitMoonHouse: transitMoonHouse ?? null,
          }
        : fortuneType === FortuneType.YEARLY
          ? {
              chart: chartData,
              solarReturnChart: solarReturnChartData ?? null,
              profectionData: profectionData ?? null,
              solarReturnOverlay: solarReturnOverlay ?? null,
            }
          : fortuneType === FortuneType.LIFETIME
            ? { chart: chartData }
            : null;

    const profileName = requestData.profileName ?? null;
    try {
      console.log(`💾 [${fortuneType}] 운세 저장 시작...`);
      const { data: insertData, error: insertError } = await supabase
        .from("fortune_results")
        .insert({
          user_info: {
            birthDate: birthDate,
            lat: lat,
            lng: lng,
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
        console.log(`✅ [${fortuneType}] 운세 저장 성공:`, shareId);
      } else {
        console.warn(`⚠️ [${fortuneType}] insertData가 null입니다.`);
      }
    } catch (saveError: any) {
      console.error(`❌ [${fortuneType}] 운세 저장 중 예외 발생:`, saveError);
      console.error("에러 스택:", saveError.stack);
    }

    // 성공 응답 반환
    console.log(
      `📤 [${fortuneType}] 응답 전송 - share_id: ${shareId || "null"}`,
    );
    const responseData: any = {
      success: true,
      chart: chartData,
      interpretation: interpretation.interpretation,
      fortune: interpretation.interpretation, // 프론트 검증용 (interpretation과 동일)
      fortuneType: fortuneType,
      share_id: shareId || null,
    };

    // 디버깅 정보: 최종 프롬프트, Neo4j 컨텍스트, Gemini 원본 응답
    if (interpretation.debugInfo) {
      responseData.debugInfo = interpretation.debugInfo;
    }

    if (fortuneType === FortuneType.DAILY && transitChartData) {
      responseData.transitChart = transitChartData;
      responseData.aspects = aspects;
      responseData.transitMoonHouse = transitMoonHouse;
    }

    if (fortuneType === FortuneType.YEARLY && solarReturnChartData) {
      responseData.solarReturnChart = solarReturnChartData;
      responseData.profectionData = profectionData;
      responseData.solarReturnOverlay = solarReturnOverlay;
    }

    if (interpretation.userPrompt) {
      responseData.userPrompt = interpretation.userPrompt;
    }
    if (interpretation.systemInstruction) {
      responseData.systemInstruction = interpretation.systemInstruction;
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

    return new Response(
      JSON.stringify({
        error: `서버 오류: ${
          error.message || "알 수 없는 오류가 발생했습니다."
        }`,
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
