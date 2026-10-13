// Supabase Edge Function - 프리미엄 상세 리포트 (15,000원 단건 결제 상품)
//
// 액션 (POST JSON { action, ... }, 로그인 필수):
//   - purchase: PortOne 결제 검증 → premium_reports 행 생성 → { reportId } 반환
//   - generate: 다음 미완료 섹션 1개를 Gemini Pro(Vertex)로 생성해 이어붙임 → { done, sectionsDone }
//     (클라이언트가 done=true 가 될 때까지 반복 호출; 실패 시 무료 재시도 가능)
//
// 리포트 본문은 3개 파트로 순차 생성된다:
//   Part 1: 타고난 본성과 그릇 (기질·성격 구조·재능·격)
//   Part 2: 삶의 영역별 정밀 감정 (직업·재물·연애/결혼·건강)
//   Part 3: 시기 추론(생시 기반: 피르다리·프로펙션·디렉션·프로그레션·솔라리턴) + 질문 심층 풀이 + 총평
//
// 계산층은 get-fortune 의 유틸리티를 그대로 재사용한다 (계산-게이팅 원칙 준수).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  buildBaseData,
  buildNatalBasePrompt,
  buildTimingPrompt,
  buildTenYearTimingData,
  buildCompactNatalBlock,
  isLoveTopicQuestion,
} from "./reportData.ts";
import type { ProfileSnapshot } from "./reportData.ts";
import {
  getVertexAccessToken,
  buildVertexUrl,
  normalizeVertexRequest,
  logVertexRequestShape,
} from "../_shared/vertex.ts";
import {
  getPremiumPrompt_Part1,
  getPremiumPrompt_Part2,
  getPremiumPrompt_Part3,
  QUESTION_DECOMPOSE_SYSTEM,
} from "./premiumPrompts.ts";
import type { SubQuestion } from "./premiumPrompts.ts";
import { validateSection } from "./reportValidation.ts";
import type { SectionValidationContext } from "./reportValidation.ts";
import {
  OPENAI_MODEL,
  OPENAI_TIER_CONFIG,
  LlmError,
  LlmSession,
  resolveLlmRouting,
  isLlmVariant,
  groundingGuard,
  hashGeminiBody,
  sha256Hex,
  usageFromGemini,
  callOpenAIText,
  sanitizeErrorMessage,
} from "../_shared/llm.ts";
import type { LlmRouting, LlmRun, LlmErrorKind } from "../_shared/llm.ts";
import { decodeCustomQuestion } from "../_shared/customData.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ===== 상품 정의 (서버가 단일 진실 공급원) =====
const REPORT_PRICE_KRW = 18000;
// 가격 인상 전환기: 캐시된 구버전 클라이언트가 이전 가격으로 결제한 경우도 유효 처리
// (실결제가 이미 승인된 뒤 검증되므로, 알던 가격이면 거절 대신 수용하는 것이 고객 보호)
const ACCEPTED_PRICES_KRW = [18000, 15000];
const REPORT_PRODUCT_NAME = "프리미엄 상세 리포트 (Premium_Report)";
const SECTIONS_TOTAL = 3;
const QUESTION_MAX_LENGTH = 500;

// 플래그십 유료 상품 → Pro 모델 고정 (품질 우선, flash 폴백 없음)
const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
// 질문 분해(구조화 출력) 등 보조 작업용 경량 모델
const GEMINI_FLASH_MODEL = "gemini-3.5-flash";

/** premium_reports.llm_state */
interface ReportLlmState {
  variant?: string;
  isTest?: boolean;
  fallbackSection?: number;
  fallbackReason?: LlmErrorKind;
}

// 생성 중복 방지 락 유효 시간 (이 시간이 지나면 죽은 락으로 간주하고 재시도 허용)
const GENERATION_LOCK_TTL_MS = 4 * 60 * 1000;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ===== Gemini (Vertex) 호출 =====

/** 재생성해도 결과가 달라지지 않는 종료 사유 (안전성/저작권 차단 등) */
const FATAL_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "IMAGE_SAFETY",
]);

/** MAX_TOKENS 로 잘린 원고에 붙일 교정 지시 */
const MAX_TOKENS_FIX =
  "직전 원고가 최대 길이 제한에 걸려 마무리 소제목까지 도달하지 못하고 중간에서 끊겼습니다 — 분량을 줄이고 마무리 소제목까지 완결할 것";

function parseGeminiResponse(apiResponse: any): string {
  if (!apiResponse?.candidates?.length) {
    // 안전성 차단 등으로 후보 자체가 비어 온 경우 → 재생성이 무의미
    const blockReason = apiResponse?.promptFeedback?.blockReason;
    throw new Error(
      `FATAL: Invalid API response: no candidates returned.${
        blockReason ? ` (blockReason=${blockReason})` : ""
      }`,
    );
  }
  const candidate = apiResponse.candidates[0];
  if (candidate.finishReason === "MAX_TOKENS") {
    // 잘린 원고를 통과시키면 마무리 없는 리포트가 저장된다 → 교정 재생성 1회를 태운다
    console.warn("⚠️ Response truncated due to MAX_TOKENS limit — 교정 재생성으로 처리합니다.");
    throw new Error(`VALIDATION:${JSON.stringify([MAX_TOKENS_FIX])}`);
  }
  if (candidate.finishReason && FATAL_FINISH_REASONS.has(String(candidate.finishReason))) {
    throw new Error(`FATAL: API response finished with reason: ${candidate.finishReason}`);
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`API response finished with reason: ${candidate.finishReason}`);
  }
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Invalid API response: missing content parts.");
  }
  let text = parts
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("Invalid API response: empty text content.");
  text = text.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return text;
}

interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

/**
 * Vertex Gemini 호출 (non-stream).
 * - 429: 지수 백오프 재시도 (최대 3회)
 * - 503/과부하: 3s → 8s 대기 후 같은 모델로 재시도 (유료 리포트이므로 품질 하향 폴백 없음)
 * - usageMetadata(토큰 사용량)를 함께 반환·로깅 (원가 모니터링용)
 */
async function callGemini(
  modelName: string,
  requestBody: any,
): Promise<{ text: string; usage: GeminiUsage | null }> {
  const endpoint = buildVertexUrl(modelName, "generateContent");
  const normalizedBody = normalizeVertexRequest(requestBody);
  logVertexRequestShape(normalizedBody, {
    model: modelName,
    method: "generateContent",
  });

  // 요청 내 재시도는 최소화 (엣지 워커 리소스 한도 — 긴 대기·중복 생성은 다음 HTTP 요청이 수행)
  const overloadDelays = [3000];
  let overloadAttempt = 0;
  let rateAttempt = 0;

  while (true) {
    const accessToken = await getVertexAccessToken();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(normalizedBody),
    });

    if (response.status === 503) {
      const errorText = await response.text();
      if (overloadAttempt < overloadDelays.length) {
        console.warn(
          `⚠️ Gemini 503 (overloaded). ${overloadDelays[overloadAttempt]}ms 후 재시도...`,
        );
        await new Promise((r) => setTimeout(r, overloadDelays[overloadAttempt]));
        overloadAttempt++;
        continue;
      }
      throw new Error(
        `TRANSIENT: Gemini 503 Service Unavailable: ${errorText.substring(0, 150)}`,
      );
    }

    if (response.status === 429) {
      if (rateAttempt < 1) {
        console.warn(`⚠️ 429 Too Many Requests. 10s 후 재시도...`);
        await new Promise((r) => setTimeout(r, 10000));
        rateAttempt++;
        continue;
      }
      const errorText = await response.text();
      // 분당 쿼터 소진 — 다음 요청에서 이어가도록 일시 오류로 표시
      throw new Error(
        `TRANSIENT: Gemini Quota Exceeded (429): ${errorText.substring(0, 150)}`,
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Gemini API 요청 실패 (${response.status}):`, errorText.substring(0, 500));
      throw new Error(
        `Gemini API Error (${response.status}): ${errorText.substring(0, 200)}`,
      );
    }

    const data = await response.json();
    const usage: GeminiUsage | null = data?.usageMetadata ?? null;
    if (usage) {
      console.log(
        JSON.stringify({
          logType: "PREMIUM_REPORT_USAGE",
          model: modelName,
          promptTokenCount: usage.promptTokenCount ?? 0,
          candidatesTokenCount: usage.candidatesTokenCount ?? 0,
          thoughtsTokenCount: usage.thoughtsTokenCount ?? 0,
          totalTokenCount: usage.totalTokenCount ?? 0,
        }),
      );
    }
    try {
      return { text: parseGeminiResponse(data), usage };
    } catch (e) {
      // 파싱 실패(MAX_TOKENS·차단 등)에도 과금된 사용량을 기록할 수 있게 붙여 보낸다
      if (e && typeof e === "object") (e as { usage?: GeminiUsage | null }).usage = usage;
      throw e;
    }
  }
}

// ===== 질문 분해 (구조화 출력) =====

/** 질문 분해 요청 body (운영·비교 테스트 공용) */
function buildDecomposeBody(question: string) {
  return {
    contents: [{ role: "user", parts: [{ text: `신청서 질문 원문:\n"""\n${question}\n"""` }] }],
    systemInstruction: { parts: [{ text: QUESTION_DECOMPOSE_SYSTEM }] },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          sub_questions: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        },
        required: ["sub_questions"],
      },
    },
  };
}

function parseSubQuestions(text: string): SubQuestion[] {
  const parsed = JSON.parse(text);
  const items = Array.isArray(parsed?.sub_questions) ? parsed.sub_questions : [];
  return items
    .map((it: any) => (typeof it?.text === "string" ? it.text.trim() : ""))
    .filter((t: string) => t.length > 0)
    .slice(0, 5)
    .map((t: string, i: number) => ({ id: i + 1, text: t }));
}

async function decomposeQuestion(question: string): Promise<SubQuestion[]> {
  try {
    const { text } = await callGemini(GEMINI_FLASH_MODEL, buildDecomposeBody(question));
    const subs = parseSubQuestions(text);
    if (subs.length > 0) return subs;
  } catch (e) {
    console.warn("⚠️ 질문 분해 실패 — 원문 단일 질문으로 처리:", e);
  }
  return [{ id: 1, text: question }];
}

// ===== 섹션 생성 =====
// 한 HTTP 요청은 LLM 본문 생성을 1번만 수행하는 것이 원칙이다 (엣지 워커 리소스 한도 회피).
// 검증 실패 시 문제 목록을 VALIDATION: 접두 에러로 던지고, 호출부(handleGenerate)가
// pending_fix 로 저장 → 다음 generate 요청이 교정 지시를 붙여 재생성한다.
// (예외: OpenAI 가 빨리 실패하면 같은 요청 안에서 Gemini 로 1회 폴백한다 — 아래 generateSectionText)

interface SectionPrompt {
  systemText: string;
  userPrompt: string;
  ctx: SectionValidationContext;
}

function withCorrective(systemText: string, correctiveProblems: string[] | null): string {
  if (!correctiveProblems || correctiveProblems.length === 0) return systemText;
  return (
    systemText +
    "\n\n### [재생성 교정 지시 — 반드시 반영]\n" +
    "직전 원고가 아래 검증에 실패했습니다. 전체 원고를 처음부터 다시 작성하되, 아래 문제를 모두 해결하십시오:\n" +
    correctiveProblems.map((p) => `- ${p}`).join("\n")
  );
}

function buildSectionGeminiBody(prompt: SectionPrompt, extraSystem = "") {
  return {
    contents: [{ role: "user", parts: [{ text: prompt.userPrompt }] }],
    systemInstruction: { parts: [{ text: prompt.systemText + extraSystem }] },
    generationConfig: {
      temperature: 0.7,
      topK: 50,
      topP: 0.95,
      maxOutputTokens: 32768,
    },
  };
}

/** OpenAI 리포트 섹션: 출력 상한 = 기존 본문 상한 32k + medium 추론 여유분 */
const OPENAI_REPORT_MAX_OUTPUT_TOKENS = 64000;
/** 비스트리밍 응답이라 게이트웨이 유휴 한도(약 150초)와 생성 락 TTL(4분)보다 짧게 잡는다 */
const OPENAI_REPORT_TIMEOUT_MS = 140_000;
/** 이 시간 안에 OpenAI 가 실패하면 같은 요청에서 Gemini 로 폴백, 넘으면 다음 요청으로 넘긴다 */
const REPORT_INLINE_FALLBACK_WINDOW_MS = 30_000;

/** 기록용 오류 문구: 검증 문제 목록(사용자 질문 일부 포함 가능)은 개수만 남긴다 */
function recordableGeminiError(message: string): string {
  if (message.startsWith("VALIDATION:")) {
    try {
      return `형식 검증 실패 ${JSON.parse(message.substring("VALIDATION:".length)).length}건`;
    } catch {
      return "형식 검증 실패";
    }
  }
  return message.substring(0, 300);
}

/** 에러 메시지 접두사 → 기록용 오류 종류 */
function kindFromGeminiError(message: string): LlmErrorKind {
  if (message.startsWith("FATAL:")) return "refusal";
  if (message.startsWith("VALIDATION:")) return message.includes("최대 길이") ? "incomplete" : "validation";
  return "api";
}

/**
 * 섹션 본문 생성.
 * - run 이 없으면(운영 기본 Gemini) 기존과 동일하게 Gemini Pro 1회 + 검증.
 * - run 이 있으면 공급자 라우팅·기록:
 *     openai: gpt-6.1-sol(medium) → 검증 → 실패 시 Gemini Pro 폴백
 *             (빨리 실패한 경우만 같은 요청에서, 아니면 PROVIDER_FALLBACK: 으로 다음 요청에 넘김)
 *     gemini / gemini-3.8: 심층 호출이라 둘 다 Gemini Pro
 * - 안전상 거절은 폴백하지 않고 FATAL: 로 기존 차단 흐름에 태운다.
 */
async function generateSectionText(
  prompt: SectionPrompt,
  llm: { session: LlmSession; run: LlmRun; forceGemini: boolean } | null,
  language = "ko",
): Promise<{ text: string; usage: GeminiUsage | null }> {
  if (!llm) {
    const result = await callGemini(GEMINI_PRO_MODEL, buildSectionGeminiBody(prompt));
    const verdict = validateSection(result.text, prompt.ctx);
    if (!verdict.ok) {
      throw new Error(`VALIDATION:${JSON.stringify(verdict.problems.slice(0, 12))}`);
    }
    return result;
  }

  const { session, run } = llm;
  const guard = groundingGuard(language);
  const body = buildSectionGeminiBody(prompt, guard);
  run.promptHash = await hashGeminiBody(body);
  const startedAt = Date.now();

  if (session.routing.variant === "openai" && !llm.forceGemini) {
    const attempt = run.begin("openai", OPENAI_MODEL, OPENAI_TIER_CONFIG.deep.effort);
    try {
      const text = await callOpenAIText(
        {
          model: OPENAI_MODEL,
          prompt: { instructions: prompt.systemText + guard, input: [{ role: "user", content: prompt.userPrompt }] },
          effort: OPENAI_TIER_CONFIG.deep.effort,
          maxOutputTokens: OPENAI_REPORT_MAX_OUTPUT_TOKENS,
          timeoutMs: OPENAI_REPORT_TIMEOUT_MS,
          promptCacheKey: `truefuture:premium_report:${prompt.ctx.sectionIndex}`,
          safetyIdentifier: session.userId
            ? (await sha256Hex(`tf:${session.userId}`)).substring(0, 32)
            : undefined,
        },
        attempt,
      );
      const verdict = validateSection(text, prompt.ctx);
      if (!verdict.ok) {
        // 문제 문구에 사용자 질문 일부가 들어갈 수 있어 기록에는 개수만 남긴다
        throw new LlmError("validation", `형식 검증 실패 ${verdict.problems.length}건`);
      }
      attempt.succeed();
      run.finish(text);
      return { text, usage: null };
    } catch (e) {
      const err = e instanceof LlmError
        ? e
        : new LlmError("api", sanitizeErrorMessage((e as Error)?.message ?? String(e)));
      attempt.fail(err);
      if (err.kind === "refusal") {
        run.finish(null);
        throw new Error(`FATAL: OpenAI ${err.message}`);
      }
      run.fallbackReason = err.kind;
      if (Date.now() - startedAt > REPORT_INLINE_FALLBACK_WINDOW_MS) {
        // 워커 실행 한도 보호: 이번 요청은 여기서 끝내고 다음 요청이 Gemini 로 생성
        run.finish(null);
        throw new Error(`PROVIDER_FALLBACK:${err.kind}`);
      }
      console.warn(
        JSON.stringify({
          logType: "LLM_FALLBACK",
          feature: run.feature,
          part: run.part,
          from: `openai:${OPENAI_MODEL}`,
          to: `gemini:${GEMINI_PRO_MODEL}`,
          reason: err.kind,
        }),
      );
    }
  }

  const g = run.begin("gemini", GEMINI_PRO_MODEL);
  try {
    const result = await callGemini(GEMINI_PRO_MODEL, body);
    g.setUsage(usageFromGemini(result.usage));
    const verdict = validateSection(result.text, prompt.ctx);
    if (!verdict.ok) {
      throw new Error(`VALIDATION:${JSON.stringify(verdict.problems.slice(0, 12))}`);
    }
    g.succeed();
    run.finish(result.text);
    return result;
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    const usage = (e as { usage?: GeminiUsage | null })?.usage;
    if (usage) g.setUsage(usageFromGemini(usage));
    g.fail(new LlmError(kindFromGeminiError(message), recordableGeminiError(message)));
    run.finish(null);
    throw e;
  }
}

/** 연도 제목 문자열: "2026년 (9월~12월, 만 34~35세)" */
function yearHeading(l: { year: number; partial: string | null; ages: string }): string {
  return l.partial
    ? `${l.year}년 (${l.partial}, ${l.ages})`
    : `${l.year}년 (${l.ages})`;
}

async function buildSectionPrompt(
  sectionIndex: number,
  snapshot: ProfileSnapshot,
  question: string | null,
  subQuestions: SubQuestion[] | null,
  baseDate: Date,
  priorContent: string,
  correctiveProblems: string[] | null,
): Promise<SectionPrompt> {
  const base = await buildBaseData(snapshot);
  const questionTopic = question ? question.substring(0, 120) : null;
  // 연애·결혼 질문이면 에로스 랏 방출(애정 궤도)을 시기 데이터에 추가 주입
  const includeEros = isLoveTopicQuestion(question);

  if (sectionIndex === 0) {
    // 파트 1: 상담 도입 + 질문 답변 + 배경 성향
    const systemText = getPremiumPrompt_Part1(subQuestions);
    const questionBlock = question
      ? `\n\n[신청서 질문 원문]\n"""\n${question}\n"""`
      : "";
    const userPrompt =
      buildNatalBasePrompt(base, snapshot) +
      "\n\n" +
      (await buildTimingPrompt(base, snapshot, { includeEros })) +
      questionBlock +
      "\n\n위 데이터를 근거로 리포트 파트 1을 작성해 주세요.";
    const ctx: SectionValidationContext = {
      sectionIndex: 0,
      subQuestions,
      expectedYears: [],
    };
    return { systemText: withCorrective(systemText, correctiveProblems), userPrompt, ctx };
  }

  // 파트 2·3: 10년 시기 데이터
  const tenYear = await buildTenYearTimingData(base, snapshot, baseDate, { includeEros });
  const splitAt = 6; // 전반부 6개 연도 / 후반부 나머지 (11개 달력 연도 기준 6+5)
  const part2Labels = tenYear.yearLabels.slice(0, splitAt);
  const part3Labels = tenYear.yearLabels.slice(splitAt);

  if (sectionIndex === 1) {
    const systemText = getPremiumPrompt_Part2(
      part2Labels.map(yearHeading),
      questionTopic,
    );
    const userPrompt =
      buildCompactNatalBlock(base, snapshot) +
      "\n\n" +
      tenYear.buildYearsBlock(part2Labels.map((l) => l.year)) +
      `\n\n(참고: 이 파트에서는 ${part2Labels[0].year}~${part2Labels[part2Labels.length - 1].year}년을 다루고, 나머지 연도(${part3Labels[0].year}~${part3Labels[part3Labels.length - 1].year}년)는 다음 파트에서 이어집니다. 전체 흐름 요약에서는 10년 전체(${tenYear.startYear}~${tenYear.endYear}년)를 조망하십시오.)` +
      "\n\n위 데이터를 근거로 리포트 파트 2를 작성해 주세요.";
    const ctx: SectionValidationContext = {
      sectionIndex: 1,
      subQuestions,
      expectedYears: part2Labels.map((l) => l.year),
    };
    return { systemText: withCorrective(systemText, correctiveProblems), userPrompt, ctx };
  }

  // 파트 3: 앞 파트의 전체 흐름 요약을 발췌해 모순 없이 이어가게 함
  let part2Summary = "";
  const summaryMatch = priorContent.match(
    /##\s*앞으로 10년의 전체 흐름[\s\S]*?(?=##\s*연도별 상세 흐름)/,
  );
  if (summaryMatch) {
    part2Summary = summaryMatch[0].substring(0, 2500);
  } else {
    part2Summary = priorContent.substring(Math.max(0, priorContent.length - 2000));
  }

  const systemText = getPremiumPrompt_Part3(
    part3Labels.map(yearHeading),
    questionTopic,
    part2Summary,
  );
  const userPrompt =
    buildCompactNatalBlock(base, snapshot) +
    "\n\n" +
    tenYear.buildYearsBlock(part3Labels.map((l) => l.year)) +
    "\n\n위 데이터를 근거로 리포트 파트 3을 작성해 주세요.";
  const ctx: SectionValidationContext = {
    sectionIndex: 2,
    subQuestions,
    expectedYears: part3Labels.map((l) => l.year),
  };
  return { systemText: withCorrective(systemText, correctiveProblems), userPrompt, ctx };
}

// ===== 액션 핸들러 =====

async function handlePurchase(
  supabaseAdmin: any,
  userId: string,
  body: any,
): Promise<Response> {
  const merchantUid = typeof body.merchant_uid === "string" ? body.merchant_uid.trim() : "";
  const impUid = typeof body.imp_uid === "string" ? body.imp_uid.trim() : "";
  let profileId = typeof body.profile_id === "string" ? body.profile_id.trim() : "";
  let question =
    typeof body.question === "string" ? body.question.trim() : "";

  /** 질문 문자열 정규화 (길이 제한 + 프롬프트 구분자 오염 방지) */
  const sanitizeQuestion = (q: string): string => {
    let out = q.trim();
    if (out.length > QUESTION_MAX_LENGTH) out = out.substring(0, QUESTION_MAX_LENGTH);
    return out.replace(/"""/g, '"');
  };
  question = sanitizeQuestion(question);

  if (!merchantUid && !impUid) {
    return json(400, { success: false, error: "결제 식별자(merchant_uid)가 필요합니다." });
  }
  // profile_id 는 결제 조회 후 customData 로도 복원할 수 있으므로 여기서 막지 않는다.

  // 결제 ID 형식 검증 (report_/order_ 접두사 또는 UUID)
  const isUuid = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const idOk = (id: string) =>
    !id || id.startsWith("report_") || id.startsWith("order_") || id.startsWith("imp_") || isUuid(id);
  if (!idOk(merchantUid) || !idOk(impUid)) {
    return json(400, { success: false, error: "잘못된 결제 정보 형식입니다." });
  }

  // 중복 결제 확인 (이미 처리된 결제면 기존 리포트 반환 → 모바일 리다이렉트 재진입 대응)
  const dedupeKey = merchantUid || impUid;
  const { data: existing } = await supabaseAdmin
    .from("premium_reports")
    .select("id, user_id, status")
    .eq("merchant_uid", dedupeKey)
    .maybeSingle();
  if (existing) {
    if (existing.user_id !== userId) {
      return json(403, { success: false, error: "이미 다른 계정에서 처리된 결제입니다." });
    }
    return json(200, {
      success: true,
      reportId: existing.id,
      alreadyProcessed: true,
    });
  }

  // PortOne V2 서버사이드 결제 검증 (금액·통화·상태)
  const portoneApiSecret = Deno.env.get("PORTONE_API_SECRET");
  if (!portoneApiSecret) {
    return json(500, {
      success: false,
      error: "서버 설정 오류: PortOne API Secret이 필요합니다.",
    });
  }

  // 조회 ID 우선순위: 우리가 생성한 결제 ID(report_…) → 클라이언트가 보낸 imp_uid → merchant_uid.
  // 모바일 리다이렉트 복귀 시 구버전 클라이언트가 PortOne 거래번호(txId)를 imp_uid 로 보내는데,
  // 그 값으로 조회하면 PAYMENT_NOT_FOUND(404) 가 난다 → 404 이면 다음 후보로 재시도한다.
  const lookupIds = [
    ...new Set(
      [merchantUid.startsWith("report_") ? merchantUid : "", impUid, merchantUid].filter(Boolean),
    ),
  ];
  let paymentId = lookupIds[0];
  let paidAmount = REPORT_PRICE_KRW;
  let payment: any = null;
  try {
    let lastLookupError = "";
    let allNotFound = true;
    for (const candidate of lookupIds) {
      const paymentResponse = await fetch(
        `https://api.portone.io/payments/${encodeURIComponent(candidate)}`,
        { method: "GET", headers: { Authorization: `PortOne ${portoneApiSecret}` } },
      );
      if (paymentResponse.ok) {
        payment = await paymentResponse.json();
        paymentId = candidate;
        break;
      }
      const errorText = await paymentResponse.text();
      lastLookupError = `결제 정보 조회 실패 (${paymentResponse.status}): ${errorText.substring(0, 200)}`;
      if (paymentResponse.status !== 404) {
        allNotFound = false;
        break;
      }
      console.warn(`⚠️ PortOne 결제 조회 404 (id=${candidate}) — 다음 후보 ID로 재시도`);
    }
    if (!payment) {
      // 모든 후보가 404 → 결제 자체가 없음(사용자 오조회/결제 미생성)
      if (allNotFound) {
        console.warn("⚠️ PortOne 결제 정보 없음:", lookupIds.join(", "));
        return json(404, {
          success: false,
          code: "PAYMENT_NOT_FOUND",
          error: "결제 정보를 찾을 수 없습니다. 결제가 되었다면 고객센터로 문의해 주세요.",
        });
      }
      // 그 외(5xx/네트워크 등) → PortOne 일시 장애
      console.error("❌ PortOne 결제 조회 실패:", lastLookupError);
      return json(502, {
        success: false,
        code: "PORTONE_UNAVAILABLE",
        error: `결제 정보 확인에 실패했습니다. ${lastLookupError}`,
      });
    }
    if (payment.status !== "PAID") {
      return json(400, {
        success: false,
        code: "NOT_PAID",
        error: `결제가 완료되지 않았습니다. (상태: ${payment.status})`,
      });
    }
    const verifiedAmount = payment.amount?.total;
    const verifiedCurrency = (payment.amount?.currency || "KRW").toUpperCase();
    if (verifiedCurrency !== "KRW" || !ACCEPTED_PRICES_KRW.includes(verifiedAmount)) {
      console.error(
        `❌ 리포트 결제 금액 불일치: ${verifiedAmount} ${verifiedCurrency} (허용: ${ACCEPTED_PRICES_KRW.join("/")} KRW) — 자동 취소 시도`,
      );
      // 이미 승인된 결제이므로 고객 보호를 위해 자동 취소
      let cancelled = false;
      try {
        const cancelRes = await fetch(
          `https://api.portone.io/payments/${encodeURIComponent(payment.id ?? paymentId)}/cancel`,
          {
            method: "POST",
            headers: {
              Authorization: `PortOne ${portoneApiSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reason: "상품 가격 불일치 자동 취소 (진짜미래 프리미엄 리포트)" }),
          },
        );
        cancelled = cancelRes.ok;
        if (!cancelRes.ok) {
          console.error("❌ 자동 취소 실패:", cancelRes.status, (await cancelRes.text()).substring(0, 200));
        }
      } catch (cancelErr) {
        console.error("❌ 자동 취소 예외:", cancelErr);
      }
      return json(400, {
        success: false,
        code: "AMOUNT_MISMATCH",
        cancelled,
        error: cancelled
          ? "결제 금액이 현재 상품 가격과 달라 결제를 자동 취소했습니다. 페이지를 새로고침한 뒤 다시 결제해 주세요."
          : "결제 금액이 상품 가격과 일치하지 않습니다. 결제가 되었다면 자동 환불 처리되며, 문제가 지속되면 고객센터로 문의해 주세요.",
      });
    }
    if (verifiedAmount !== REPORT_PRICE_KRW) {
      console.warn(
        JSON.stringify({
          logType: "PREMIUM_REPORT_LEGACY_PRICE",
          paidAmount: verifiedAmount,
          currentPrice: REPORT_PRICE_KRW,
          note: "가격 전환기 구버전 클라이언트 결제 수용",
        }),
      );
    }
    paidAmount = verifiedAmount;
    if (payment.id) paymentId = payment.id;
  } catch (err) {
    console.error("❌ PortOne 결제 검증 실패:", err);
    return json(502, {
      success: false,
      code: "PORTONE_UNAVAILABLE",
      error: `결제 정보 확인에 실패했습니다. ${err instanceof Error ? err.message : ""}`,
    });
  }

  // 결제 시 심어둔 customData 로 누락된 신청 정보 복원
  // (모바일 리다이렉트 복귀 등으로 클라이언트 상태가 날아간 경우 대비)
  //   customData = '{"k":"report","u":"<user_id>","p":"<profile_id>","qe":"<base64url 질문>"}'
  //   (구버전 결제는 평문 "q" — decodeCustomQuestion 이 둘 다 처리)
  try {
    const raw = payment?.customData;
    if ((typeof raw === "string" && raw.trim()) || (raw && typeof raw === "object")) {
      // SDK 가 객체를 직렬화해 보내지만, 클라이언트가 문자열을 넘겨 이중 인코딩된 경우도 방어
      let custom: any = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typeof custom === "string") custom = JSON.parse(custom);
      if (typeof custom?.u === "string" && custom.u && custom.u !== userId) {
        console.error(`❌ customData 사용자 불일치: custom=${custom.u}, jwt=${userId}`);
        return json(403, {
          success: false,
          code: "USER_MISMATCH",
          error: "이미 다른 계정에서 결제된 건입니다.",
        });
      }
      if (!profileId && typeof custom?.p === "string" && custom.p.trim()) {
        profileId = custom.p.trim();
        console.log("ℹ️ customData 에서 profile_id 복원");
      }
      if (!question) {
        const restored = decodeCustomQuestion(custom);
        if (restored) {
          question = sanitizeQuestion(restored);
          console.log("ℹ️ customData 에서 question 복원");
        }
      }
    }
  } catch (customErr) {
    // 파싱 실패는 무시하고 아래 필수값 검증 흐름으로 넘어간다
    console.warn("⚠️ customData 파싱 실패 (무시):", customErr);
  }

  if (!profileId) {
    return json(400, { success: false, error: "profile_id는 필수입니다." });
  }

  // 프로필 조회 (소유자 검증 포함) → 스냅샷
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, name, birth_date, birth_time, gender, city_name, lat, lng, timezone")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    return json(404, {
      success: false,
      code: "PROFILE_NOT_FOUND",
      error: "프로필을 찾을 수 없습니다.",
    });
  }
  if (!profile.birth_date || profile.lat == null || profile.lng == null) {
    return json(400, {
      success: false,
      code: "PROFILE_INCOMPLETE",
      error: "프로필에 출생 정보가 부족합니다.",
    });
  }

  const snapshot: ProfileSnapshot = {
    name: profile.name,
    birth_date: String(profile.birth_date).substring(0, 19),
    birth_time: profile.birth_time,
    gender: profile.gender,
    city_name: profile.city_name,
    lat: profile.lat,
    lng: profile.lng,
    timezone: profile.timezone,
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("premium_reports")
    .insert({
      user_id: userId,
      profile_id: profile.id,
      profile_snapshot: snapshot,
      question: question || null,
      status: "PAID",
      sections_total: SECTIONS_TOTAL,
      sections_done: 0,
      content: "",
      merchant_uid: dedupeKey,
      payment_id: paymentId,
      amount: paidAmount,
      currency: "KRW",
    })
    .select("id")
    .single();

  if (insertError) {
    // UNIQUE 충돌 = 동시 요청 → 기존 행 반환
    if (String(insertError.code) === "23505") {
      const { data: dup } = await supabaseAdmin
        .from("premium_reports")
        .select("id, user_id")
        .eq("merchant_uid", dedupeKey)
        .maybeSingle();
      if (dup && dup.user_id === userId) {
        return json(200, { success: true, reportId: dup.id, alreadyProcessed: true });
      }
    }
    console.error("❌ premium_reports insert 실패:", insertError);
    return json(500, {
      success: false,
      error: "리포트 생성 준비에 실패했습니다. 결제는 완료되었으니 고객센터에 문의해주세요.",
    });
  }

  console.log(
    JSON.stringify({
      logType: "PREMIUM_REPORT_PURCHASE",
      reportId: inserted.id,
      merchantUid: dedupeKey,
      product: REPORT_PRODUCT_NAME,
    }),
  );

  return json(200, { success: true, reportId: inserted.id });
}

async function handleGenerate(
  supabaseAdmin: any,
  userId: string,
  body: any,
): Promise<Response> {
  const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
  if (!reportId) {
    return json(400, { success: false, error: "report_id는 필수입니다." });
  }

  const REPORT_COLUMNS =
    "id, user_id, status, sections_total, sections_done, content, question, question_breakdown, profile_snapshot, generation_lock_at, created_at, generation_attempts, pending_fix";
  let { data: report, error: fetchError } = await supabaseAdmin
    .from("premium_reports")
    .select(`${REPORT_COLUMNS}, llm_state`)
    .eq("id", reportId)
    .maybeSingle();
  // llm_state 컬럼 마이그레이션(20261013) 적용 전에 배포된 경우에도 기존 생성은 계속 동작해야 한다
  if (fetchError && /llm_state/.test(String(fetchError.message ?? ""))) {
    console.warn("⚠️ premium_reports.llm_state 컬럼 없음 — 마이그레이션 적용 전, LLM 라우팅 없이 진행");
    ({ data: report, error: fetchError } = await supabaseAdmin
      .from("premium_reports")
      .select(REPORT_COLUMNS)
      .eq("id", reportId)
      .maybeSingle());
  }

  if (fetchError || !report) {
    return json(404, { success: false, error: "리포트를 찾을 수 없습니다." });
  }
  if (report.user_id !== userId) {
    return json(403, { success: false, error: "본인의 리포트만 생성할 수 있습니다." });
  }
  if (report.status === "DONE") {
    return json(200, {
      success: true,
      done: true,
      sectionsDone: report.sections_done,
      sectionsTotal: report.sections_total,
    });
  }

  // 무한 재시도 방지: 누적 시도 상한 (섹션 3개 + 검증/일시오류 재시도 여유분)
  const attempts = Number(report.generation_attempts ?? 0);
  if (attempts >= 15) {
    await supabaseAdmin
      .from("premium_reports")
      .update({
        status: "FAILED",
        error_message: "생성 시도 횟수 상한 초과 — 고객센터에 문의해 주세요.",
        generation_lock_at: null,
      })
      .eq("id", reportId);
    // 결제는 이미 완료된 건이므로 HTTP 오류가 아니라 "실패 상태"로 알린다 (클라이언트가 안내만 표시)
    return json(200, {
      success: false,
      failed: true,
      retryable: false,
      code: "CAPPED",
      error: "리포트 생성이 반복 실패했습니다. 고객센터에 문의해 주시면 확인 후 처리해 드리겠습니다.",
      sectionsDone: report.sections_done,
      sectionsTotal: report.sections_total,
    });
  }

  // 원자적 락 획득: 락이 없거나 TTL이 지난 경우에만 통과
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - GENERATION_LOCK_TTL_MS).toISOString();
  const { data: locked, error: lockError } = await supabaseAdmin
    .from("premium_reports")
    .update({
      generation_lock_at: nowIso,
      status: "GENERATING",
      generation_attempts: attempts + 1,
    })
    .eq("id", reportId)
    .or(`generation_lock_at.is.null,generation_lock_at.lt.${staleIso}`)
    .select("id, sections_done")
    .maybeSingle();

  if (lockError) {
    console.error("❌ 생성 락 획득 실패:", lockError);
    return json(500, { success: false, error: "리포트 생성 준비에 실패했습니다." });
  }
  if (!locked) {
    // 남은 락 TTL(초) — 클라이언트가 재시도 간격을 정하는 데 사용
    const lockedAtMs = report.generation_lock_at
      ? new Date(report.generation_lock_at).getTime()
      : NaN;
    const remainMs = Number.isFinite(lockedAtMs)
      ? lockedAtMs + GENERATION_LOCK_TTL_MS - Date.now()
      : GENERATION_LOCK_TTL_MS;
    const lockedForSeconds = Math.max(
      0,
      Math.min(Math.ceil(GENERATION_LOCK_TTL_MS / 1000), Math.ceil(remainMs / 1000)),
    );
    return json(409, {
      success: false,
      locked: true,
      lockedForSeconds,
      error: "이미 리포트를 생성하는 중입니다. 잠시 후 자동으로 이어집니다.",
    });
  }

  const sectionIndex = Number(locked.sections_done ?? report.sections_done) || 0;
  if (sectionIndex >= report.sections_total) {
    // 방어: 이미 모든 섹션 완료 → DONE 마킹
    await supabaseAdmin
      .from("premium_reports")
      .update({ status: "DONE", generation_lock_at: null })
      .eq("id", reportId);
    return json(200, {
      success: true,
      done: true,
      sectionsDone: sectionIndex,
      sectionsTotal: report.sections_total,
    });
  }

  // ── LLM 공급자: 리포트 단위로 고정 (섹션마다 공급자가 섞이지 않게) ──
  const llmState: ReportLlmState = (report.llm_state && typeof report.llm_state === "object")
    ? report.llm_state as ReportLlmState
    : {};
  let routing: LlmRouting;
  if (isLlmVariant(llmState.variant)) {
    routing = { variant: llmState.variant, isTest: !!llmState.isTest };
  } else {
    routing = await resolveLlmRouting(supabaseAdmin, userId, body.llmProvider);
    if (routing.isTest || routing.variant !== "gemini") {
      llmState.variant = routing.variant;
      llmState.isTest = routing.isTest;
      await supabaseAdmin.from("premium_reports").update({ llm_state: llmState }).eq("id", reportId);
    }
  }
  const routed = routing.isTest || routing.variant !== "gemini";
  const llmSession = routed ? new LlmSession(routing, userId) : null;
  const llmRun = llmSession ? llmSession.newRun("premium_report_section", `section_${sectionIndex}`) : null;
  // 직전 요청에서 OpenAI 가 실패해 이 섹션을 Gemini 로 넘기기로 한 경우
  const deferredFallback = llmState.fallbackSection === sectionIndex;
  if (llmRun && deferredFallback) llmRun.fallbackReason = llmState.fallbackReason ?? "api";

  try {
    const snapshot = report.profile_snapshot as ProfileSnapshot;
    const question: string | null = report.question ?? null;

    // 질문 분해 (최초 1회, 구조화 저장 → 검증에 사용)
    let subQuestions: SubQuestion[] | null = Array.isArray(report.question_breakdown)
      ? (report.question_breakdown as SubQuestion[])
      : null;
    if (question && (!subQuestions || subQuestions.length === 0)) {
      subQuestions = await decomposeQuestion(question);
      await supabaseAdmin
        .from("premium_reports")
        .update({ question_breakdown: subQuestions })
        .eq("id", reportId);
      console.log(
        JSON.stringify({
          logType: "PREMIUM_REPORT_QUESTION_BREAKDOWN",
          reportId,
          count: subQuestions.length,
        }),
      );
    }
    if (!question) subQuestions = null;

    // 리포트 기준일 = 구매 시점 (재시도해도 불변)
    const baseDate = new Date(report.created_at);

    // 직전 시도의 검증 실패 항목 (있으면 교정 지시로 사용)
    const correctiveProblems: string[] | null = Array.isArray(report.pending_fix)
      ? (report.pending_fix as string[])
      : null;

    const sectionPrompt = await buildSectionPrompt(
      sectionIndex,
      snapshot,
      question,
      subQuestions,
      baseDate,
      report.content ?? "",
      correctiveProblems,
    );
    const { text: sectionText, usage } = await generateSectionText(
      sectionPrompt,
      llmSession && llmRun ? { session: llmSession, run: llmRun, forceGemini: deferredFallback } : null,
    );

    const newContent = report.content
      ? `${report.content}\n\n${sectionText}`
      : sectionText;
    const newSectionsDone = sectionIndex + 1;
    const isDone = newSectionsDone >= report.sections_total;

    // 내가 잡은 락이 그대로일 때에만 저장한다.
    // (TTL 초과로 죽은 락 취급되어 다른 요청이 이미 이어받았다면 이 결과는 버린다 — 섹션 중복 방지)
    const { data: saved, error: updateError } = await supabaseAdmin
      .from("premium_reports")
      .update({
        content: newContent,
        sections_done: newSectionsDone,
        status: isDone ? "DONE" : "GENERATING",
        error_message: null,
        pending_fix: null,
        generation_lock_at: null,
        // 폴백 지시는 해당 섹션이 끝나면 지운다 (variant 는 유지)
        ...(routed && deferredFallback
          ? { llm_state: { variant: llmState.variant, isTest: llmState.isTest } }
          : {}),
      })
      .eq("id", reportId)
      .eq("generation_lock_at", nowIso)
      .select("id");

    if (updateError) {
      console.error("❌ 리포트 저장 실패:", updateError);
      throw new Error("생성된 리포트 저장에 실패했습니다.");
    }

    if (!Array.isArray(saved) || saved.length === 0) {
      console.warn(
        JSON.stringify({
          logType: "PREMIUM_REPORT_STALE_LOCK_DISCARD",
          reportId,
          sectionIndex,
          note: "락이 이미 다른 요청에 넘어가 이번 결과는 저장하지 않음",
        }),
      );
      await llmSession?.persist(supabaseAdmin, {
        premiumReportId: reportId,
        sectionIndex,
        outcome: "failed",
      });
      return json(200, {
        success: true,
        done: false,
        stale: true,
        sectionsDone: sectionIndex,
        sectionsTotal: report.sections_total,
      });
    }

    console.log(
      JSON.stringify({
        logType: "PREMIUM_REPORT_SECTION_DONE",
        reportId,
        sectionIndex,
        sectionChars: sectionText.length,
        done: isDone,
        usage,
      }),
    );

    await llmSession?.persist(supabaseAdmin, {
      premiumReportId: reportId,
      sectionIndex,
      outcome: "saved",
    });
    const llmMeta = llmSession?.publicSummary() ?? null;

    return json(200, {
      success: true,
      done: isDone,
      sectionsDone: newSectionsDone,
      sectionsTotal: report.sections_total,
      usage,
      ...(llmMeta ? { llm: llmMeta } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await llmSession?.persist(supabaseAdmin, {
      premiumReportId: reportId,
      sectionIndex,
      outcome: "failed",
    });

    // ⓪ OpenAI 가 늦게 실패: 이번 요청은 끝내고, 다음 요청이 이 섹션을 Gemini 로 생성한다
    if (message.startsWith("PROVIDER_FALLBACK:")) {
      const reason = message.substring("PROVIDER_FALLBACK:".length) as LlmErrorKind;
      await supabaseAdmin
        .from("premium_reports")
        .update({
          status: "GENERATING",
          generation_lock_at: null,
          llm_state: { ...llmState, fallbackSection: sectionIndex, fallbackReason: reason },
        })
        .eq("id", reportId)
        // 내 락이 그대로일 때만 (그사이 다른 요청이 락을 이어받았다면 건드리지 않는다)
        .eq("generation_lock_at", nowIso);
      return json(200, {
        success: true,
        done: false,
        revalidate: true,
        sectionsDone: sectionIndex,
        sectionsTotal: report.sections_total,
      });
    }

    /** FAILED 로 마킹 (무료 재시도가 다시 2회 기회를 갖도록 pending_fix 는 비운다) */
    const markFailed = async () => {
      await supabaseAdmin
        .from("premium_reports")
        .update({
          status: "FAILED",
          error_message: message.substring(0, 500),
          generation_lock_at: null,
          pending_fix: null,
        })
        .eq("id", reportId);
    };

    // ① 일시 오류 (쿼터·과부하): 상태 유지, 락 해제 → 클라이언트 루프가 잠시 후 재호출
    //    시도 횟수도 되감아 일시 오류가 상한(15회)을 소모하지 않게 한다.
    if (message.startsWith("TRANSIENT:")) {
      console.warn(`⏳ 리포트 섹션 ${sectionIndex} 일시 오류 — 다음 요청에서 재시도:`, message);
      await supabaseAdmin
        .from("premium_reports")
        .update({
          status: "GENERATING",
          generation_lock_at: null,
          generation_attempts: attempts,
        })
        .eq("id", reportId);
      return json(200, {
        success: true,
        done: false,
        transient: true,
        waitSeconds: 20,
        sectionsDone: sectionIndex,
        sectionsTotal: report.sections_total,
      });
    }

    // ② 재생성이 무의미한 차단 (안전성/저작권 등): 즉시 실패 확정
    if (message.startsWith("FATAL:")) {
      console.error(
        JSON.stringify({
          logType: "PREMIUM_REPORT_FATAL_BLOCK",
          reportId,
          sectionIndex,
          message: message.substring(0, 300),
        }),
      );
      await markFailed();
      return json(200, {
        success: false,
        failed: true,
        retryable: false,
        code: "SAFETY",
        error:
          "입력하신 질문 내용 때문에 리포트를 생성할 수 없습니다. 고객센터로 문의해 주시면 확인 후 처리해 드리겠습니다.",
        sectionsDone: sectionIndex,
        sectionsTotal: report.sections_total,
      });
    }

    // ③ 원고 검증 실패: 문제 목록 저장 → 다음 요청이 교정 지시를 붙여 재생성
    //    (직전 시도도 교정 재생성이었으면 이 섹션은 2회 연속 실패 → FAILED)
    let failCode: "GENERATION" | "VALIDATION" = "GENERATION";
    if (message.startsWith("VALIDATION:")) {
      failCode = "VALIDATION";
      let problems: string[] = [];
      try {
        problems = JSON.parse(message.substring("VALIDATION:".length));
      } catch (_) {
        problems = [message.substring(0, 300)];
      }
      console.warn(
        JSON.stringify({
          logType: "PREMIUM_REPORT_VALIDATION_RETRY",
          reportId,
          sectionIndex,
          hadCorrective: !!(report.pending_fix && (report.pending_fix as string[]).length),
          problems,
        }),
      );
      const alreadyRetried = Array.isArray(report.pending_fix) && report.pending_fix.length > 0;
      if (!alreadyRetried) {
        await supabaseAdmin
          .from("premium_reports")
          .update({ status: "GENERATING", pending_fix: problems, generation_lock_at: null })
          .eq("id", reportId);
        return json(200, {
          success: true,
          done: false,
          revalidate: true,
          sectionsDone: sectionIndex,
          sectionsTotal: report.sections_total,
        });
      }
      // 교정 재생성까지 실패 → FAILED (무료 재시도 시 pending_fix 를 갖고 다시 시도)
    }

    // ④ 최종 실패: 결제는 이미 완료된 건이므로 HTTP 500 이 아니라 "실패 상태"로 알린다.
    //    status 는 FAILED 로 기록되고 사용자는 무료로 다시 시도할 수 있다.
    console.error(`❌ 리포트 섹션 ${sectionIndex} 생성 실패:`, err);
    await markFailed();
    return json(200, {
      success: false,
      failed: true,
      retryable: true,
      code: failCode,
      error:
        "리포트 생성 중 일시적인 오류가 발생했습니다. 결제는 안전하게 처리되었으니, 잠시 후 '이어서 생성하기'를 눌러 주세요.",
      sectionsDone: sectionIndex,
      sectionsTotal: report.sections_total,
    });
  }
}

// ===== 비교 테스트 액션 (admin_users 전용, 결제·리포트 행과 무관한 무상태 호출) =====

/** 질문 나누기 비교 대상 (운영 기본은 GEMINI_FLASH_MODEL 그대로) */
const DECOMPOSE_TEST_MODELS = new Set([
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
]);

async function requireTestRouting(
  supabaseAdmin: any,
  userId: string,
  requested: unknown,
): Promise<LlmRouting | null> {
  const routing = await resolveLlmRouting(supabaseAdmin, userId, requested ?? "gemini");
  return routing.isTest ? routing : null;
}

/**
 * test_section: 본인 프로필로 리포트 섹션 1개를 생성해 원고·검증 결과·사용량을 돌려준다.
 * premium_reports 에 저장하지 않으며, 폴백 없이 선택한 공급자의 결과만 돌려준다
 * (allow_fallback: true 면 운영과 같은 폴백 규칙 적용 — 결과의 llm.runs[].finalProvider 로 구분).
 * body: { profile_id, section_index(0~2), llmProvider, question?, sub_questions?, prior_content?, base_date?, allow_fallback? }
 */
async function handleTestSection(supabaseAdmin: any, userId: string, body: any): Promise<Response> {
  const routing = await requireTestRouting(supabaseAdmin, userId, body.llmProvider);
  if (!routing) return json(403, { success: false, error: "테스트 권한이 없습니다." });

  const sectionIndex = Number(body.section_index);
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= SECTIONS_TOTAL) {
    return json(400, { success: false, error: "section_index 는 0~2 입니다." });
  }
  const profileId = typeof body.profile_id === "string" ? body.profile_id.trim() : "";
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, name, birth_date, birth_time, gender, city_name, lat, lng, timezone")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.birth_date || profile.lat == null || profile.lng == null) {
    return json(404, { success: false, error: "본인 소유의 완전한 프로필이 필요합니다." });
  }
  const snapshot: ProfileSnapshot = {
    name: profile.name,
    birth_date: String(profile.birth_date).substring(0, 19),
    birth_time: profile.birth_time,
    gender: profile.gender,
    city_name: profile.city_name,
    lat: profile.lat,
    lng: profile.lng,
    timezone: profile.timezone,
  };
  const question = typeof body.question === "string" && body.question.trim()
    ? body.question.trim().substring(0, QUESTION_MAX_LENGTH).replace(/"""/g, '"')
    : null;
  const subQuestions: SubQuestion[] | null = question
    ? (Array.isArray(body.sub_questions) && body.sub_questions.length > 0
      ? body.sub_questions
      : [{ id: 1, text: question }])
    : null;
  const baseDate = typeof body.base_date === "string" && !isNaN(Date.parse(body.base_date))
    ? new Date(body.base_date)
    : new Date();

  const prompt = await buildSectionPrompt(
    sectionIndex,
    snapshot,
    question,
    subQuestions,
    baseDate,
    typeof body.prior_content === "string" ? body.prior_content : "",
    null,
  );

  const session = new LlmSession(routing, userId);
  const run = session.newRun("premium_report_section", `section_${sectionIndex}`);
  const allowFallback = body.allow_fallback === true;
  let text: string | null = null;
  let error: string | null = null;
  try {
    if (allowFallback) {
      text = (await generateSectionText(prompt, { session, run, forceGemini: false })).text;
    } else {
      // 폴백·검증 예외 없이 선택한 공급자의 원고를 그대로 받는다 (검증 결과는 따로 반환)
      text = await generateSectionRaw(prompt, session, run);
    }
  } catch (e) {
    error = sanitizeErrorMessage((e as Error)?.message ?? String(e));
  }
  const validation = text ? validateSection(text, prompt.ctx) : null;
  await session.persist(supabaseAdmin, { sectionIndex, outcome: "test" });

  // 차트 일치 검사용: 출생 차트의 행성 사인만 돌려준다 (본인 프로필)
  const base = await buildBaseData(snapshot);
  const natalSigns: Record<string, string> = {};
  for (const [k, v] of Object.entries(base.chartData?.planets ?? {})) {
    if (v && typeof (v as { sign?: string }).sign === "string") natalSigns[k] = (v as { sign: string }).sign;
  }

  return json(200, {
    success: !!text,
    sectionIndex,
    text,
    error,
    validation,
    natalSigns,
    llm: session.publicSummary(),
  });
}

/** 테스트용: 선택한 공급자 1회 호출 (폴백·검증 없음) */
async function generateSectionRaw(prompt: SectionPrompt, session: LlmSession, run: LlmRun): Promise<string> {
  const guard = groundingGuard("ko");
  const body = buildSectionGeminiBody(prompt, guard);
  run.promptHash = await hashGeminiBody(body);
  if (session.routing.variant === "openai") {
    const attempt = run.begin("openai", OPENAI_MODEL, OPENAI_TIER_CONFIG.deep.effort);
    try {
      const text = await callOpenAIText(
        {
          model: OPENAI_MODEL,
          prompt: { instructions: prompt.systemText + guard, input: [{ role: "user", content: prompt.userPrompt }] },
          effort: OPENAI_TIER_CONFIG.deep.effort,
          maxOutputTokens: OPENAI_REPORT_MAX_OUTPUT_TOKENS,
          timeoutMs: OPENAI_REPORT_TIMEOUT_MS,
          promptCacheKey: `truefuture:premium_report:${prompt.ctx.sectionIndex}`,
        },
        attempt,
      );
      attempt.succeed();
      run.finish(text);
      return text;
    } catch (e) {
      const err = e instanceof LlmError ? e : new LlmError("api", String((e as Error)?.message ?? e));
      attempt.fail(err);
      run.finish(null);
      throw err;
    }
  }
  const g = run.begin("gemini", GEMINI_PRO_MODEL);
  try {
    const result = await callGemini(GEMINI_PRO_MODEL, body);
    g.setUsage(usageFromGemini(result.usage));
    g.succeed();
    run.finish(result.text);
    return result.text;
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    const usage = (e as { usage?: GeminiUsage | null })?.usage;
    if (usage) g.setUsage(usageFromGemini(usage));
    g.fail(new LlmError(kindFromGeminiError(message), recordableGeminiError(message)));
    run.finish(null);
    throw e;
  }
}

/**
 * test_decompose: 같은 질문을 여러 모델로 나눠 보고 결과·시간·사용량·비용을 비교한다.
 * body: { question, models?: string[] }
 */
async function handleTestDecompose(supabaseAdmin: any, userId: string, body: any): Promise<Response> {
  const routing = await requireTestRouting(supabaseAdmin, userId, "gemini");
  if (!routing) return json(403, { success: false, error: "테스트 권한이 없습니다." });
  const question = typeof body.question === "string" ? body.question.trim().substring(0, QUESTION_MAX_LENGTH) : "";
  if (!question) return json(400, { success: false, error: "question 이 필요합니다." });
  const models: string[] = (Array.isArray(body.models) ? body.models : ["gemini-3.5-flash", "gemini-2.5-flash-lite"])
    .filter((m: unknown) => typeof m === "string" && DECOMPOSE_TEST_MODELS.has(m));

  const session = new LlmSession(routing, userId);
  const results = [];
  for (const model of models) {
    const run = session.newRun("premium_report_decompose", model);
    const a = run.begin("gemini", model);
    try {
      const { text, usage } = await callGemini(model, buildDecomposeBody(question));
      a.setUsage(usageFromGemini(usage));
      const subQuestions = parseSubQuestions(text);
      a.succeed();
      run.finish(text);
      results.push({ model, subQuestions, ...run.summary() });
    } catch (e) {
      const message = sanitizeErrorMessage((e as Error)?.message ?? String(e));
      a.fail(new LlmError("api", message));
      run.finish(null);
      results.push({ model, error: message, ...run.summary() });
    }
  }
  await session.persist(supabaseAdmin, { outcome: "test" });
  return json(200, { success: true, results });
}

// ===== 서버 =====

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json(500, {
        success: false,
        error: "서버 설정 오류: Supabase 환경 변수가 필요합니다.",
      });
    }

    // JWT에서 인증 사용자 추출 (필수)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json(401, { success: false, error: "로그인이 필요합니다." });
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser(token);
    if (!user?.id) {
      return json(401, { success: false, error: "로그인 정보가 유효하지 않습니다." });
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "purchase") {
      return await handlePurchase(supabaseAdmin, user.id, body);
    }
    if (action === "generate") {
      return await handleGenerate(supabaseAdmin, user.id, body);
    }
    if (action === "test_section") {
      return await handleTestSection(supabaseAdmin, user.id, body);
    }
    if (action === "test_decompose") {
      return await handleTestDecompose(supabaseAdmin, user.id, body);
    }
    return json(400, { success: false, error: `알 수 없는 action: ${action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("❌ [premium-report] 예외:", error);
    return json(500, { success: false, error: message });
  }
});
