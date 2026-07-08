// daily-tarot Edge Function
// 타로/오라클 카드 키워드를 받아 Gemini 2.5 Flash-Lite로 그날의 AI 해석을 생성
// 인증 불필요 (무료 기능)
// AI 호출은 Vertex AI(서비스 계정 OAuth2)로 처리한다.

declare global {
  const Deno: {
    env: { get(key: string): string | undefined };
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getVertexAccessToken, buildVertexUrl } from "../_shared/vertex.ts";

const TAROT_MODEL = "gemini-2.5-flash-lite";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TarotRequest {
  cardId: string;
  cardName: string;
  keywords: string; // 쉼표 구분 키워드
  cardType: "tarot" | "oracle";
  isPositive: boolean;
  language?: "ko" | "en";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: TarotRequest = await req.json();
    const {
      cardId,
      cardName,
      keywords,
      cardType,
      isPositive,
      language = "ko",
    } = body;

    if (!cardId || !cardName || !keywords) {
      return new Response(
        JSON.stringify({ error: "cardId, cardName, keywords 필수" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Deno.env.get("GCP_SERVICE_ACCOUNT_JSON")) {
      return new Response(
        JSON.stringify({ error: "GCP_SERVICE_ACCOUNT_JSON not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const energyLabel = isPositive
      ? (language === "ko" ? "긍정적" : "positive")
      : (language === "ko" ? "부정적" : "challenging");

    const prompt = language === "ko"
      ? buildKoreanPrompt(cardName, keywords, cardType, energyLabel)
      : buildEnglishPrompt(cardName, keywords, cardType, energyLabel);

    const accessToken = await getVertexAccessToken();
    const geminiRes = await fetch(
      buildVertexUrl(TAROT_MODEL, "generateContent"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        // Vertex는 contents[].role 이 "user"|"model" 이어야 함 (role 누락 시 400)
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 320,
            topP: 0.95,
          },
          systemInstruction: {
            parts: [{ text: getSystemInstruction(language) }],
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(
        JSON.stringify({ error: `Gemini error: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const interpretation =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return new Response(
      JSON.stringify({ interpretation: interpretation.trim() }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getSystemInstruction(language: "ko" | "en"): string {
  if (language === "ko") {
    return `당신은 데일리 타로에서 '오늘의 키워드'를 가볍게 풀어주는 안내자입니다.
이 카드는 특정 질문에 대한 답이 아니라, 오늘 하루 전반의 '흐름에 대한 힌트'입니다.

작성 규칙:
- 먼저 오늘의 키워드가 어떤 결인지 자연스럽게 짚어주고, 그 기운이 하루 중 어떤 순간에 드러날 수 있는지 가볍게 이어주세요.
- "~할 수 있어요", "~한 순간을 마주할지도 몰라요"처럼 가능성을 열어두는 어조를 쓰세요. 단정하거나 예언하듯 말하지 마세요.
- 일·관계·마음·돈 등 어떤 상황에도 대입할 수 있게 범용적으로 표현하세요. 특정 질문이나 특정 상황을 임의로 가정하지 마세요.
- 마지막에 그 키워드를 오늘 어떻게 활용하면 좋을지 부드러운 한 마디를 덧붙이세요.
- 3~4문장, 따뜻하고 부드러운 구어체. 마크다운·제목·불릿·이모지 없이 일반 텍스트만.
- 표현은 매번 다르게 하세요.`;
  }
  return `You are a guide who lightly unpacks the "keywords of the day" in a daily tarot draw.
This card is not an answer to a specific question — it is a hint about the overall flow of the day.

Rules:
- First name the tone of today's keywords naturally, then connect it to moments where that energy might surface during the day.
- Use open, possibility-oriented phrasing like "you might…", "there may be a moment when…". Do not be definitive or predict as fact.
- Keep it general so it can apply to any area — work, relationships, feelings, money. Do not assume a specific question or situation.
- End with a soft note on how to make use of that keyword today.
- 3-4 sentences, warm and gentle conversational tone. Plain text only — no markdown, headings, bullets, or emoji.
- Vary your phrasing each time.`;
}

function buildKoreanPrompt(
  cardName: string,
  keywords: string,
  cardType: "tarot" | "oracle",
  energyLabel: string
): string {
  const typeLabel = cardType === "tarot" ? "타로 카드" : "오라클 카드";
  return `오늘 뽑힌 ${typeLabel}: ${cardName}
오늘의 키워드: ${keywords}
전반적 에너지: ${energyLabel}

이 키워드가 오늘 하루의 흐름에서 어떤 식으로 나타날 수 있는지, 위 규칙대로 범용적인 힌트로 풀어주세요.`;
}

function buildEnglishPrompt(
  cardName: string,
  keywords: string,
  cardType: "tarot" | "oracle",
  energyLabel: string
): string {
  const typeLabel = cardType === "tarot" ? "tarot card" : "oracle card";
  return `Today's drawn ${typeLabel}: ${cardName}
Today's keywords: ${keywords}
Overall energy: ${energyLabel}

Following the rules above, unpack how these keywords might show up in the flow of today as a general, widely-applicable hint.`;
}
