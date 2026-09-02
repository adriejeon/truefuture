// suggest-questions — 상담소 "이런 질문은 어떠세요?" 개인화 추천
//
// 해당 프로필로 이전에 던진 상담 질문(최근 5개)과 마지막 답변의 요지(제목·키워드·결론)를 바탕으로
// 플래시 모델이 후속 질문 2~3개를 만들어 돌려준다. 이력이 없으면 빈 배열(프론트는 일반 예시 칩 표시).
//
// 요청: POST { profile_id: string, language?: "ko" | "en" }  (Authorization: 사용자 JWT 필수)
// 응답: 200 { questions: string[], basedOn: number }  — 실패해도 200 + 빈 배열 (페이지를 막지 않는다)
//
// 원칙: 결제·차감 없음. 다른 사용자의 프로필은 403. 모델 호출은 8초 상한.

declare global {
  const Deno: {
    env: { get(key: string): string | undefined };
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVertexAccessToken, buildVertexUrl } from "../_shared/vertex.ts";

const SUGGEST_MODEL = "gemini-3.5-flash";
const MAX_QUESTIONS = 3;
const MODEL_TIMEOUT_MS = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMPTY = { questions: [] as string[], basedOn: 0 };

interface HistoryRow {
  user_question: string | null;
  result_id: string | null;
  created_at: string;
}

/** 이전 답변 JSON에서 제목·키워드·결론만 짧게 추출 (파싱 실패 시 앞부분 텍스트) */
function summarizeAnswer(fortuneText: string | null | undefined): string {
  if (!fortuneText) return "";
  try {
    const parsed = JSON.parse(fortuneText);
    const bits: string[] = [];
    const title = parsed?.summary?.title ?? parsed?.header?.title;
    if (typeof title === "string" && title.trim()) bits.push(`제목: ${title.trim()}`);
    const kw = parsed?.summary?.keywords ?? parsed?.header?.keyword;
    if (Array.isArray(kw) && kw.length) bits.push(`키워드: ${kw.slice(0, 5).join(", ")}`);
    else if (typeof kw === "string" && kw.trim()) bits.push(`키워드: ${kw.trim()}`);
    const conclusion = parsed?.answer?.conclusion ?? parsed?.summary?.conclusion;
    if (typeof conclusion === "string" && conclusion.trim()) {
      bits.push(`결론: ${conclusion.trim().slice(0, 240)}`);
    }
    if (bits.length) return bits.join(" / ");
  } catch (_) {
    // JSON 이 아니면 아래 폴백
  }
  return String(fortuneText).replace(/\s+/g, " ").trim().slice(0, 240);
}

function buildSystemPrompt(language: "ko" | "en"): string {
  if (language === "en") {
    return `You help an astrology consultation service suggest the next questions a returning client might want to ask.
You receive the client's previous questions (newest first) and the gist of the latest answer.
Write ${MAX_QUESTIONS} short follow-up questions in English that this specific client would plausibly ask next.
Rules:
- Each question must be specific to their situation (reference the actual topic, people, timing or decision from their history). No generic fortune questions.
- Do not repeat a previous question verbatim; move the conversation forward (next step, timing, a related concern they implied).
- Keep each under 90 characters, first person, natural spoken tone matching how the client writes.
- No medical diagnosis, legal advice, or guarantees.
Return JSON only: {"questions":["...","...","..."]}`;
  }
  return `당신은 점성술 상담 서비스에서 재방문 내담자에게 "다음에 물어볼 만한 질문"을 제안하는 도우미입니다.
내담자가 이 프로필로 이전에 던진 질문(최신순)과 마지막 답변의 요지를 받습니다.
이 내담자가 실제로 이어서 물어볼 법한 짧은 후속 질문 ${MAX_QUESTIONS}개를 한국어로 만드세요.
규칙:
- 이력에 나온 실제 주제·인물·시점·결정을 구체적으로 이어받아야 합니다. 누구에게나 해당되는 일반 운세 질문은 금지.
- 이전 질문을 그대로 반복하지 말고 대화를 한 걸음 진전시키세요(다음 단계, 시기, 이력에서 암시된 관련 고민).
- 각 질문은 40자 이내, 1인칭, 내담자가 쓴 말투(반말/존댓말)를 따르는 자연스러운 구어체.
- 의료 진단·법률 자문·결과 보장 표현 금지.
JSON 만 출력: {"questions":["...","...","..."]}`;
}

async function generateSuggestions(
  language: "ko" | "en",
  questions: string[],
  latestAnswerGist: string,
): Promise<string[]> {
  const userText =
    `[이전 질문 — 최신순]\n` +
    questions.map((q, i) => `${i + 1}. ${q}`).join("\n") +
    (latestAnswerGist ? `\n\n[마지막 답변 요지]\n${latestAnswerGist}` : "");

  const accessToken = await getVertexAccessToken();
  const call = fetch(buildVertexUrl(SUGGEST_MODEL, "generateContent"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: buildSystemPrompt(language) }] },
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 300,
        responseMimeType: "application/json",
      },
    }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("suggest timeout")), MODEL_TIMEOUT_MS)
  );
  const data = await Promise.race([call, timeout]);
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p?.text ?? "")
    .join("");

  let list: unknown = [];
  try {
    const parsed = JSON.parse(text);
    list = Array.isArray(parsed) ? parsed : parsed?.questions;
  } catch (_) {
    // 모델이 JSON 을 어긋나게 낸 경우: 줄 단위 폴백
    list = text.split("\n").map((l) => l.replace(/^[\s\-\d.)"]+|["\s,]+$/g, ""));
  }
  const maxLen = language === "en" ? 110 : 60;
  const prev = new Set(questions.map((q) => q.replace(/\s+/g, "")));
  const out: string[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item !== "string") continue;
    const q = item.trim();
    if (!q || q.length > maxLen) continue;
    if (prev.has(q.replace(/\s+/g, ""))) continue; // 이전 질문 그대로 반복 금지
    if (out.some((o) => o === q)) continue;
    out.push(q);
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return json(500, { error: "server config" });
    const admin = createClient(supabaseUrl, serviceKey);

    // 인증: 사용자 JWT 필수
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { error: "unauthorized" });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userErr || !userId) return json(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const profileId = typeof body?.profile_id === "string" ? body.profile_id.trim() : "";
    const language: "ko" | "en" =
      String(body?.language ?? "ko").toLowerCase().startsWith("en") ? "en" : "ko";
    if (!profileId) return json(400, { error: "profile_id required" });

    // 프로필 소유 확인
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return json(403, { error: "forbidden" });

    // 최근 상담 질문 (서버·클라이언트 이중 기록이 있어 result_id 로 중복 제거)
    const { data: rows } = await admin
      .from("fortune_history")
      .select("user_question, result_id, created_at")
      .eq("user_id", userId)
      .eq("profile_id", profileId)
      .eq("fortune_type", "consultation")
      .not("user_question", "is", null)
      .order("created_at", { ascending: false })
      .limit(16);

    const seenResult = new Set<string>();
    const seenQ = new Set<string>();
    const questions: string[] = [];
    let latestResultId: string | null = null;
    for (const r of (rows ?? []) as HistoryRow[]) {
      const q = (r.user_question ?? "").trim();
      if (!q) continue;
      if (r.result_id) {
        if (seenResult.has(r.result_id)) continue;
        seenResult.add(r.result_id);
      }
      const key = q.replace(/\s+/g, "");
      if (seenQ.has(key)) continue;
      seenQ.add(key);
      if (!latestResultId && r.result_id) latestResultId = r.result_id;
      questions.push(q.slice(0, 200));
      if (questions.length >= 5) break;
    }
    if (questions.length === 0) return json(200, EMPTY);

    // 마지막 답변 요지
    let gist = "";
    if (latestResultId) {
      const { data: result } = await admin
        .from("fortune_results")
        .select("fortune_text")
        .eq("id", latestResultId)
        .maybeSingle();
      gist = summarizeAnswer(result?.fortune_text);
    }

    try {
      const suggestions = await generateSuggestions(language, questions, gist);
      return json(200, { questions: suggestions, basedOn: questions.length });
    } catch (e) {
      console.warn("⚠️ suggest-questions 모델 실패:", (e as Error)?.message);
      return json(200, { ...EMPTY, basedOn: questions.length });
    }
  } catch (e) {
    console.error("❌ suggest-questions 오류:", e);
    return json(200, EMPTY);
  }
});
