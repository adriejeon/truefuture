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

// 생성 중복 방지 락 유효 시간 (이 시간이 지나면 죽은 락으로 간주하고 재시도 허용)
const GENERATION_LOCK_TTL_MS = 4 * 60 * 1000;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ===== Gemini (Vertex) 호출 =====

function parseGeminiResponse(apiResponse: any): string {
  if (!apiResponse?.candidates?.length) {
    throw new Error("Invalid API response: no candidates returned.");
  }
  const candidate = apiResponse.candidates[0];
  if (candidate.finishReason === "MAX_TOKENS") {
    console.warn("⚠️ Response truncated due to MAX_TOKENS limit.");
  } else if (candidate.finishReason && candidate.finishReason !== "STOP") {
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
    return { text: parseGeminiResponse(data), usage };
  }
}

// ===== 질문 분해 (구조화 출력) =====

async function decomposeQuestion(question: string): Promise<SubQuestion[]> {
  try {
    const requestBody = {
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
    const { text } = await callGemini(GEMINI_FLASH_MODEL, requestBody);
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed?.sub_questions) ? parsed.sub_questions : [];
    const subs: SubQuestion[] = items
      .map((it: any) => (typeof it?.text === "string" ? it.text.trim() : ""))
      .filter((t: string) => t.length > 0)
      .slice(0, 5)
      .map((t: string, i: number) => ({ id: i + 1, text: t }));
    if (subs.length > 0) return subs;
  } catch (e) {
    console.warn("⚠️ 질문 분해 실패 — 원문 단일 질문으로 처리:", e);
  }
  return [{ id: 1, text: question }];
}

// ===== 섹션 생성 =====
// 한 HTTP 요청은 Gemini 호출을 1번만 수행한다 (엣지 워커 리소스 한도 회피).
// 검증 실패 시 문제 목록을 VALIDATION: 접두 에러로 던지고, 호출부(handleGenerate)가
// pending_fix 로 저장 → 다음 generate 요청이 교정 지시를 붙여 재생성한다.

async function generateValidated(
  systemText: string,
  userPrompt: string,
  ctx: SectionValidationContext,
  correctiveProblems: string[] | null,
): Promise<{ text: string; usage: GeminiUsage | null }> {
  let sys = systemText;
  if (correctiveProblems && correctiveProblems.length > 0) {
    sys +=
      "\n\n### [재생성 교정 지시 — 반드시 반영]\n" +
      "직전 원고가 아래 검증에 실패했습니다. 전체 원고를 처음부터 다시 작성하되, 아래 문제를 모두 해결하십시오:\n" +
      correctiveProblems.map((p) => `- ${p}`).join("\n");
  }

  const result = await callGemini(GEMINI_PRO_MODEL, {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: sys }] },
    generationConfig: {
      temperature: 0.7,
      topK: 50,
      topP: 0.95,
      maxOutputTokens: 32768,
    },
  });

  const verdict = validateSection(result.text, ctx);
  if (!verdict.ok) {
    throw new Error(`VALIDATION:${JSON.stringify(verdict.problems.slice(0, 12))}`);
  }
  return result;
}

/** 연도 제목 문자열: "2026년 (9월~12월, 만 34~35세)" */
function yearHeading(l: { year: number; partial: string | null; ages: string }): string {
  return l.partial
    ? `${l.year}년 (${l.partial}, ${l.ages})`
    : `${l.year}년 (${l.ages})`;
}

async function generateSection(
  sectionIndex: number,
  snapshot: ProfileSnapshot,
  question: string | null,
  subQuestions: SubQuestion[] | null,
  baseDate: Date,
  priorContent: string,
  correctiveProblems: string[] | null,
): Promise<{ text: string; usage: GeminiUsage | null }> {
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
    return await generateValidated(systemText, userPrompt, ctx, correctiveProblems);
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
    return await generateValidated(systemText, userPrompt, ctx, correctiveProblems);
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
  return await generateValidated(systemText, userPrompt, ctx, correctiveProblems);
}

// ===== 액션 핸들러 =====

async function handlePurchase(
  supabaseAdmin: any,
  userId: string,
  body: any,
): Promise<Response> {
  const merchantUid = typeof body.merchant_uid === "string" ? body.merchant_uid.trim() : "";
  const impUid = typeof body.imp_uid === "string" ? body.imp_uid.trim() : "";
  const profileId = typeof body.profile_id === "string" ? body.profile_id.trim() : "";
  let question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (question.length > QUESTION_MAX_LENGTH) {
    question = question.substring(0, QUESTION_MAX_LENGTH);
  }
  // 프롬프트 구분자 오염 방지
  question = question.replace(/"""/g, '"');

  if (!merchantUid && !impUid) {
    return json(400, { success: false, error: "결제 식별자(merchant_uid)가 필요합니다." });
  }
  if (!profileId) {
    return json(400, { success: false, error: "profile_id는 필수입니다." });
  }

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
  try {
    let payment: any = null;
    let lastLookupError = "";
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
      if (paymentResponse.status !== 404) break;
      console.warn(`⚠️ PortOne 결제 조회 404 (id=${candidate}) — 다음 후보 ID로 재시도`);
    }
    if (!payment) {
      throw new Error(lastLookupError || "결제 정보 조회 실패");
    }
    if (payment.status !== "PAID") {
      return json(400, {
        success: false,
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
    return json(500, {
      success: false,
      error: `결제 정보 확인에 실패했습니다. ${err instanceof Error ? err.message : ""}`,
    });
  }

  // 프로필 조회 (소유자 검증 포함) → 스냅샷
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, name, birth_date, birth_time, gender, city_name, lat, lng, timezone")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    return json(404, { success: false, error: "프로필을 찾을 수 없습니다." });
  }
  if (!profile.birth_date || profile.lat == null || profile.lng == null) {
    return json(400, { success: false, error: "프로필에 출생 정보가 부족합니다." });
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

  const { data: report, error: fetchError } = await supabaseAdmin
    .from("premium_reports")
    .select(
      "id, user_id, status, sections_total, sections_done, content, question, question_breakdown, profile_snapshot, generation_lock_at, created_at, generation_attempts, pending_fix",
    )
    .eq("id", reportId)
    .maybeSingle();

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
    return json(500, {
      success: false,
      error: "리포트 생성이 반복 실패했습니다. 고객센터에 문의해 주시면 확인 후 처리해 드리겠습니다.",
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
    return json(409, {
      success: false,
      locked: true,
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

    const { text: sectionText, usage } = await generateSection(
      sectionIndex,
      snapshot,
      question,
      subQuestions,
      baseDate,
      report.content ?? "",
      correctiveProblems,
    );

    const newContent = report.content
      ? `${report.content}\n\n${sectionText}`
      : sectionText;
    const newSectionsDone = sectionIndex + 1;
    const isDone = newSectionsDone >= report.sections_total;

    const { error: updateError } = await supabaseAdmin
      .from("premium_reports")
      .update({
        content: newContent,
        sections_done: newSectionsDone,
        status: isDone ? "DONE" : "GENERATING",
        error_message: null,
        pending_fix: null,
        generation_lock_at: null,
      })
      .eq("id", reportId);

    if (updateError) {
      console.error("❌ 리포트 저장 실패:", updateError);
      throw new Error("생성된 리포트 저장에 실패했습니다.");
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

    return json(200, {
      success: true,
      done: isDone,
      sectionsDone: newSectionsDone,
      sectionsTotal: report.sections_total,
      usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";

    // ① 일시 오류 (쿼터·과부하): 상태 유지, 락 해제 → 클라이언트 루프가 잠시 후 재호출
    if (message.startsWith("TRANSIENT:")) {
      console.warn(`⏳ 리포트 섹션 ${sectionIndex} 일시 오류 — 다음 요청에서 재시도:`, message);
      await supabaseAdmin
        .from("premium_reports")
        .update({ status: "GENERATING", generation_lock_at: null })
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

    // ② 원고 검증 실패: 문제 목록 저장 → 다음 요청이 교정 지시를 붙여 재생성
    //    (직전 시도도 교정 재생성이었으면 이 섹션은 2회 연속 실패 → FAILED)
    if (message.startsWith("VALIDATION:")) {
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

    console.error(`❌ 리포트 섹션 ${sectionIndex} 생성 실패:`, err);
    await supabaseAdmin
      .from("premium_reports")
      .update({
        status: "FAILED",
        error_message: message.substring(0, 500),
        generation_lock_at: null,
      })
      .eq("id", reportId);
    return json(500, {
      success: false,
      error:
        "리포트 생성 중 일시적인 오류가 발생했습니다. 결제는 안전하게 처리되었으니, 잠시 후 '이어서 생성하기'를 눌러 주세요.",
    });
  }
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
    return json(400, { success: false, error: `알 수 없는 action: ${action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("❌ [premium-report] 예외:", error);
    return json(500, { success: false, error: message });
  }
});
