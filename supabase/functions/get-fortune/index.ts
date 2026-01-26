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
  getLifetimePrompt_Nature,
  getLifetimePrompt_Love,
  getLifetimePrompt_MoneyCareer,
  getLifetimePrompt_HealthTotal,
} from "./geminiPrompts.ts";

// 차트 포맷팅 유틸리티 import
import {
  generateDailyUserPrompt,
  generateYearlyUserPrompt,
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
} from "./utils/astrologyCalculator.ts";

// ========== CORS 헤더 설정 ==========
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ========== AI 해석 관련 함수 ==========
const GEMINI_MODEL_FLASH = "gemini-2.5-flash";
const GEMINI_MODEL_FLASH_LITE = "gemini-2.5-flash-lite";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * 운세 타입에 따라 사용할 Gemini 모델을 반환
 * - DAILY: gemini-2.5-flash-lite (경량 모델)
 * - LIFETIME, YEARLY, COMPATIBILITY: gemini-2.5-flash (표준 모델)
 */
function getGeminiModel(fortuneType: FortuneType): string {
  if (fortuneType === FortuneType.DAILY) {
    return GEMINI_MODEL_FLASH_LITE;
  }
  return GEMINI_MODEL_FLASH;
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
        maxOutputTokens: 2000,
      };
    case FortuneType.COMPATIBILITY:
      return {
        temperature: 0.7,
        // topK: 40,
        // topP: 0.95,
        maxOutputTokens: 8000,
      };
    case FortuneType.YEARLY:
      return {
        temperature: 0.7,
        // topK: 40,
        // topP: 0.95,
        maxOutputTokens: 8000,
      };
    default:
      return {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1023,
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
): string {
  // DAILY 운세의 경우 새로운 상세 프롬프트 사용
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

  // 기존 방식 (LIFETIME, COMPATIBILITY)
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

      // 429 Rate Limit 에러인 경우 재시도
      if (response.status === 429) {
        if (attempt < maxRetries) {
          console.warn(
            `⚠️ 429 Too Many Requests. ${delay}ms 후 재시도합니다... (남은 시도: ${maxRetries - attempt})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // 지수 백오프: 1000ms -> 2000ms -> 4000ms
          continue; // 다음 시도로 진행
        } else {
          // 최대 재시도 횟수 초과
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

      // 429가 아닌 다른 에러 처리
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
          `Gemini API 요청 실패 (${response.status}): ${response.statusText}. ${errorText.substring(0, 200)}`,
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
          `Gemini API error: ${apiResponse.error.message || JSON.stringify(apiResponse.error)}`,
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
      // (429 에러는 위의 response.status === 429에서 처리됨)
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

async function getInterpretation(
  chartData: any,
  fortuneType: FortuneType,
  apiKey: string,
  compatibilityChartData?: any,
  transitChartData?: any,
  aspects?: any[],
  transitMoonHouse?: number,
  solarReturnChartData?: any,
  profectionData?: any,
  solarReturnOverlay?: any,
): Promise<any> {
  try {
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }

    // LIFETIME 운세는 두 번 호출하여 결과 합치기
    if (fortuneType === FortuneType.LIFETIME) {
      return await generateLifetimeFortune(
        chartData,
        apiKey,
        compatibilityChartData,
        transitChartData,
        aspects,
        transitMoonHouse,
      );
    }

    // 기존 로직 (DAILY, YEARLY, COMPATIBILITY)
    const systemInstructionText = getSystemInstruction(fortuneType);

    const systemInstruction = {
      parts: [
        {
          text: systemInstructionText,
        },
      ],
    };

    const userPrompt = buildUserPrompt(
      chartData,
      fortuneType,
      compatibilityChartData,
      transitChartData,
      aspects,
      transitMoonHouse,
      solarReturnChartData,
      profectionData,
      solarReturnOverlay,
    );

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

    return {
      success: true,
      fortuneType: fortuneType,
      interpretation: interpretationText,
      userPrompt: userPrompt, // 제미나이에게 전달한 User Prompt
      systemInstruction: systemInstructionText, // 제미나이에게 전달한 System Instruction
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
  compatibilityChartData?: any,
  transitChartData?: any,
  aspects?: any[],
  transitMoonHouse?: number,
): Promise<any> {
  try {
    // 4개의 System Instruction
    const natureSystemText = getLifetimePrompt_Nature();
    const loveSystemText = getLifetimePrompt_Love();
    const moneyCareerSystemText = getLifetimePrompt_MoneyCareer();
    const healthTotalSystemText = getLifetimePrompt_HealthTotal();

    // User Prompt는 동일하게 사용
    const userPrompt = buildUserPrompt(
      chartData,
      FortuneType.LIFETIME,
      compatibilityChartData,
      transitChartData,
      aspects,
      transitMoonHouse,
    );

    // Nature 요청 본문
    const requestBodyNature = {
      contents: [
        {
          parts: [
            {
              text: userPrompt,
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
        // topK: 40,
        // topP: 0.95,
        maxOutputTokens: 8000,
      },
    };

    // Love 요청 본문
    const requestBodyLove = {
      contents: [
        {
          parts: [
            {
              text: userPrompt,
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
        // topK: 40,
        // topP: 0.95,
        maxOutputTokens: 8000,
      },
    };

    // MoneyCareer 요청 본문
    const requestBodyMoneyCareer = {
      contents: [
        {
          parts: [
            {
              text: userPrompt,
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
        // topK: 40,
        // topP: 0.95,
        maxOutputTokens: 8000,
      },
    };

    // HealthTotal 요청 본문
    const requestBodyHealthTotal = {
      contents: [
        {
          parts: [
            {
              text: userPrompt,
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
        // topK: 40,
        // topP: 0.95,
        maxOutputTokens: 8000,
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

    return {
      success: true,
      fortuneType: FortuneType.LIFETIME,
      interpretation: combinedInterpretation,
      userPrompt: userPrompt,
      systemInstruction: `${natureSystemText}\n\n${loveSystemText}\n\n${moneyCareerSystemText}\n\n${healthTotalSystemText}`, // 네 프롬프트 합친 것
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
      console.error("SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "설정됨" : "누락");
      return new Response(
        JSON.stringify({ error: "서버 설정 오류: Supabase 환경 변수가 필요합니다." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // GET 요청: 공유된 운세 조회
    if (req.method === "GET") {
      // req.url이 상대 경로일 수 있으므로 절대 URL로 변환
      let url: URL;
      try {
        url = new URL(req.url);
      } catch {
        // 상대 경로인 경우 절대 URL로 변환
        const baseUrl = supabaseUrl.replace(/\/rest\/v1$/, '');
        url = new URL(req.url, baseUrl);
      }
      const shareId = url.searchParams.get("id");

      if (!shareId) {
        return new Response(
          JSON.stringify({ error: "id 파라미터가 필요합니다." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Supabase에서 운세 조회
      const { data, error } = await supabase
        .from("fortune_results")
        .select("*")
        .eq("id", shareId)
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

      // 성공 응답 반환
      return new Response(
        JSON.stringify({
          success: true,
          interpretation: data.fortune_text,
          userInfo: data.user_info,
          fortuneType: data.fortune_type || "daily",
          createdAt: data.created_at,
          isShared: true, // 공유된 운세임을 표시
        }),
        {
          status: 200,
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
      };
      fortuneType = reportTypeMap[requestData.reportType] || FortuneType.DAILY;
    } else {
      fortuneType = FortuneType.DAILY;
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

      // 두 명의 생년월일을 Date 객체로 변환
      let birthDateTime1: Date;
      let birthDateTime2: Date;
      try {
        birthDateTime1 = new Date(user1.birthDate);
        birthDateTime2 = new Date(user2.birthDate);
        if (
          isNaN(birthDateTime1.getTime()) ||
          isNaN(birthDateTime2.getTime())
        ) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        return new Response(
          JSON.stringify({
            error:
              "Invalid birthDate format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)",
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
            error: `Chart calculation failed for user1: ${chartError.message || "Unknown error"}`,
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
            error: `Chart calculation failed for user2: ${chartError.message || "Unknown error"}`,
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

      const interpretation = await getInterpretation(
        chartData1,
        fortuneType,
        apiKey,
        chartData2,
      );

      if (!interpretation.success || interpretation.error) {
        return new Response(
          JSON.stringify({
            error: `AI interpretation failed: ${interpretation.message || "Unknown error"}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Supabase에 운세 저장
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

      // 성공 응답 반환
      console.log(`📤 [COMPATIBILITY] 응답 전송 - share_id: ${shareId || 'null'}`);
      return new Response(
        JSON.stringify({
          success: true,
          chart: chartData1,
          chart2: chartData2,
          interpretation: interpretation.interpretation,
          fortuneType: fortuneType,
          share_id: shareId || null, // 공유 ID 추가 (null로 명시)
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
      // ISO 형식 문자열을 Date 객체로 변환
      // 주의: new Date()는 로컬 시간대로 해석할 수 있으므로, UTC로 명시적으로 처리
      birthDateTime = new Date(birthDate);
      if (isNaN(birthDateTime.getTime())) {
        throw new Error("Invalid date format");
      }
    } catch (error) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid birthDate format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)",
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
          error: `Chart calculation failed: ${chartError.message || "Unknown error"}`,
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
    let transitMoonHouse: number | undefined;

    if (fortuneType === FortuneType.DAILY) {
      try {
        // 현재 시간의 Transit 차트 계산
        const now = new Date();
        transitChartData = await calculateChart(now, { lat, lng });

        // Aspect 계산
        aspects = calculateAspects(chartData, transitChartData);

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
        const birthDateTime = new Date(birthDate);
        
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
        console.log(`🌞 Solar Return DateTime: ${solarReturnDateTime.toISOString()}`);
        
        // 4. Solar Return 차트 계산
        solarReturnChartData = await calculateChart(solarReturnDateTime, { lat, lng });
        
        // 5. Profection 계산
        const natalAscSign = getSignFromLongitude(chartData.houses.angles.ascendant).sign;
        profectionData = calculateProfection(
          birthDateTime,
          solarReturnDateTime,
          natalAscSign,
        );
        
        // 6. Solar Return Overlay 계산
        solarReturnOverlay = getSolarReturnOverlays(chartData, solarReturnChartData);
        
        console.log(`✅ YEARLY 운세 데이터 계산 완료`);
      } catch (yearlyError: any) {
        console.error(
          "⚠️ YEARLY 운세 계산 실패:",
          yearlyError,
        );
        // YEARLY 계산 실패 시 에러 반환
        return new Response(
          JSON.stringify({
            error: `YEARLY 운세 계산 실패: ${yearlyError.message || "Unknown error"}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
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
      undefined,
      transitChartData,
      aspects,
      transitMoonHouse,
      solarReturnChartData,
      profectionData,
      solarReturnOverlay,
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

    // Supabase에 운세 저장
    let shareId: string | undefined;
    try {
      console.log(`💾 [${fortuneType}] 운세 저장 시작...`);
      const { data: insertData, error: insertError } = await supabase
        .from("fortune_results")
        .insert({
          user_info: {
            birthDate: birthDate,
            lat: lat,
            lng: lng,
          },
          fortune_text: interpretation.interpretation,
          fortune_type: fortuneType,
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
    console.log(`📤 [${fortuneType}] 응답 전송 - share_id: ${shareId || 'null'}`);
    const responseData: any = {
      success: true,
      chart: chartData,
      interpretation: interpretation.interpretation,
      fortuneType: fortuneType,
      share_id: shareId || null, // 공유 ID 추가 (null로 명시)
    };

    // DAILY 운세의 경우 추가 정보 포함
    if (fortuneType === FortuneType.DAILY && transitChartData) {
      responseData.transitChart = transitChartData;
      responseData.aspects = aspects;
      responseData.transitMoonHouse = transitMoonHouse;
    }

    // YEARLY 운세의 경우 추가 정보 포함
    if (fortuneType === FortuneType.YEARLY && solarReturnChartData) {
      responseData.solarReturnChart = solarReturnChartData;
      responseData.profectionData = profectionData;
      responseData.solarReturnOverlay = solarReturnOverlay;
    }

    // 제미나이에게 전달한 프롬프트 정보 포함 (디버깅용)
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
        error: `서버 오류: ${error.message || "알 수 없는 오류가 발생했습니다."}`,
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
