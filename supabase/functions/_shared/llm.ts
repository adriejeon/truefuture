// LLM 공급자 라우팅 · OpenAI Responses API 호출 · Gemini 폴백 · 사용량/비용 기록 공용 헬퍼
// (Supabase Edge Functions - Deno)
//
// 필요한 환경 변수(시크릿):
//   - OPENAI_API_KEY        : OpenAI API 키 (로그·응답에 절대 남기지 않는다)
//   - LLM_DEFAULT_PROVIDER  (선택) : 운영 기본 공급자 "gemini"(기본) | "openai"
//                                   비교 테스트 결과를 보고 이 값만 바꿔 운영 전환한다.
//   - LLM_PRICING_JSON      (선택) : 단가 덮어쓰기. 예) {"gemini-3.5-flash":{"input":1.5,"cachedInput":0.15,"output":9}}
//
// 테스트 모드:
//   요청 body 의 llmProvider 로 변형(variant)을 고를 수 있다. admin_users 에 등록된 계정만 허용되며,
//   그 외 계정이 보낸 값은 무시하고 운영 기본값을 쓴다.
//     - "openai"     : gpt-6.1-sol (실패 시 Gemini 폴백)
//     - "gemini"     : 현재 운영 Gemini 구성
//     - "gemini-3.8" : 가벼운 호출만 gemini-3.8-flash 로 교체한 구성 (심층 호출은 운영과 동일)
//
// 기록 원칙:
//   - 실제로 응답을 만든 공급자/모델(final_*)과 시도 목록(attempts)을 따로 남긴다.
//     GPT 실패 후 Gemini 가 만든 결과는 final_provider = "gemini", fell_back = true 로 기록된다.
//   - 프롬프트 원문·생년월일·질문 원문·API 키는 기록하지 않는다 (프롬프트는 해시만).

// ========== 모델 / 설정 ==========

/** 심층 호출(종합운·첫 상담·리포트 본문) OpenAI 모델 */
export const OPENAI_DEEP_MODEL = "gpt-6.1-sol";
/** 가벼운 호출(데일리·궁합·후속 상담) OpenAI 모델 — Sol 대비 단가 1/20 */
export const OPENAI_LIGHT_MODEL = "gpt-6-luna";
/** 리포트 등 심층 전용 호출부 호환용 별칭 */
export const OPENAI_MODEL = OPENAI_DEEP_MODEL;
/** 가벼운 호출(데일리·궁합·후속 상담)의 Gemini 폴백 */
export const GEMINI_LIGHT_FALLBACK_MODEL = "gemini-3.8-flash";
/** 심층 호출(종합운·첫 상담·리포트 본문)의 Gemini 폴백 */
export const GEMINI_DEEP_FALLBACK_MODEL = "gemini-3.1-pro-preview";

export type LlmProvider = "openai" | "gemini";
export type LlmVariant = "openai" | "gemini" | "gemini-3.8";
export type LlmTier = "light" | "deep";
export type ReasoningEffort = "low" | "medium";

export const LLM_VARIANTS: readonly LlmVariant[] = ["openai", "gemini", "gemini-3.8"];

export function isLlmVariant(v: unknown): v is LlmVariant {
  return typeof v === "string" && (LLM_VARIANTS as readonly string[]).includes(v);
}

/**
 * OpenAI 호출 설정 (tier 별).
 * max_output_tokens 는 추론 토큰 + 본문을 함께 포함하는 상한이다.
 * 기존 Gemini 본문 상한(데일리 9k·궁합 15k·첫 상담 10k·후속 8k·종합운 파트 10k·리포트 섹션 32k)에
 * 추론 여유분(low ≈ +8k, medium ≈ +20~30k)을 더했다. 상한은 과금 기준이 아니라 실제 사용량만 과금된다.
 */
export const OPENAI_TIER_CONFIG: Record<LlmTier, { model: string; effort: ReasoningEffort }> = {
  light: { model: OPENAI_LIGHT_MODEL, effort: "low" },
  deep: { model: OPENAI_DEEP_MODEL, effort: "medium" },
};

// ========== 오류 분류 ==========

/**
 * - timeout     : 타임아웃 (폴백 대상)
 * - api         : HTTP/네트워크 오류 (폴백 대상)
 * - empty       : 빈 응답 (폴백 대상)
 * - incomplete  : max_output_tokens 로 잘림 (폴백 대상)
 * - validation  : 필수 형식 검증 실패 (폴백 대상)
 * - refusal     : 안전상 거절 / 콘텐츠 필터 (폴백하지 않고 기존 처리 흐름으로 반환)
 * - config      : 키 누락 등 설정 오류 (폴백 대상)
 */
export type LlmErrorKind =
  | "timeout"
  | "api"
  | "empty"
  | "incomplete"
  | "validation"
  | "refusal"
  | "config";

export class LlmError extends Error {
  kind: LlmErrorKind;
  status?: number;
  /** 실패했어도 과금된 사용량이 응답에 실려 온 경우 (incomplete·검증 실패 등) */
  usage?: NormalizedUsage | null;
  constructor(kind: LlmErrorKind, message: string, opts?: { status?: number; usage?: NormalizedUsage | null }) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.status = opts?.status;
    this.usage = opts?.usage ?? null;
  }
}

export function isRefusal(e: unknown): boolean {
  return e instanceof LlmError && e.kind === "refusal";
}

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  const err = e as { name?: string; message?: string };
  if (err?.name === "AbortError" || err?.name === "TimeoutError") {
    return new LlmError("timeout", "요청 시간 초과");
  }
  return new LlmError("api", sanitizeErrorMessage(err?.message ?? String(e)));
}

/** 오류 메시지에서 키·토큰처럼 보이는 문자열을 지우고 길이를 제한한다 */
export function sanitizeErrorMessage(msg: string): string {
  return String(msg ?? "")
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/ya29\.[A-Za-z0-9._\-]+/g, "ya29.***")
    .substring(0, 300);
}

// ========== 사용량 / 비용 ==========

export interface NormalizedUsage {
  /** 입력 토큰 전체 (캐시 적중분 포함) */
  inputTokens: number;
  cachedInputTokens: number;
  /** 출력 토큰 전체 (추론 토큰 포함 — 둘 다 출력 단가로 과금) */
  outputTokens: number;
  reasoningTokens: number;
}

export function usageFromOpenAI(u: any): NormalizedUsage | null {
  if (!u || typeof u !== "object") return null;
  return {
    inputTokens: Number(u.input_tokens ?? 0),
    cachedInputTokens: Number(u.input_tokens_details?.cached_tokens ?? 0),
    outputTokens: Number(u.output_tokens ?? 0),
    reasoningTokens: Number(u.output_tokens_details?.reasoning_tokens ?? 0),
  };
}

export function usageFromGemini(u: any): NormalizedUsage | null {
  if (!u || typeof u !== "object") return null;
  const candidates = Number(u.candidatesTokenCount ?? 0);
  const thoughts = Number(u.thoughtsTokenCount ?? 0);
  return {
    inputTokens: Number(u.promptTokenCount ?? 0),
    cachedInputTokens: Number(u.cachedContentTokenCount ?? 0),
    outputTokens: candidates + thoughts,
    reasoningTokens: thoughts,
  };
}

interface PriceEntry {
  /** USD / 1M tokens */
  input: number;
  cachedInput: number;
  output: number;
  /** "official": 공식 문서 확인 / "unverified": 2차 출처 — 공식 단가표로 확인 필요 / "env": LLM_PRICING_JSON */
  source: "official" | "unverified" | "env";
}

/**
 * 기본 단가표 (Standard 처리, 2026-10-13 확인).
 * - gpt-6.1-sol: OpenAI 공식 모델 페이지. 272K 입력 초과 시 할증은 이 서비스 프롬프트 규모에서 해당 없음.
 * - gpt-6-luna: OpenAI 공식 모델 페이지 $0.1/$0.01/$0.5. 캐시 쓰기($0.125)는 usage 에 따로 안 잡혀 미반영.
 * - gemini-3.8-flash: global 엔드포인트 도입가 $0.75/$3.75 (2026-12-31까지), 2027-01-01부터 $1.5/$7.5.
 *   캐시 단가는 입력의 10%로 가정.
 * - 나머지 Gemini 단가는 공식 단가표 본문을 직접 확인하지 못해 unverified 로 표시한다.
 *   LLM_PRICING_JSON 으로 덮어쓸 수 있다.
 */
function defaultPrice(model: string, at: Date, vertexLocation: string): PriceEntry | null {
  switch (model) {
    case "gpt-6.1-sol":
      return { input: 2, cachedInput: 0.1, output: 10, source: "official" };
    case "gpt-6-luna":
      return { input: 0.1, cachedInput: 0.01, output: 0.5, source: "official" };
    case "gemini-3.8-flash": {
      const promo = at.getTime() < Date.UTC(2027, 0, 1) && vertexLocation === "global";
      return promo
        ? { input: 0.75, cachedInput: 0.075, output: 3.75, source: "unverified" }
        : { input: 1.5, cachedInput: 0.15, output: 7.5, source: "unverified" };
    }
    case "gemini-3.5-flash":
      return { input: 1.5, cachedInput: 0.15, output: 9, source: "unverified" };
    case "gemini-3.1-pro-preview":
      return { input: 2, cachedInput: 0.2, output: 12, source: "unverified" };
    case "gemini-2.5-flash-lite":
      return { input: 0.1, cachedInput: 0.01, output: 0.4, source: "unverified" };
    default:
      return null;
  }
}

let pricingOverride: Record<string, Partial<PriceEntry>> | null | undefined;

function getPrice(model: string, at: Date): PriceEntry | null {
  if (pricingOverride === undefined) {
    pricingOverride = null;
    const raw = Deno.env.get("LLM_PRICING_JSON");
    if (raw) {
      try {
        pricingOverride = JSON.parse(raw);
      } catch {
        console.warn("⚠️ LLM_PRICING_JSON 파싱 실패 — 기본 단가표를 사용합니다.");
      }
    }
  }
  const o = pricingOverride?.[model];
  if (o && typeof o.input === "number" && typeof o.output === "number") {
    return {
      input: o.input,
      cachedInput: typeof o.cachedInput === "number" ? o.cachedInput : o.input,
      output: o.output,
      source: "env",
    };
  }
  return defaultPrice(model, at, Deno.env.get("VERTEX_LOCATION") || "global");
}

export function estimateCostUsd(
  model: string,
  usage: NormalizedUsage | null,
  at = new Date(),
): { usd: number | null; priceSource: PriceEntry["source"] | "unknown" } {
  if (!usage) return { usd: null, priceSource: "unknown" };
  const p = getPrice(model, at);
  if (!p) return { usd: null, priceSource: "unknown" };
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const usd =
    ((usage.inputTokens - cached) * p.input +
      cached * p.cachedInput +
      usage.outputTokens * p.output) /
    1_000_000;
  return { usd: Math.round(usd * 1_000_000) / 1_000_000, priceSource: p.source };
}

// ========== 라우팅 (운영 기본값 / 테스트 모드) ==========

export interface LlmRouting {
  variant: LlmVariant;
  /** 관리자가 llmProvider 로 직접 고른 경우 true */
  isTest: boolean;
}

export function getDefaultVariant(): LlmVariant {
  const v = (Deno.env.get("LLM_DEFAULT_PROVIDER") ?? "").trim().toLowerCase();
  return isLlmVariant(v) ? v : "gemini";
}

/**
 * 요청의 llmProvider 를 해석한다. admin_users 에 있는 계정만 테스트 변형을 고를 수 있다.
 * 관리자 확인이 실패하면 조용히 운영 기본값으로 처리한다 (요청 자체는 막지 않음).
 */
export async function resolveLlmRouting(
  supabaseAdmin: any,
  userId: string,
  requested: unknown,
): Promise<LlmRouting> {
  const fallback: LlmRouting = { variant: getDefaultVariant(), isTest: false };
  if (requested == null || requested === "") return fallback;
  if (!isLlmVariant(requested)) {
    console.warn(JSON.stringify({ logType: "LLM_ROUTING_IGNORED", reason: "unknown_variant" }));
    return fallback;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      console.warn(JSON.stringify({ logType: "LLM_ROUTING_IGNORED", reason: "not_admin" }));
      return fallback;
    }
  } catch (_) {
    return fallback;
  }
  return { variant: requested, isTest: true };
}

/**
 * 모델의 "데이터 근거 원칙" 지침.
 * 테스트 모드의 모든 변형과 OpenAI 운영 호출에 같은 문구를 붙여, 비교 조건을 동일하게 유지한다.
 * (테스트가 아닌 운영 Gemini 호출의 프롬프트는 바꾸지 않는다)
 */
export function groundingGuard(language: string | undefined): string {
  if ((language ?? "ko").toLowerCase().startsWith("en")) {
    return (
      "\n\n[Data grounding rule]\n" +
      "Quote planetary positions, signs, houses, degrees, scores, dates and periods only as given in the data above. " +
      "Never compute, estimate or invent values that are not provided. " +
      "Do not assert specific events (accidents, diagnoses, breakups, exam results, etc.) as certain; describe tendencies and possibilities."
    );
  }
  return (
    "\n\n[데이터 근거 원칙]\n" +
    "행성 위치·사인·하우스·각도·점수·날짜·시기 등 모든 계산값은 위에 제공된 데이터에 있는 값만 그대로 인용하세요. " +
    "제공되지 않은 값을 새로 계산하거나 추정해서 만들어내지 마세요. " +
    "데이터에 근거 없는 구체적 사건(사고·질병 진단·이별·합격 등)을 확정적으로 단정하지 말고, 경향과 가능성으로 표현하세요."
  );
}

export function shouldApplyGroundingGuard(routing: LlmRouting): boolean {
  return routing.isTest || routing.variant !== "gemini";
}

// ========== 실행 기록 (attempt / run / session) ==========

export interface LlmAttempt {
  provider: LlmProvider;
  model: string;
  effort?: ReasoningEffort;
  /** ok | failed | cancelled | truncated_saved */
  outcome: "ok" | "failed" | "cancelled" | "truncated_saved" | "pending";
  errorKind?: LlmErrorKind;
  error?: string;
  httpStatus?: number;
  latencyMs?: number;
  ttftMs?: number;
  usage: NormalizedUsage | null;
  costUsd: number | null;
  priceSource?: string;
  /** OpenAI 응답 status / Gemini finishReason 등 */
  finish?: string;
  serviceTier?: string;
}

export class AttemptHandle {
  readonly data: LlmAttempt;
  private readonly startedAt = Date.now();
  constructor(provider: LlmProvider, model: string, effort?: ReasoningEffort) {
    this.data = { provider, model, effort, outcome: "pending", usage: null, costUsd: null };
  }
  markFirstToken(): void {
    if (this.data.ttftMs == null) this.data.ttftMs = Date.now() - this.startedAt;
  }
  setUsage(u: NormalizedUsage | null): void {
    if (!u) return;
    this.data.usage = u;
    const c = estimateCostUsd(this.data.model, u);
    this.data.costUsd = c.usd;
    this.data.priceSource = c.priceSource;
  }
  setFinish(finish: string | undefined, serviceTier?: string): void {
    if (finish) this.data.finish = finish;
    if (serviceTier) this.data.serviceTier = serviceTier;
  }
  succeed(outcome: "ok" | "truncated_saved" = "ok"): void {
    if (this.data.outcome !== "pending") return;
    this.data.outcome = outcome;
    this.data.latencyMs = Date.now() - this.startedAt;
  }
  fail(e: LlmError): void {
    if (this.data.outcome !== "pending") return;
    this.data.outcome = "failed";
    this.data.errorKind = e.kind;
    this.data.error = sanitizeErrorMessage(e.message);
    if (e.status) this.data.httpStatus = e.status;
    if (e.usage) this.setUsage(e.usage);
    this.data.latencyMs = Date.now() - this.startedAt;
  }
  cancel(): void {
    if (this.data.outcome !== "pending") return;
    this.data.outcome = "cancelled";
    this.data.latencyMs = Date.now() - this.startedAt;
  }
}

/** 한 번의 "결과 생성"(예: 데일리 1건, 종합운 파트 1개, 리포트 섹션 1개)에 대한 기록 */
export class LlmRun {
  readonly feature: string;
  readonly part: string | null;
  readonly attempts: AttemptHandle[] = [];
  fallbackReason: LlmErrorKind | null = null;
  promptHash: string | null = null;
  outputChars = 0;
  private readonly startedAt = Date.now();
  latencyMs: number | null = null;

  constructor(feature: string, part: string | null = null) {
    this.feature = feature;
    this.part = part;
  }

  begin(provider: LlmProvider, model: string, effort?: ReasoningEffort): AttemptHandle {
    const h = new AttemptHandle(provider, model, effort);
    this.attempts.push(h);
    return h;
  }

  finish(outputText: string | null): void {
    this.outputChars = outputText?.length ?? 0;
    this.latencyMs = Date.now() - this.startedAt;
  }

  /** 실제로 결과를 만든 마지막 성공 시도 */
  get finalAttempt(): LlmAttempt | null {
    for (let i = this.attempts.length - 1; i >= 0; i--) {
      const a = this.attempts[i].data;
      if (a.outcome === "ok" || a.outcome === "truncated_saved") return a;
    }
    return null;
  }

  get totalCostUsd(): number | null {
    let sum = 0;
    let known = false;
    for (const a of this.attempts) {
      if (a.data.costUsd != null) {
        sum += a.data.costUsd;
        known = true;
      }
    }
    return known ? Math.round(sum * 1_000_000) / 1_000_000 : null;
  }

  /** 첫 시도 공급자와 최종 공급자가 다르면 폴백 */
  get fellBack(): boolean {
    const first = this.attempts[0]?.data;
    const fin = this.finalAttempt;
    return !!(first && fin && (first.provider !== fin.provider || first.model !== fin.model));
  }

  summary(): Record<string, unknown> {
    const fin = this.finalAttempt;
    return {
      feature: this.feature,
      part: this.part,
      requestedProvider: this.attempts[0]?.data.provider ?? null,
      requestedModel: this.attempts[0]?.data.model ?? null,
      finalProvider: fin?.provider ?? null,
      finalModel: fin?.model ?? null,
      fellBack: this.fellBack,
      fallbackReason: this.fallbackReason,
      latencyMs: this.latencyMs,
      ttftMs: fin?.ttftMs ?? null,
      outputChars: this.outputChars,
      totalCostUsd: this.totalCostUsd,
      promptHash: this.promptHash,
      attempts: this.attempts.map((a) => a.data),
    };
  }
}

/** 한 HTTP 요청 안의 실행 기록 묶음. persist 는 한 번만 수행된다. */
export class LlmSession {
  readonly routing: LlmRouting;
  readonly userId: string | null;
  readonly runs: LlmRun[] = [];
  private persisted = false;

  constructor(routing: LlmRouting, userId: string | null) {
    this.routing = routing;
    this.userId = userId;
  }

  newRun(feature: string, part: string | null = null): LlmRun {
    const r = new LlmRun(feature, part);
    this.runs.push(r);
    return r;
  }

  /** 테스트 사용자에게만 done 이벤트 / JSON 응답으로 노출하는 요약 */
  publicSummary(): Record<string, unknown> | null {
    if (!this.routing.isTest) return null;
    return {
      variant: this.routing.variant,
      runs: this.runs.map((r) => r.summary()),
    };
  }

  async persist(
    supabaseAdmin: any,
    link: {
      fortuneResultId?: string | null;
      premiumReportId?: string | null;
      sectionIndex?: number | null;
      outcome: "saved" | "failed" | "cancelled" | "test";
    },
  ): Promise<void> {
    if (this.persisted || this.runs.length === 0) return;
    this.persisted = true;
    const rows = this.runs.map((r) => {
      const fin = r.finalAttempt;
      const first = r.attempts[0]?.data;
      return {
        user_id: this.userId,
        feature: r.feature,
        part: r.part,
        variant: this.routing.variant,
        is_test: this.routing.isTest,
        requested_provider: first?.provider ?? null,
        requested_model: first?.model ?? null,
        final_provider: fin?.provider ?? null,
        final_model: fin?.model ?? null,
        fell_back: r.fellBack,
        fallback_reason: r.fallbackReason,
        outcome: link.outcome,
        fortune_result_id: link.fortuneResultId ?? null,
        premium_report_id: link.premiumReportId ?? null,
        section_index: link.sectionIndex ?? null,
        prompt_hash: r.promptHash,
        output_chars: r.outputChars,
        latency_ms: r.latencyMs,
        ttft_ms: fin?.ttftMs ?? null,
        total_cost_usd: r.totalCostUsd,
        attempts: r.attempts.map((a) => a.data),
      };
    });
    for (const row of rows) {
      console.log(JSON.stringify({ logType: "LLM_RUN", ...row, user_id: undefined }));
    }
    try {
      const { error } = await supabaseAdmin.from("llm_generation_logs").insert(rows);
      if (error) console.warn("⚠️ llm_generation_logs insert 실패:", error.message);
    } catch (e) {
      console.warn("⚠️ llm_generation_logs insert 예외:", (e as Error)?.message);
    }
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ========== Gemini 요청 body → OpenAI 입력 변환 ==========

export interface OpenAIPrompt {
  instructions: string;
  input: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * 기존 Gemini 요청 body(contents / systemInstruction)를 Responses API 입력으로 옮긴다.
 * 시스템 지침·차트 데이터·질문이 그대로 재사용되어 공급자 간 프롬프트가 동일하게 유지된다.
 */
export function geminiBodyToOpenAI(body: any): OpenAIPrompt {
  const instructions = (body?.systemInstruction?.parts ?? [])
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n\n");
  const input: OpenAIPrompt["input"] = [];
  for (const c of body?.contents ?? []) {
    const text = (c?.parts ?? [])
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
    if (!text) continue;
    const role = c?.role === "model" || c?.role === "assistant" ? "assistant" : "user";
    input.push({ role, content: text });
  }
  return { instructions, input };
}

/** Gemini 요청 body 의 systemInstruction 끝에 문구를 덧붙인 사본 */
export function appendToGeminiSystem(body: any, extra: string): any {
  if (!extra) return body;
  const parts = Array.isArray(body?.systemInstruction?.parts) ? body.systemInstruction.parts : [];
  const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n\n");
  return { ...body, systemInstruction: { parts: [{ text: text + extra }] } };
}

export async function hashGeminiBody(body: any): Promise<string> {
  const p = geminiBodyToOpenAI(body);
  return await sha256Hex(p.instructions + "\n\u0000\n" + p.input.map((m) => `${m.role}:${m.content}`).join("\n"));
}

// ========== OpenAI Responses API ==========

const OPENAI_URL = "https://api.openai.com/v1/responses";
/** 429/5xx 에 한해 1회만 재시도 (그 다음은 Gemini 폴백) */
const OPENAI_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const OPENAI_RETRY_DELAY_MS = 2000;

export interface OpenAICallOptions {
  model: string;
  prompt: OpenAIPrompt;
  effort: ReasoningEffort;
  maxOutputTokens: number;
  /** 전체 타임아웃 */
  timeoutMs: number;
  /** 스트리밍: 첫 본문 토큰까지의 타임아웃 (추론 시간 포함) */
  firstTokenTimeoutMs?: number;
  /** 구조화 출력이 필요한 경우 */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** 프롬프트 캐시 적중률을 높이기 위한 키 (기능 단위) */
  promptCacheKey?: string;
  /** 사용자 식별용 해시 (원본 user id 는 보내지 않는다) */
  safetyIdentifier?: string;
}

function getOpenAIKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new LlmError("config", "OPENAI_API_KEY 가 설정되지 않았습니다.");
  return key;
}

function buildOpenAIBody(opts: OpenAICallOptions, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    instructions: opts.prompt.instructions,
    input: opts.prompt.input,
    reasoning: { effort: opts.effort },
    max_output_tokens: opts.maxOutputTokens,
    // 일반 Standard 처리
    service_tier: "default",
    // 응답을 OpenAI 측에 저장하지 않는다 (개인정보 최소화)
    store: false,
    stream,
  };
  if (opts.jsonSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: opts.jsonSchema.name,
        schema: opts.jsonSchema.schema,
        strict: true,
      },
    };
  }
  if (opts.promptCacheKey) body.prompt_cache_key = opts.promptCacheKey;
  if (opts.safetyIdentifier) body.safety_identifier = opts.safetyIdentifier;
  return body;
}

async function postOpenAI(
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  const key = getOpenAIKey();
  let attempt = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw toLlmError(e);
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    if (OPENAI_RETRY_STATUSES.has(res.status) && attempt < 1) {
      attempt++;
      console.warn(`⚠️ OpenAI ${res.status} — ${OPENAI_RETRY_DELAY_MS}ms 후 1회 재시도`);
      await new Promise((r) => setTimeout(r, OPENAI_RETRY_DELAY_MS));
      continue;
    }
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message ?? text;
    } catch (_) { /* 원문 사용 */ }
    throw new LlmError("api", `OpenAI ${res.status}: ${sanitizeErrorMessage(msg)}`, { status: res.status });
  }
}

/** Responses 응답 객체에서 본문/거절/상태를 꺼낸다 */
function readOpenAIResponse(resp: any): {
  text: string;
  refusal: string | null;
  status: string;
  incompleteReason: string | null;
  usage: NormalizedUsage | null;
  serviceTier?: string;
} {
  let text = "";
  let refusal: string | null = null;
  for (const item of resp?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const c of item?.content ?? []) {
      if (c?.type === "output_text" && typeof c.text === "string") text += c.text;
      if (c?.type === "refusal") refusal = String(c.refusal ?? "refusal");
    }
  }
  return {
    text,
    refusal,
    status: String(resp?.status ?? ""),
    incompleteReason: resp?.incomplete_details?.reason ?? null,
    usage: usageFromOpenAI(resp?.usage),
    serviceTier: resp?.service_tier,
  };
}

function throwIfRefusedOrBroken(
  r: ReturnType<typeof readOpenAIResponse>,
  hasVisibleText: boolean,
): void {
  if (r.refusal) {
    throw new LlmError("refusal", "OpenAI 안전상 거절", { usage: r.usage });
  }
  if (r.status === "incomplete" && r.incompleteReason === "content_filter") {
    throw new LlmError("refusal", "OpenAI 콘텐츠 필터로 중단", { usage: r.usage });
  }
  if (r.status === "failed") {
    throw new LlmError("api", "OpenAI 응답 실패(status=failed)", { usage: r.usage });
  }
  if (r.status === "incomplete" && !hasVisibleText) {
    throw new LlmError(
      "incomplete",
      `OpenAI 응답 미완료(${r.incompleteReason ?? "unknown"}) — 본문 없음`,
      { usage: r.usage },
    );
  }
}

/**
 * 비스트리밍 호출. 성공 시 본문 텍스트를 반환하고 attempt 에 사용량을 기록한다.
 * incomplete(max_output_tokens) 는 본문이 있어도 잘린 원고이므로 실패로 처리한다.
 */
export async function callOpenAIText(
  opts: OpenAICallOptions,
  attempt: AttemptHandle,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await postOpenAI(buildOpenAIBody(opts, false), controller.signal);
    let data: any;
    try {
      data = await res.json();
    } catch (e) {
      throw toLlmError(e);
    }
    const r = readOpenAIResponse(data);
    attempt.setUsage(r.usage);
    attempt.setFinish(r.incompleteReason ? `${r.status}:${r.incompleteReason}` : r.status, r.serviceTier);
    throwIfRefusedOrBroken(r, r.text.trim().length > 0);
    if (r.status === "incomplete") {
      throw new LlmError("incomplete", `OpenAI 응답이 잘림(${r.incompleteReason})`, { usage: r.usage });
    }
    const text = r.text.trim();
    if (!text) throw new LlmError("empty", "OpenAI 빈 응답", { usage: r.usage });
    attempt.markFirstToken();
    return text;
  } catch (e) {
    throw toLlmError(e);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 스트리밍 호출. 본문 델타를 yield 한다.
 * - 첫 본문 토큰 전까지 firstTokenTimeoutMs, 전체 timeoutMs 를 넘기면 timeout.
 * - 본문을 이미 내보낸 뒤 max_output_tokens 로 잘리면 기존 Gemini 경로와 같이 저장하고
 *   attempt 를 truncated_saved 로 기록한다 (이미 전달한 내용과 폴백 결과를 섞지 않기 위해 폴백하지 않음).
 */
export async function* streamOpenAIText(
  opts: OpenAICallOptions,
  attempt: AttemptHandle,
): AsyncGenerator<string, void, unknown> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timedOut = false;
  // abort 만으로 본문 읽기가 풀리지 않는 런타임에 대비해 reader 도 직접 닫는다
  const onTimeout = () => {
    timedOut = true;
    controller.abort();
    reader?.cancel().catch(() => {});
  };
  const total = setTimeout(onTimeout, opts.timeoutMs);
  let firstTokenTimer: number | undefined = opts.firstTokenTimeoutMs
    ? (setTimeout(onTimeout, opts.firstTokenTimeoutMs) as unknown as number)
    : undefined;
  const clearFirstTokenTimer = () => {
    if (firstTokenTimer !== undefined) {
      clearTimeout(firstTokenTimer);
      firstTokenTimer = undefined;
    }
  };

  let emitted = false;
  let finalResponse: any = null;
  let streamError: LlmError | null = null;

  try {
    const res = await postOpenAI(buildOpenAIBody(opts, true), controller.signal);
    reader = res.body?.getReader();
    if (!reader) throw new LlmError("api", "OpenAI stream: response body 없음");

    const decoder = new TextDecoder();
    let buffer = "";
    let refused = false;

    const handleEvent = (data: any): string | null => {
      const type = String(data?.type ?? "");
      if (type === "response.output_text.delta" && typeof data.delta === "string") {
        return data.delta;
      }
      if (type === "response.refusal.delta" || type === "response.refusal.done") {
        refused = true;
        return null;
      }
      if (type === "response.completed" || type === "response.incomplete" || type === "response.failed") {
        finalResponse = data.response ?? null;
        return null;
      }
      if (type === "error") {
        streamError = new LlmError(
          "api",
          `OpenAI stream error: ${sanitizeErrorMessage(data?.message ?? data?.error?.message ?? "")}`,
        );
      }
      return null;
    };

    readLoop: while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        throw timedOut ? new LlmError("timeout", "OpenAI 스트림 시간 초과") : toLlmError(e);
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      // SSE 이벤트는 빈 줄로 구분된다
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let data: any;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = handleEvent(data);
          if (refused && !emitted) {
            // 거절은 폴백하지 않는다 → 기존 안전 차단 흐름으로
            throw new LlmError("refusal", "OpenAI 안전상 거절");
          }
          if (streamError) throw streamError;
          if (delta) {
            clearFirstTokenTimer();
            attempt.markFirstToken();
            emitted = true;
            yield delta;
          }
          if (finalResponse) break readLoop;
        }
      }
    }

    if (!finalResponse) {
      throw timedOut
        ? new LlmError("timeout", "OpenAI 스트림 시간 초과")
        : new LlmError("api", "OpenAI 스트림이 완료 이벤트 없이 종료됨");
    }
    const r = readOpenAIResponse(finalResponse);
    attempt.setUsage(r.usage);
    attempt.setFinish(r.incompleteReason ? `${r.status}:${r.incompleteReason}` : r.status, r.serviceTier);
    if (refused) throw new LlmError("refusal", "OpenAI 안전상 거절", { usage: r.usage });
    throwIfRefusedOrBroken(r, emitted);
    if (!emitted) throw new LlmError("empty", "OpenAI 빈 응답", { usage: r.usage });
    attempt.succeed(r.status === "incomplete" ? "truncated_saved" : "ok");
  } catch (e) {
    const err = toLlmError(e);
    if (timedOut && err.kind === "api") err.kind = "timeout";
    throw err;
  } finally {
    clearTimeout(total);
    clearFirstTokenTimer();
    if (reader) {
      try {
        await reader.cancel();
      } catch (_) { /* 이미 종료 */ }
    }
    if (!controller.signal.aborted) controller.abort();
  }
}

// ========== 폴백 오케스트레이션 ==========

export interface StreamStep {
  provider: LlmProvider;
  model: string;
  effort?: ReasoningEffort;
  open: (attempt: AttemptHandle) => AsyncGenerator<string, void, unknown>;
}

/**
 * 1차 스트림 → (조건부) 폴백 스트림.
 * - 본문을 한 글자도 내보내기 전에 실패한 경우에만 폴백한다.
 *   (이미 전달한 내용과 폴백 결과가 섞이지 않도록, 전달 이후 실패는 그대로 오류 처리)
 * - 안전상 거절(refusal)은 폴백하지 않는다.
 * - 폴백은 최대 1회.
 */
export async function* streamWithFallback(
  run: LlmRun,
  primary: StreamStep,
  fallback: StreamStep | null,
): AsyncGenerator<string, void, unknown> {
  let full = "";
  const steps = fallback ? [primary, fallback] : [primary];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const attempt = run.begin(step.provider, step.model, step.effort);
    let emitted = false;
    let finished = false;
    try {
      for await (const chunk of step.open(attempt)) {
        if (!chunk) continue;
        attempt.markFirstToken();
        emitted = true;
        full += chunk;
        yield chunk;
      }
      finished = true;
      if (!emitted) throw new LlmError("empty", `${step.provider} 빈 응답`);
      attempt.succeed();
      run.finish(full);
      return;
    } catch (e) {
      const err = toLlmError(e);
      attempt.fail(err);
      const canFallback = i < steps.length - 1 && !emitted && err.kind !== "refusal";
      if (!canFallback) {
        run.finish(full || null);
        throw err;
      }
      run.fallbackReason = err.kind;
      console.warn(
        JSON.stringify({
          logType: "LLM_FALLBACK",
          feature: run.feature,
          part: run.part,
          from: `${step.provider}:${step.model}`,
          to: `${steps[i + 1].provider}:${steps[i + 1].model}`,
          reason: err.kind,
          httpStatus: err.status ?? null,
        }),
      );
    } finally {
      // 소비자가 중간에 끊은 경우 (클라이언트 연결 종료)
      if (!finished && attempt.data.outcome === "pending") attempt.cancel();
    }
  }
}

export interface TextStep {
  provider: LlmProvider;
  model: string;
  effort?: ReasoningEffort;
  call: (attempt: AttemptHandle) => Promise<string>;
}

/**
 * 비스트리밍: 1차 → (조건부) 폴백.
 * validate 가 문제 목록을 돌려주면 validation 실패로 보고 폴백한다.
 * deadline(epoch ms) 이 주어지면, 그 시각을 넘긴 뒤에는 폴백하지 않고 오류를 던진다
 * (엣지 워커 실행 시간 한도 보호 — 호출부가 다음 요청으로 폴백을 넘길 수 있다).
 */
export async function textWithFallback(
  run: LlmRun,
  primary: TextStep,
  fallback: TextStep | null,
  opts?: { validate?: (text: string) => string[] | null; fallbackDeadline?: number },
): Promise<string> {
  const steps = fallback ? [primary, fallback] : [primary];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    run.begin(step.provider, step.model, step.effort);
    // 단계 내부에서 모델이 바뀌면(예: Gemini 503 전환) 새 시도가 열리므로 항상 마지막 시도를 닫는다
    const active = () => run.attempts[run.attempts.length - 1];
    try {
      const text = (await step.call(active())).trim();
      if (!text) throw new LlmError("empty", `${step.provider} 빈 응답`);
      const problems = opts?.validate?.(text) ?? null;
      if (problems && problems.length > 0) {
        // 문제 문구에 사용자 입력이 섞일 수 있어 기록에는 개수만 남긴다
        const err = new LlmError("validation", `형식 검증 실패 ${problems.length}건`);
        (err as LlmError & { problems?: string[] }).problems = problems;
        throw err;
      }
      active().succeed();
      run.finish(text);
      return text;
    } catch (e) {
      const err = toLlmError(e);
      active().fail(err);
      const pastDeadline = opts?.fallbackDeadline != null && Date.now() > opts.fallbackDeadline;
      const canFallback = i < steps.length - 1 && err.kind !== "refusal" && !pastDeadline;
      if (!canFallback) {
        run.finish(null);
        throw err;
      }
      run.fallbackReason = err.kind;
      console.warn(
        JSON.stringify({
          logType: "LLM_FALLBACK",
          feature: run.feature,
          part: run.part,
          from: `${step.provider}:${step.model}`,
          to: `${steps[i + 1].provider}:${steps[i + 1].model}`,
          reason: err.kind,
          httpStatus: err.status ?? null,
        }),
      );
    }
  }
  throw new LlmError("api", "unreachable");
}
