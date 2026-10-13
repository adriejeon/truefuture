// 진짜미래 LLM 비교 테스트 러너 (GPT vs Gemini)
//
// 같은 차트·질문·지침으로 변형(variant)별 결과를 받아, 자동 지표와 블라인드 평가표를 만든다.
// 실행 방법은 같은 폴더의 README.md 참고.
//
//   deno run --allow-net --allow-env --allow-read --allow-write scripts/llm-compare/compare.ts \
//     --cases scripts/llm-compare/cases.json --variants openai,gemini
//
// 인증: admin_users 에 등록된 테스트 계정
//   TF_TEST_EMAIL / TF_TEST_PASSWORD  (또는 TF_ACCESS_TOKEN)
// 접속: SUPABASE_URL / SUPABASE_ANON_KEY (없으면 frontend/.env 의 VITE_* 값을 읽는다)
//
// 결제 차감 없음(cost 0), profileId 를 보내지 않아 데일리 1회 제한·히스토리에 영향을 주지 않는다.
// 결과 원문은 out/ 아래에만 저장된다 (git 제외). 콘솔에는 생년월일·질문 원문을 찍지 않는다.

type Variant = "openai" | "gemini" | "gemini-3.8";

interface Case {
  id: string;
  type: "daily" | "compatibility" | "consultation" | "lifetime" | "report";
  note?: string;
  /** get-fortune 요청 본문 (fortuneType 제외) */
  request?: Record<string, unknown>;
  /** 상담: 첫 답변 뒤 이어서 물을 후속 질문 */
  followUp?: string;
  /** 리포트: 본인 프로필 ID 와 질문 */
  profileId?: string;
  question?: string;
  sections?: number[];
  /** 리포트 질문 나누기 비교 모델 */
  decomposeModels?: string[];
}

interface Output {
  caseId: string;
  step: string; // "main" | "followup" | "section_0" ...
  variant: Variant;
  ok: boolean;
  text: string;
  error?: string;
  shareId?: string | null;
  clientMs: number;
  clientTtftMs: number | null;
  llm?: any;
  natalSigns?: Record<string, string>;
  question?: string;
  validation?: { ok: boolean; problems: string[] } | null;
}

// ---------- 설정 ----------

const args = parseArgs(Deno.args);
const casesPath = args.cases ?? "scripts/llm-compare/cases.json";
const variants = (args.variants ?? "openai,gemini").split(",").map((s) => s.trim()) as Variant[];
const only = args.only ? new Set(args.only.split(",")) : null;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const outDir = args.out ?? `scripts/llm-compare/out/${stamp}`;

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

async function readFrontendEnv(): Promise<Record<string, string>> {
  try {
    const txt = await Deno.readTextFile("frontend/.env");
    const env: Record<string, string> = {};
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

const fe = await readFrontendEnv();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? fe.VITE_SUPABASE_URL;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? fe.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("SUPABASE_URL / SUPABASE_ANON_KEY 가 필요합니다.");
  Deno.exit(1);
}

async function getAccessToken(): Promise<string> {
  const direct = Deno.env.get("TF_ACCESS_TOKEN");
  if (direct) return direct;
  const email = Deno.env.get("TF_TEST_EMAIL");
  const password = Deno.env.get("TF_TEST_PASSWORD");
  if (!email || !password) {
    console.error("TF_TEST_EMAIL/TF_TEST_PASSWORD 또는 TF_ACCESS_TOKEN 이 필요합니다.");
    Deno.exit(1);
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.error(`로그인 실패 (${res.status})`);
    Deno.exit(1);
  }
  return (await res.json()).access_token;
}

const token = await getAccessToken();
const headers = {
  Authorization: `Bearer ${token}`,
  apikey: ANON_KEY!,
  "Content-Type": "application/json",
};

// ---------- 호출 ----------

async function callFortuneStream(body: Record<string, unknown>): Promise<
  Pick<Output, "ok" | "text" | "error" | "shareId" | "clientMs" | "clientTtftMs" | "llm">
> {
  const started = performance.now();
  let ttft: number | null = null;
  let text = "";
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-fortune`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    return { ok: false, text: "", error: `HTTP ${res.status}: ${t.substring(0, 200)}`, clientMs: performance.now() - started, clientTtftMs: null };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let data: any;
      try {
        data = JSON.parse(payload);
      } catch {
        continue;
      }
      if (data.done) {
        return { ok: true, text, shareId: data.share_id ?? null, llm: data.llm, clientMs: performance.now() - started, clientTtftMs: ttft };
      }
      if (data.error) {
        return { ok: false, text, error: String(data.error), clientMs: performance.now() - started, clientTtftMs: ttft };
      }
      if (typeof data.text === "string") {
        if (ttft == null) ttft = performance.now() - started;
        text += data.text;
      }
    }
  }
  return { ok: false, text, error: "done 이벤트 없이 종료", clientMs: performance.now() - started, clientTtftMs: ttft };
}

async function fetchNatalSigns(shareId: string | null | undefined): Promise<Record<string, string> | undefined> {
  if (!shareId) return undefined;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-fortune?id=${shareId}`, { headers: { apikey: ANON_KEY! } });
  if (!res.ok) return undefined;
  const data = await res.json();
  const planets = data?.chart_data?.chart?.planets ?? {};
  const signs: Record<string, string> = {};
  for (const [k, v] of Object.entries(planets)) {
    if (v && typeof (v as any).sign === "string") signs[k] = (v as any).sign;
  }
  return signs;
}

async function callReport(action: string, body: Record<string, unknown>): Promise<any> {
  const started = performance.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/premium-report`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  return { ...data, clientMs: performance.now() - started, httpStatus: res.status };
}

// ---------- 자동 지표 ----------

const PLANET_KO: Record<string, string> = {
  sun: "태양", moon: "달", mercury: "수성", venus: "금성", mars: "화성", jupiter: "목성", saturn: "토성",
};
const SIGN_KO: Record<string, string[]> = {
  Aries: ["양자리"], Taurus: ["황소자리"], Gemini: ["쌍둥이자리"], Cancer: ["게자리"], Leo: ["사자자리"],
  Virgo: ["처녀자리"], Libra: ["천칭자리"], Scorpio: ["전갈자리"], Sagittarius: ["궁수자리", "사수자리"],
  Capricorn: ["염소자리"], Aquarius: ["물병자리"], Pisces: ["물고기자리"],
};
const ALL_SIGNS_KO = Object.values(SIGN_KO).flat();

function sentences(text: string): string[] {
  return text
    .replace(/[#*>_`|-]/g, " ")
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 8);
}

function metrics(o: Output) {
  const text = o.text ?? "";
  const sents = sentences(text);
  const seen = new Map<string, number>();
  for (const s of sents) seen.set(s, (seen.get(s) ?? 0) + 1);
  const dupSentences = [...seen.values()].filter((c) => c > 1).reduce((a, c) => a + c - 1, 0);

  const words = text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const tri = new Map<string, number>();
  for (let i = 0; i + 2 < words.length; i++) {
    const k = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    tri.set(k, (tri.get(k) ?? 0) + 1);
  }
  const triTotal = Math.max(1, words.length - 2);
  const triRepeated = [...tri.values()].filter((c) => c > 1).reduce((a, c) => a + c, 0);

  // 근거 없는 사건 단정 후보 (사람이 최종 판단)
  const absolutes = (text.match(/반드시|틀림없이|확실히|100\s?%|무조건|절대로?|분명히/g) ?? []).length;
  const eventAssertions = sents.filter((s) =>
    /(사고|질병|병에|암|이별|이혼|합격|불합격|사망|파산|수술|임신|해고|소송)/.test(s) &&
    /(합니다|됩니다|입니다|겪게 됩니다|생깁니다|일어납니다|할 것입니다|될 것입니다)\.?$/.test(s) &&
    !/(수 있|가능성|경향|조심|주의|유의|흐름)/.test(s)
  );

  // 질문 구체성: 질문의 2자 이상 어절(조사 제거 근사)이 답변에 얼마나 등장하는지
  let questionCoverage: number | null = null;
  if (o.question) {
    const keys = [...new Set(
      o.question.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
        .map((w) => w.replace(/(은|는|이|가|을|를|에|에서|의|도|로|으로|와|과|랑|까지|부터|요|까요|나요|할까요)$/u, ""))
        .filter((w) => w.length >= 2),
    )];
    const hit = keys.filter((k) => text.includes(k)).length;
    questionCoverage = keys.length ? Math.round((hit / keys.length) * 100) / 100 : null;
  }

  // 차트 일치: "태양 … ○○자리" 처럼 행성과 사인이 가까이 나온 문장을 출생 차트와 대조 (트랜짓 언급은 오탐 가능)
  const chartSuspects: string[] = [];
  if (o.natalSigns) {
    for (const [key, ko] of Object.entries(PLANET_KO)) {
      const natal = o.natalSigns[key];
      if (!natal) continue;
      const allowed = SIGN_KO[natal] ?? [];
      const re = new RegExp(`(?:출생|네이탈|본명)?\\s*${ko}[이가은는의]?\\s*(?:[^.\\n]{0,8}?)(${ALL_SIGNS_KO.join("|")})`, "g");
      for (const m of text.matchAll(re)) {
        const around = text.slice(Math.max(0, (m.index ?? 0) - 15), (m.index ?? 0) + m[0].length);
        if (!allowed.includes(m[1]) && !/트랜짓|현재|지금|오늘|이번|요즘|올해|진행|프로그레스|솔라/.test(around)) {
          chartSuspects.push(`${m[0].trim()} (출생 ${ko}: ${allowed[0] ?? natal})`);
        }
      }
    }
  }

  const politeEndings = (text.match(/(습니다|세요|어요|아요|해요|예요|이에요|까요)[.!?\s]/g) ?? []).length;
  const plainEndings = (text.match(/(한다|된다|이다|있다|없다)[.!?\s]/g) ?? []).length;

  return {
    chars: text.length,
    sentences: sents.length,
    dupSentenceRatio: sents.length ? Math.round((dupSentences / sents.length) * 1000) / 1000 : 0,
    repeatedTrigramRatio: Math.round((triRepeated / triTotal) * 1000) / 1000,
    absolutes,
    eventAssertions,
    questionCoverage,
    chartSuspects,
    politeRatio: politeEndings + plainEndings ? Math.round((politeEndings / (politeEndings + plainEndings)) * 100) / 100 : null,
  };
}

function llmLine(llm: any): {
  label: string;
  fellBack: boolean;
  costUsd: number | null;
  tokens: string;
  serverMs: number | null;
} {
  const runs: any[] = llm?.runs ?? [];
  if (!runs.length) return { label: "(메타 없음 — 테스트 권한 확인)", fellBack: false, costUsd: null, tokens: "-", serverMs: null };
  const finals = [...new Set(runs.map((r) => `${r.finalProvider ?? "실패"}:${r.finalModel ?? "-"}`))];
  const fellBack = runs.some((r) => r.fellBack);
  const reasons = [...new Set(runs.filter((r) => r.fellBack || r.fallbackReason).map((r) => r.fallbackReason))].filter(Boolean);
  let cost = 0;
  let costKnown = false;
  let inT = 0, cT = 0, outT = 0, rT = 0;
  let serverMs = 0;
  for (const r of runs) {
    if (typeof r.totalCostUsd === "number") {
      cost += r.totalCostUsd;
      costKnown = true;
    }
    serverMs = Math.max(serverMs, r.latencyMs ?? 0);
    for (const a of r.attempts ?? []) {
      inT += a.usage?.inputTokens ?? 0;
      cT += a.usage?.cachedInputTokens ?? 0;
      outT += a.usage?.outputTokens ?? 0;
      rT += a.usage?.reasoningTokens ?? 0;
    }
  }
  return {
    label: finals.join(" + ") + (fellBack ? ` ⚠️ 폴백(${reasons.join(",")})` : ""),
    fellBack,
    costUsd: costKnown ? Math.round(cost * 1e6) / 1e6 : null,
    tokens: `in ${inT} (cache ${cT}) / out ${outT} (reasoning ${rT})`,
    serverMs: serverMs || null,
  };
}

// ---------- 실행 ----------

const cases: Case[] = JSON.parse(await Deno.readTextFile(casesPath));
const outputs: Output[] = [];
const decomposeResults: any[] = [];

for (const c of cases) {
  if (only && !only.has(c.id)) continue;
  // 변형 순서를 케이스마다 바꿔 시간대·캐시 편향을 줄인다
  const order = cases.indexOf(c) % 2 === 0 ? variants : [...variants].reverse();

  if (c.type === "report") {
    if (c.question) {
      const d = await callReport("test_decompose", {
        question: c.question,
        models: c.decomposeModels ?? ["gemini-3.5-flash", "gemini-2.5-flash-lite"],
      });
      decomposeResults.push({ caseId: c.id, ...d });
      console.log(`[${c.id}] 질문 나누기 비교 완료`);
    }
    for (const v of order) {
      let prior = "";
      for (const idx of c.sections ?? [0, 1, 2]) {
        console.log(`[${c.id}] ${v} section_${idx} 생성 중…`);
        const r = await callReport("test_section", {
          llmProvider: v,
          profile_id: c.profileId,
          question: c.question,
          section_index: idx,
          prior_content: prior,
        });
        outputs.push({
          caseId: c.id, step: `section_${idx}`, variant: v, ok: !!r.success, text: r.text ?? "",
          error: r.error ?? (r.success ? undefined : `HTTP ${r.httpStatus}`), clientMs: r.clientMs, clientTtftMs: null,
          llm: r.llm, natalSigns: r.natalSigns, question: c.question, validation: r.validation,
        });
        if (r.text) prior = prior ? `${prior}\n\n${r.text}` : r.text;
      }
    }
    continue;
  }

  for (const v of order) {
    console.log(`[${c.id}] ${v} 생성 중…`);
    const body = { ...(c.request ?? {}), fortuneType: c.type, llmProvider: v, cost: 0 };
    delete (body as Record<string, unknown>).profileId;
    const r = await callFortuneStream(body);
    // 궁합은 두 사람 차트가 섞여 언급되므로 출생 사인 대조를 하지 않는다
    const natalSigns = c.type === "compatibility" ? undefined : await fetchNatalSigns(r.shareId);
    const question = typeof c.request?.userQuestion === "string" ? c.request.userQuestion as string : undefined;
    outputs.push({ caseId: c.id, step: "main", variant: v, ...r, natalSigns, question });

    if (c.type === "consultation" && c.followUp && r.ok) {
      console.log(`[${c.id}] ${v} 후속 질문 생성 중…`);
      const r2 = await callFortuneStream({
        ...body,
        userQuestion: c.followUp,
        previousConversation: [{ question, interpretation: r.text }],
        parentResultId: r.shareId,
      });
      outputs.push({ caseId: c.id, step: "followup", variant: v, ...r2, natalSigns, question: c.followUp });
    }
  }
}

// ---------- 결과 저장 ----------

await Deno.mkdir(outDir, { recursive: true });
await Deno.writeTextFile(`${outDir}/results.json`, JSON.stringify({ outputs, decomposeResults }, null, 2));

const md: string[] = [];
const key: Record<string, Record<string, string>> = {};
const rubric: string[] = [
  "case,step,label,자연스러움(1-5),상담문체(1-5),반복없음(1-5),질문구체성(1-5),차트일치(1-5),근거없는단정없음(1-5),메모",
];

md.push(`# LLM 비교 결과 (${stamp})`, "");
md.push("> ⚠️ 표시가 있는 결과는 요청한 공급자가 실패해 다른 모델이 만든 것입니다. 해당 공급자의 품질 비교에서 제외하세요.", "");
md.push("## 요약", "");
md.push("| 케이스 | 단계 | 요청 | 실제 생성 모델 | 서버 ms | 클라이언트 ms | 첫 글자 ms | 토큰 | 비용(USD) | 글자 수 | 중복문장 | 반복3gram | 단정 | 사건단정 | 질문반영 | 차트의심 | 존댓말 | 검증 |");
md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const o of outputs) {
  const m = metrics(o);
  const l = llmLine(o.llm);
  md.push(
    `| ${o.caseId} | ${o.step} | ${o.variant} | ${o.ok ? l.label : `❌ ${o.error ?? ""}`} | ${l.serverMs ?? "-"} | ${Math.round(o.clientMs)} | ${o.clientTtftMs != null ? Math.round(o.clientTtftMs) : "-"} | ${l.tokens} | ${l.costUsd ?? "-"} | ${m.chars} | ${m.dupSentenceRatio} | ${m.repeatedTrigramRatio} | ${m.absolutes} | ${m.eventAssertions.length} | ${m.questionCoverage ?? "-"} | ${m.chartSuspects.length} | ${m.politeRatio ?? "-"} | ${o.validation ? (o.validation.ok ? "통과" : `실패 ${o.validation.problems.length}`) : "-"} |`,
  );
}
md.push("", "비용은 서버 기록의 시도별 합계(최초 오류 호출 + 폴백 포함)입니다. 단가 출처가 unverified 인 모델은 공식 단가표로 확인하세요.", "");

if (decomposeResults.length) {
  md.push("## 리포트 질문 나누기 비교", "");
  for (const d of decomposeResults) {
    md.push(`### ${d.caseId}`, "");
    for (const r of d.results ?? []) {
      const u = r.attempts?.[0]?.usage;
      md.push(`- **${r.model}** — ${r.latencyMs}ms, in ${u?.inputTokens ?? "-"} / out ${u?.outputTokens ?? "-"}, $${r.totalCostUsd ?? "-"}${r.error ? `, ❌ ${r.error}` : ""}`);
      for (const q of r.subQuestions ?? []) md.push(`  ${q.id}. ${q.text}`);
    }
    md.push("");
  }
}

md.push("## 블라인드 원고", "", "라벨과 모델의 대응은 key.json 에 있습니다. 평가를 마친 뒤에 여세요.", "");
const groups = new Map<string, Output[]>();
for (const o of outputs) {
  const g = `${o.caseId}::${o.step}`;
  groups.set(g, [...(groups.get(g) ?? []), o]);
}
for (const [g, list] of groups) {
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  key[g] = {};
  md.push(`### ${g.replace("::", " · ")}`, "");
  shuffled.forEach((o, i) => {
    const label = String.fromCharCode(65 + i);
    const l = llmLine(o.llm);
    key[g][label] = `${o.variant} → ${l.label}`;
    const m = metrics(o);
    md.push(`#### 원고 ${label}${l.fellBack ? " (⚠️ 폴백 결과 — 요청 공급자 비교에서 제외)" : ""}${o.ok ? "" : " (❌ 생성 실패)"}`, "");
    if (m.eventAssertions.length) md.push(`> 사건 단정 후보: ${m.eventAssertions.slice(0, 5).join(" / ")}`, "");
    if (m.chartSuspects.length) md.push(`> 차트 불일치 의심: ${m.chartSuspects.slice(0, 5).join(" / ")}`, "");
    if (o.validation && !o.validation.ok) md.push(`> 형식 검증 실패: ${o.validation.problems.slice(0, 5).join(" / ")}`, "");
    md.push(o.text || "_(본문 없음)_", "");
    rubric.push(`${o.caseId},${o.step},${label},,,,,,,`);
  });
}

await Deno.writeTextFile(`${outDir}/report.md`, md.join("\n"));
await Deno.writeTextFile(`${outDir}/key.json`, JSON.stringify(key, null, 2));
await Deno.writeTextFile(`${outDir}/rubric.csv`, "﻿" + rubric.join("\n"));
console.log(`\n완료: ${outDir}/report.md (블라인드 키: key.json, 평가표: rubric.csv)`);
