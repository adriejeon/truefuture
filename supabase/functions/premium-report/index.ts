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
} from "./premiumPrompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ===== 상품 정의 (서버가 단일 진실 공급원) =====
const REPORT_PRICE_KRW = 15000;
const REPORT_PRODUCT_NAME = "프리미엄 상세 리포트 (Premium_Report)";
const SECTIONS_TOTAL = 3;
const QUESTION_MAX_LENGTH = 500;

// 플래그십 유료 상품 → Pro 모델 고정 (품질 우선, flash 폴백 없음)
const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";

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
 * - 503/과부하: 3s → 8s 대기 후 Pro 모델로 재시도 (유료 리포트이므로 flash 폴백 없이 Pro 고정)
 * - usageMetadata(토큰 사용량)를 함께 반환·로깅 (원가 모니터링용)
 */
async function callGeminiPro(
  requestBody: any,
): Promise<{ text: string; usage: GeminiUsage | null }> {
  const endpoint = buildVertexUrl(GEMINI_PRO_MODEL, "generateContent");
  const normalizedBody = normalizeVertexRequest(requestBody);
  logVertexRequestShape(normalizedBody, {
    model: GEMINI_PRO_MODEL,
    method: "generateContent",
  });

  const overloadDelays = [3000, 8000];
  let overloadAttempt = 0;
  let rateDelay = 1000;
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
          `⚠️ Gemini Pro 503 (overloaded). ${overloadDelays[overloadAttempt]}ms 후 재시도...`,
        );
        await new Promise((r) => setTimeout(r, overloadDelays[overloadAttempt]));
        overloadAttempt++;
        continue;
      }
      throw new Error(
        `Gemini API 503 Service Unavailable: ${errorText.substring(0, 200)}`,
      );
    }

    if (response.status === 429) {
      if (rateAttempt < 3) {
        console.warn(`⚠️ 429 Too Many Requests. ${rateDelay}ms 후 재시도...`);
        await new Promise((r) => setTimeout(r, rateDelay));
        rateDelay *= 2;
        rateAttempt++;
        continue;
      }
      const errorText = await response.text();
      throw new Error(
        `Gemini API Quota Exceeded (429): ${errorText.substring(0, 200)}`,
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
          model: GEMINI_PRO_MODEL,
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

// ===== 섹션 생성 =====

async function generateSection(
  sectionIndex: number,
  snapshot: ProfileSnapshot,
  question: string | null,
): Promise<{ text: string; usage: GeminiUsage | null }> {
  const base = await buildBaseData(snapshot);

  let systemText: string;
  let userPrompt: string;

  if (sectionIndex === 0) {
    systemText = getPremiumPrompt_Part1();
    userPrompt =
      buildNatalBasePrompt(base, snapshot) +
      "\n\n위 데이터를 근거로 리포트 파트 1(소제목 1~4)을 작성해 주세요.";
  } else if (sectionIndex === 1) {
    systemText = getPremiumPrompt_Part2();
    userPrompt =
      buildNatalBasePrompt(base, snapshot) +
      "\n\n위 데이터를 근거로 리포트 파트 2(소제목 5~8)를 작성해 주세요.";
  } else {
    systemText = getPremiumPrompt_Part3(question);
    userPrompt =
      (await buildTimingPrompt(base, snapshot)) +
      "\n\n위 데이터를 근거로 리포트 파트 3(소제목 9~12)을 작성해 주세요.";
  }

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemText }] },
    generationConfig: {
      temperature: 0.85,
      topK: 50,
      topP: 0.95,
      maxOutputTokens: 16000,
    },
  };

  return await callGeminiPro(requestBody);
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

  let paymentId = impUid || merchantUid;
  try {
    const paymentResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      { method: "GET", headers: { Authorization: `PortOne ${portoneApiSecret}` } },
    );
    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      throw new Error(`결제 정보 조회 실패 (${paymentResponse.status}): ${errorText.substring(0, 200)}`);
    }
    const payment = await paymentResponse.json();
    if (payment.status !== "PAID") {
      return json(400, {
        success: false,
        error: `결제가 완료되지 않았습니다. (상태: ${payment.status})`,
      });
    }
    const verifiedAmount = payment.amount?.total;
    const verifiedCurrency = (payment.amount?.currency || "KRW").toUpperCase();
    if (verifiedCurrency !== "KRW" || verifiedAmount !== REPORT_PRICE_KRW) {
      console.error(
        `❌ 리포트 결제 금액 불일치: ${verifiedAmount} ${verifiedCurrency} (기대: ${REPORT_PRICE_KRW} KRW)`,
      );
      return json(400, {
        success: false,
        error: "결제 금액이 상품 가격과 일치하지 않습니다.",
      });
    }
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
      amount: REPORT_PRICE_KRW,
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
      "id, user_id, status, sections_total, sections_done, content, question, profile_snapshot, generation_lock_at",
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

  // 원자적 락 획득: 락이 없거나 TTL이 지난 경우에만 통과
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - GENERATION_LOCK_TTL_MS).toISOString();
  const { data: locked, error: lockError } = await supabaseAdmin
    .from("premium_reports")
    .update({ generation_lock_at: nowIso, status: "GENERATING" })
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
    const { text: sectionText, usage } = await generateSection(
      sectionIndex,
      snapshot,
      report.question ?? null,
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
