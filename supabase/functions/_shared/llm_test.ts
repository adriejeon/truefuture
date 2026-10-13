// _shared/llm.ts 단위 테스트 (네트워크 없이 fetch 를 가짜로 바꿔 검증)
// 실행: deno test --allow-env supabase/functions/_shared/llm_test.ts

import {
  callOpenAIText,
  estimateCostUsd,
  geminiBodyToOpenAI,
  LlmError,
  LlmRun,
  LlmSession,
  OPENAI_TIER_CONFIG,
  streamOpenAIText,
  streamWithFallback,
  textWithFallback,
} from "./llm.ts";
import type { StreamStep, TextStep } from "./llm.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals(a: unknown, b: unknown, msg = ""): void {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`assertEquals failed ${msg}: ${sa} !== ${sb}`);
}

Deno.env.set("OPENAI_API_KEY", "sk-test-not-a-real-key-000000");

const realFetch = globalThis.fetch;
function mockFetch(handler: (body: any) => Response | Promise<Response>): () => any[] {
  const calls: any[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push(body);
    return await handler(body);
  }) as typeof fetch;
  return () => calls;
}
function restore() {
  globalThis.fetch = realFetch;
}

function sse(events: unknown[]): Response {
  const text = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const usage = {
  input_tokens: 1000,
  input_tokens_details: { cached_tokens: 200 },
  output_tokens: 500,
  output_tokens_details: { reasoning_tokens: 300 },
};

const baseOpts = {
  model: "gpt-6.1-sol",
  prompt: { instructions: "sys", input: [{ role: "user" as const, content: "hi" }] },
  effort: "low" as const,
  maxOutputTokens: 1000,
  timeoutMs: 5000,
};

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let s = "";
  for await (const c of gen) s += c;
  return s;
}

function fakeGeminiStep(text: string): StreamStep {
  return {
    provider: "gemini",
    model: "gemini-3.8-flash",
    open: async function* (attempt) {
      attempt.setUsage({ inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, reasoningTokens: 0 });
      yield text;
    },
  };
}

function openaiStep(): StreamStep {
  return {
    provider: "openai",
    model: "gpt-6.1-sol",
    effort: "low",
    open: (a) => streamOpenAIText(baseOpts, a),
  };
}

Deno.test("요청 body: Standard 처리·store false·reasoning effort·temperature 미전송", async () => {
  const calls = mockFetch(() =>
    sse([
      { type: "response.output_text.delta", delta: "안녕" },
      { type: "response.completed", response: { status: "completed", usage, service_tier: "default" } },
    ])
  );
  try {
    const run = new LlmRun("daily");
    await collect(streamWithFallback(run, openaiStep(), null));
    const b = calls()[0];
    assertEquals(b.service_tier, "default");
    assertEquals(b.store, false);
    assertEquals(b.reasoning, { effort: "low" });
    assertEquals(b.max_output_tokens, 1000);
    assert(!("temperature" in b) && !("top_p" in b), "샘플링 파라미터를 보내지 않음");
  } finally {
    restore();
  }
});

Deno.test("스트림 정상: 본문·사용량·비용 기록", async () => {
  mockFetch(() =>
    sse([
      { type: "response.created", response: {} },
      { type: "response.output_text.delta", delta: "오늘은 " },
      { type: "response.output_text.delta", delta: "좋은 날" },
      { type: "response.completed", response: { status: "completed", usage, service_tier: "default" } },
    ])
  );
  try {
    const run = new LlmRun("daily");
    const out = await collect(streamWithFallback(run, openaiStep(), fakeGeminiStep("폴백")));
    assertEquals(out, "오늘은 좋은 날");
    const s = run.summary() as any;
    assertEquals(s.finalProvider, "openai");
    assertEquals(s.fellBack, false);
    const a = s.attempts[0];
    assertEquals(a.usage, { inputTokens: 1000, cachedInputTokens: 200, cacheWriteTokens: 0, outputTokens: 500, reasoningTokens: 300 });
    // (800*2 + 200*0.1 + 500*10) / 1e6
    assertEquals(a.costUsd, 0.00662);
    assertEquals(a.serviceTier, "default");
  } finally {
    restore();
  }
});

Deno.test("본문 전 500 두 번 → 1회 재시도 후 Gemini 폴백, 최종 공급자 gemini 로 기록", async () => {
  const calls = mockFetch(() => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 }));
  try {
    const run = new LlmRun("daily");
    const out = await collect(streamWithFallback(run, openaiStep(), fakeGeminiStep("제미나이 결과")));
    assertEquals(out, "제미나이 결과");
    assertEquals(calls().length, 2, "OpenAI 재시도는 1회");
    const s = run.summary() as any;
    assertEquals(s.requestedProvider, "openai");
    assertEquals(s.finalProvider, "gemini");
    assertEquals(s.fellBack, true);
    assertEquals(s.fallbackReason, "api");
    assertEquals(s.attempts[0].outcome, "failed");
    assertEquals(s.attempts[0].httpStatus, 500);
  } finally {
    restore();
  }
});

Deno.test("안전상 거절은 폴백하지 않는다", async () => {
  mockFetch(() =>
    sse([
      { type: "response.refusal.delta", delta: "I can't" },
      { type: "response.completed", response: { status: "completed", usage } },
    ])
  );
  try {
    const run = new LlmRun("consultation_first");
    let caught: unknown = null;
    try {
      await collect(streamWithFallback(run, openaiStep(), fakeGeminiStep("폴백")));
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof LlmError && caught.kind === "refusal", "refusal 로 실패");
    assertEquals(run.attempts.length, 1, "Gemini 시도 없음");
  } finally {
    restore();
  }
});

Deno.test("본문 일부 전송 후 실패 → 폴백하지 않음 (섞임 방지)", async () => {
  mockFetch(() =>
    sse([
      { type: "response.output_text.delta", delta: "앞부분" },
      { type: "error", message: "server_error" },
    ])
  );
  try {
    const run = new LlmRun("daily");
    let got = "";
    let caught: unknown = null;
    try {
      for await (const c of streamWithFallback(run, openaiStep(), fakeGeminiStep("폴백"))) got += c;
    } catch (e) {
      caught = e;
    }
    assertEquals(got, "앞부분");
    assert(caught instanceof LlmError, "오류 전파");
    assertEquals(run.attempts.length, 1, "폴백 시도 없음");
  } finally {
    restore();
  }
});

Deno.test("추론만 하다 max_output_tokens 로 본문 없이 끝남 → incomplete 로 폴백", async () => {
  mockFetch(() =>
    sse([
      {
        type: "response.incomplete",
        response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, usage },
      },
    ])
  );
  try {
    const run = new LlmRun("daily");
    const out = await collect(streamWithFallback(run, openaiStep(), fakeGeminiStep("폴백 본문")));
    assertEquals(out, "폴백 본문");
    const s = run.summary() as any;
    assertEquals(s.fallbackReason, "incomplete");
    assert(s.attempts[0].costUsd > 0, "실패한 최초 호출 비용도 기록");
    assert(s.totalCostUsd > s.attempts[0].costUsd, "총비용 = 최초 오류 + 폴백");
  } finally {
    restore();
  }
});

Deno.test("본문 전송 후 max_output_tokens → 저장(truncated_saved), 폴백 없음", async () => {
  mockFetch(() =>
    sse([
      { type: "response.output_text.delta", delta: "긴 본문" },
      {
        type: "response.incomplete",
        response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, usage },
      },
    ])
  );
  try {
    const run = new LlmRun("daily");
    const out = await collect(streamWithFallback(run, openaiStep(), fakeGeminiStep("폴백")));
    assertEquals(out, "긴 본문");
    assertEquals((run.summary() as any).attempts[0].outcome, "truncated_saved");
    assertEquals(run.attempts.length, 1);
  } finally {
    restore();
  }
});

Deno.test("첫 토큰 타임아웃 → timeout 으로 폴백", async () => {
  mockFetch(() => {
    const body = new ReadableStream({
      start() { /* 아무것도 보내지 않음 */ },
    });
    return new Response(body, { status: 200 });
  });
  try {
    const run = new LlmRun("daily");
    const step: StreamStep = {
      provider: "openai",
      model: "gpt-6.1-sol",
      open: (a) => streamOpenAIText({ ...baseOpts, firstTokenTimeoutMs: 50, timeoutMs: 5000 }, a),
    };
    const out = await collect(streamWithFallback(run, step, fakeGeminiStep("폴백")));
    assertEquals(out, "폴백");
    assertEquals((run.summary() as any).fallbackReason, "timeout");
  } finally {
    restore();
  }
});

Deno.test("비스트리밍: 검증 실패 → Gemini 폴백, 마감 이후엔 폴백 안 함", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        status: "completed",
        usage,
        output: [{ type: "message", content: [{ type: "output_text", text: "형식 틀림" }] }],
      }),
      { status: 200 },
    )
  );
  try {
    const primary: TextStep = {
      provider: "openai",
      model: "gpt-6.1-sol",
      call: (a) => callOpenAIText(baseOpts, a),
    };
    const fb: TextStep = { provider: "gemini", model: "gemini-3.1-pro-preview", call: async () => "## 정상 형식" };
    const validate = (t: string) => (t.startsWith("##") ? null : ["소제목 없음"]);

    const run1 = new LlmRun("lifetime", "nature");
    const out = await textWithFallback(run1, primary, fb, { validate });
    assertEquals(out, "## 정상 형식");
    assertEquals((run1.summary() as any).fallbackReason, "validation");

    const run2 = new LlmRun("lifetime", "love");
    let caught: unknown = null;
    try {
      await textWithFallback(run2, primary, fb, { validate, fallbackDeadline: Date.now() - 1 });
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof LlmError && caught.kind === "validation", "마감 이후 폴백 없이 실패");
    assertEquals(run2.attempts.length, 1);
  } finally {
    restore();
  }
});

Deno.test("Gemini body → OpenAI 입력 변환 (지침·역할 보존)", () => {
  const p = geminiBodyToOpenAI({
    systemInstruction: { parts: [{ text: "지침" }] },
    contents: [
      { role: "user", parts: [{ text: "질문" }] },
      { role: "model", parts: [{ text: "답" }] },
    ],
  });
  assertEquals(p, {
    instructions: "지침",
    input: [{ role: "user", content: "질문" }, { role: "assistant", content: "답" }],
  });
});

Deno.test("비용: gemini-3.8-flash 도입가(2026) / 정가(2027)", () => {
  const u = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000, reasoningTokens: 0 };
  assertEquals(estimateCostUsd("gemini-3.8-flash", u, new Date("2026-10-13")).usd, 4.5);
  assertEquals(estimateCostUsd("gemini-3.8-flash", u, new Date("2027-01-02")).usd, 9);
  assertEquals(estimateCostUsd("unknown-model", u).usd, null);
});

Deno.test("OpenAI tier: 가벼운 호출 gpt-6-luna(low) / 심층 호출 gpt-6.1-sol(medium)", () => {
  assertEquals(OPENAI_TIER_CONFIG.light, { model: "gpt-6-luna", effort: "low" });
  assertEquals(OPENAI_TIER_CONFIG.deep, { model: "gpt-6.1-sol", effort: "medium" });
  const u = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000, reasoningTokens: 0 };
  assertEquals(estimateCostUsd("gpt-6-luna", u).usd, 0.6);
  assertEquals(estimateCostUsd("gpt-6.1-sol", u).usd, 12);
});

Deno.test("OpenAI 요청: 명시적 캐시 모드 — 고정 지침은 developer 블록 + breakpoint, 아니면 breakpoint 없음", async () => {
  const calls = mockFetch(() =>
    new Response(
      JSON.stringify({
        status: "completed",
        usage,
        output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
      }),
      { status: 200 },
    )
  );
  try {
    await textWithFallback(new LlmRun("daily"), {
      provider: "openai",
      model: "gpt-6.1-sol",
      call: (a) => callOpenAIText({ ...baseOpts, cacheStaticInstructions: true }, a),
    }, null);
    await textWithFallback(new LlmRun("premium_report_section"), {
      provider: "openai",
      model: "gpt-6.1-sol",
      call: (a) => callOpenAIText(baseOpts, a),
    }, null);
    const [b1, b2] = calls();
    // 고정 지침 캐시: 최상위 instructions 대신 developer 블록 + breakpoint
    assertEquals(b1.prompt_cache_options, { mode: "explicit" });
    assertEquals(b1.instructions, undefined);
    assertEquals(b1.input, [
      {
        role: "developer",
        content: [{ type: "input_text", text: "sys", prompt_cache_breakpoint: { mode: "explicit" } }],
      },
      { role: "user", content: "hi" },
    ]);
    // 기본: 최상위 instructions, breakpoint 없음 → 캐시 쓰기(1.25배) 없음
    assertEquals(b2.prompt_cache_options, { mode: "explicit" });
    assertEquals(b2.instructions, "sys");
    assertEquals(b2.input, [{ role: "user", content: "hi" }]);
    assert(!JSON.stringify(b2).includes("prompt_cache_breakpoint"), "breakpoint 없음");
  } finally {
    restore();
  }
});

Deno.test("비용: 캐시 쓰기 토큰은 쓰기 단가(Sol $2.5) — 10/13 실제 호출 $0.11 재현, 적중 시 절감", () => {
  // 암시적 캐시 모드였던 실제 호출: 입력 35,234 전부 캐시 쓰기 → 대시보드 $0.11
  const first = { inputTokens: 35234, cachedInputTokens: 0, cacheWriteTokens: 35234, outputTokens: 2355, reasoningTokens: 341 };
  assertEquals(estimateCostUsd("gpt-6.1-sol", first).usd, 0.111635);
  // 명시적 모드 + 고정 지침(9,500) 적중: 지침은 캐시 단가, 나머지는 일반 입력 단가
  const hit = { inputTokens: 35234, cachedInputTokens: 9500, cacheWriteTokens: 0, outputTokens: 2355, reasoningTokens: 341 };
  assertEquals(estimateCostUsd("gpt-6.1-sol", hit).usd, 0.075968);
  // 명시적 모드 + breakpoint 없음(리포트): 전부 일반 입력 단가
  const plain = { inputTokens: 35234, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 2355, reasoningTokens: 341 };
  assertEquals(estimateCostUsd("gpt-6.1-sol", plain).usd, 0.094018);
});

Deno.test("기록/요약에 API 키가 남지 않는다", async () => {
  mockFetch(() =>
    new Response(JSON.stringify({ error: { message: "Incorrect API key provided: sk-test-not-a-real-key-000000" } }), {
      status: 401,
    })
  );
  try {
    const session = new LlmSession({ variant: "openai", isTest: true }, "user-1");
    const run = session.newRun("daily");
    await collect(streamWithFallback(run, openaiStep(), fakeGeminiStep("폴백")));
    const dump = JSON.stringify(session.publicSummary());
    assert(!dump.includes("sk-test-not-a-real-key"), "키 마스킹");
    assert(dump.includes("sk-***"), "마스킹 표시");
  } finally {
    restore();
  }
});
