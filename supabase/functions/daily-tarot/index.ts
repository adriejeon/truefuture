// daily-tarot Edge Function
// 타로/오라클 카드 키워드를 받아 Gemini 2.5 Flash-Lite로 그날의 AI 해석을 생성
// 인증 불필요 (무료 기능)

declare global {
  const Deno: {
    env: { get(key: string): string | undefined };
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const energyLabel = isPositive
      ? (language === "ko" ? "긍정적" : "positive")
      : (language === "ko" ? "부정적" : "challenging");

    const prompt = language === "ko"
      ? buildKoreanPrompt(cardName, keywords, cardType, energyLabel)
      : buildEnglishPrompt(cardName, keywords, cardType, energyLabel);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 220,
            topP: 0.9,
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
    return `당신은 타로 카드 전문 해석가입니다.
규칙:
- 오늘 하루를 위한 짧고 인사이트 있는 메시지를 생성합니다 (3-5문장).
- 매번 새롭고 다양한 시각과 표현으로 작성합니다. 기존 설명과 겹치지 마세요.
- 구체적이고 실생활에 적용 가능한 조언을 포함합니다.
- 부드럽고 따뜻하지만 직관적인 어조를 유지합니다.
- "오늘은" 또는 날짜 관련 표현으로 시작하지 마세요. 다양하게 시작하세요.
- 마크다운, 제목, 불릿 포인트 사용 금지. 일반 텍스트만 사용합니다.`;
  }
  return `You are a professional tarot card interpreter.
Rules:
- Generate a short, insightful daily message (3-5 sentences).
- Each response must be fresh and varied in perspective and phrasing.
- Include specific, actionable advice applicable to daily life.
- Maintain a warm yet intuitive tone.
- Do not start with "Today" or date-related expressions. Vary your openings.
- No markdown, headers, or bullet points. Plain text only.`;
}

function buildKoreanPrompt(
  cardName: string,
  keywords: string,
  cardType: "tarot" | "oracle",
  energyLabel: string
): string {
  const typeLabel = cardType === "tarot" ? "타로 카드" : "오라클 카드";
  return `오늘 뽑힌 ${typeLabel}: ${cardName}
에너지: ${energyLabel}
핵심 키워드: ${keywords}

위 카드의 에너지와 키워드를 바탕으로, 오늘 하루를 위한 타로 해석 메시지를 작성해주세요.
키워드를 기계적으로 나열하지 말고, 이야기처럼 자연스럽게 녹여주세요.`;
}

function buildEnglishPrompt(
  cardName: string,
  keywords: string,
  cardType: "tarot" | "oracle",
  energyLabel: string
): string {
  const typeLabel = cardType === "tarot" ? "tarot card" : "oracle card";
  return `Today's drawn ${typeLabel}: ${cardName}
Energy: ${energyLabel}
Core keywords: ${keywords}

Based on this card's energy and keywords, write a tarot interpretation message for today.
Do not mechanically list the keywords — weave them naturally into a flowing narrative.`;
}
