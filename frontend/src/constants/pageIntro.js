/**
 * 공개 서비스 페이지 하단 '이 페이지 안내' 아코디언의 내용 — 단일 소스.
 *
 * 화면(components/PageIntro.jsx)과 빌드 시 프리렌더(src/prerender/entry.jsx → scripts/prerender-pages.js)가
 * 같은 함수를 호출하므로 최초 HTML 과 hydration 후 DOM 의 텍스트가 같다.
 *
 * 원칙
 *  · 실제 화면·상품·약관에서 확인할 수 있는 사실만 쓴다. 수치는 constants/pricing.js·packages.js 에서 가져온다.
 *  · '페이지 목적' 본문은 그 페이지의 meta description 과 같은 문장을 쓴다(호출자가 넘긴다) —
 *    본문 소개·meta·JSON-LD description 이 어긋나지 않게 하기 위함.
 *  · 개인화된 결과 화면에는 붙이지 않는다(각 페이지가 결과 표시 중이면 렌더하지 않는다).
 */
import {
  COMPATIBILITY_PRICE,
  CONSULTATION_PRICE,
  DAILY_PACK_PRICE,
  DAILY_PACK_QUANTITY,
  LIFETIME_PRICE,
  REFUND_WINDOW_DAYS,
  REPORT_ETA_MINUTES,
  REPORT_PRICE,
  REPORT_YEAR_COUNT,
  REPORT_YEAR_SPAN,
  TICKET_VALIDITY_DAYS,
} from "./pricing.js";
import { TICKET_PACKAGES } from "./packages.js";

const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const usdish = (n) => `₩${Number(n).toLocaleString("en-US")}`;
const eta = `${REPORT_ETA_MINUTES.min}~${REPORT_ETA_MINUTES.max}`;

/** 아코디언 토글 문구(summary)·항목 제목 */
export const PAGE_INTRO_LABELS = Object.freeze({
  ko: {
    toggle: "페이지 설명 보기",
    purpose: "페이지 목적",
    provides: "제공 내용",
    inputs: "입력 정보",
    output: "결과물",
    pricing: "가격·제공 기간",
  },
  en: {
    toggle: "View page details",
    purpose: "Purpose",
    provides: "What you get",
    inputs: "What you enter",
    output: "Deliverable",
    pricing: "Price and timing",
  },
});

/** 이용권 → 어떤 서비스에 쓰는지 (구매 페이지 안내용) */
function ticketUse(pkg, lang) {
  const ko = { telescope: "자유 질문 상담·궁합", compass: "오늘의 운세", probe: "종합 운세" };
  const en = { telescope: "free-form consultation and compatibility", compass: "daily fortune", probe: "life overview" };
  return (lang === "en" ? en : ko)[pkg.iconType] || "";
}

const VALIDITY_KO = `유료 이용권 유효기간은 결제일로부터 ${TICKET_VALIDITY_DAYS}일입니다.`;
const VALIDITY_EN = `Paid credits are valid for ${TICKET_VALIDITY_DAYS} days from the purchase date.`;
const REFUND_KO = `결제 후 ${REFUND_WINDOW_DAYS}일 이내 미사용분은 전액 환불되며, 사용한 이용권과 무료 지급분은 환불되지 않습니다.`;
const REFUND_EN = `Unused credits are fully refundable within ${REFUND_WINDOW_DAYS} days of purchase; used credits and free bonus credits are not refundable.`;

/**
 * 페이지별 항목. 각 항목의 body 는 문자열(문단) 또는 문자열 배열(목록).
 * purpose 는 호출자가 넘긴 description 을 우선 쓰고, 없을 때만 여기 값을 쓴다.
 */
const CONTENT = {
  home: {
    ko: {
      purpose:
        "출생 시각과 출생지를 기반으로 고전 점성술 출생 차트를 계산하고, 자유 질문 상담·궁합·연간 운세·10년 상세 리포트를 제공하는 비대면 AI 점성술 서비스입니다.",
      provides: [
        "자유 질문 상담: 연애·이직·금전 등 궁금한 질문을 직접 써서 출생 차트 기반 1:1 답변을 받습니다.",
        "궁합: 두 사람의 출생 차트를 대조해 서로 끌리는 지점과 거슬리는 지점을 해석합니다.",
        "데일리·종합 운세: 오늘의 흐름과 타고난 기질·인생 방향을 각각 확인합니다.",
        `프리미엄 상세 리포트: 질문 답변과 앞으로 약 ${REPORT_YEAR_SPAN}년의 연도별 시기 흐름을 PDF 서면 리포트로 받습니다.`,
        "데일리 타로: 타로·오라클 카드 한 장을 하루 한 번 무료로 뽑습니다.",
      ],
      inputs:
        "카카오 또는 구글 계정으로 로그인한 뒤 프로필에 생년월일, 출생 시각, 출생 도시를 등록합니다. 출생 시각을 모르면 정오 기준으로 계산하며 시기 분석의 정밀도는 낮아질 수 있습니다.",
      output:
        "해석은 화면에서 바로 읽고, 결과는 계정에 저장되어 다시 열람할 수 있습니다. 상세 리포트는 텍스트 PDF로 저장합니다.",
      pricing: [
        `자유 질문·궁합 1회: 망원경 1개 (${won(CONSULTATION_PRICE)})`,
        `오늘의 운세 1회: 나침반 1개 (${DAILY_PACK_QUANTITY}개 묶음 ${won(DAILY_PACK_PRICE)}부터)`,
        `종합 운세 1회: 탐사선 1대 (${won(LIFETIME_PRICE)})`,
        `프리미엄 상세 리포트: ${won(REPORT_PRICE)} 단건 결제, 결제 후 ${eta}분 안에 완성`,
        "데일리 타로: 무료",
        `${VALIDITY_KO} ${REFUND_KO}`,
      ],
    },
    en: {
      purpose:
        "A remote AI astrology service that computes your classical natal chart from birth time and birthplace, and offers free-form question consultations, compatibility, daily and life fortune, and a written 10-year report.",
      provides: [
        "Free-form consultation: ask about love, career or money and receive a one-to-one answer grounded in your natal chart.",
        "Compatibility: two natal charts compared to show where you attract and where you clash.",
        "Daily and life fortune: today's flow, and your innate temperament and life direction.",
        `Premium report: your answers plus a year-by-year outlook for roughly the next ${REPORT_YEAR_SPAN} years, delivered as a PDF.`,
        "Daily tarot: draw one tarot or oracle card a day, free.",
      ],
      inputs:
        "Sign in with Kakao or Google, then add a profile with birth date, birth time and birth city. If the time is unknown we use noon, which lowers timing precision.",
      output:
        "Readings appear on screen and are saved to your account for later. The premium report is saved as a text PDF.",
      pricing: [
        `Consultation or compatibility: 1 telescope credit (${usdish(CONSULTATION_PRICE)})`,
        `Daily fortune: 1 compass credit (from a pack of ${DAILY_PACK_QUANTITY} at ${usdish(DAILY_PACK_PRICE)})`,
        `Life overview: 1 probe credit (${usdish(LIFETIME_PRICE)})`,
        `Premium report: ${usdish(REPORT_PRICE)} one-off, ready ${eta} minutes after payment`,
        "Daily tarot: free",
        `${VALIDITY_EN} ${REFUND_EN}`,
      ],
    },
  },

  report: {
    ko: {
      purpose:
        `궁금한 질문에 먼저 답하고, 출생 시각과 출생지로 계산한 천체 위치를 바탕으로 앞으로 약 ${REPORT_YEAR_SPAN}년의 흐름을 연도별로 풀어 드리는 고전 점성술 서면 리포트입니다.`,
      provides: [
        "파트 1 — 질문에 대한 답: 결론부터 말하고, 그렇게 판단한 이유와 유력한 기간·주의할 기간을 이어서 씁니다.",
        `파트 2 — 앞으로 ${REPORT_YEAR_SPAN}년의 전체 흐름: 준비·확장·재정비·성과 구간의 조감도와 전반부 연도별 상세 흐름.`,
        "파트 3 — 후반부 연도별 흐름과 전환점: 방향이 실제로 바뀌는 지점과 그 앞에서 준비할 일, 마무리.",
      ],
      inputs:
        "프로필(생년월일·출생 시각·출생지)을 고르고 궁금한 질문을 적습니다. 질문은 선택 사항이며, 쓰지 않으면 시기 데이터에서 지금 인생 단계의 중요한 주제 2~3가지를 도출해 먼저 답합니다.",
      output:
        "A4 15쪽 내외의 서면 리포트. 텍스트 선택·검색이 되는 PDF로 저장할 수 있고, 마이페이지에서 언제든 다시 열람합니다.",
      pricing: [
        `가격: ${won(REPORT_PRICE)} 단건 결제 (국내 카드 결제)`,
        `완성 시간: 결제 후 3개 파트가 순서대로 작성되어 보통 ${eta}분`,
        `다루는 기간: 현재 시점부터 앞으로 약 ${REPORT_YEAR_SPAN}년, 시작 연도와 마지막 연도를 포함한 총 ${REPORT_YEAR_COUNT}개 연도 구간`,
        "생성이 중단되면 무료로 이어서 생성할 수 있습니다.",
      ],
    },
    en: {
      purpose:
        `A written classical-astrology report that answers your question first, then walks through roughly the next ${REPORT_YEAR_SPAN} years year by year, based on planetary positions computed from your birth time and birthplace.`,
      provides: [
        "Part 1 — Your question answered: the conclusion first, then the reasoning and the likely and cautionary periods.",
        `Part 2 — The next ${REPORT_YEAR_SPAN} years: an overview of preparation, expansion, consolidation and results, plus the first half year by year.`,
        "Part 3 — The later years and turning points: where direction actually shifts and what to prepare beforehand.",
      ],
      inputs:
        "Choose a profile (birth date, time and place) and optionally write your question. Without a question, the report leads with the two or three most important themes for your current life stage.",
      output:
        "A written report of about 15 A4 pages, saved as a searchable text PDF and available again any time from My Page.",
      pricing: [
        `Price: ${usdish(REPORT_PRICE)} one-off (Korean card payment)`,
        `Ready in about ${eta} minutes after payment, written in three parts in order`,
        `Covers roughly the next ${REPORT_YEAR_SPAN} years — ${REPORT_YEAR_COUNT} calendar-year segments including the first and last`,
        "If generation stops, it resumes free of charge.",
      ],
    },
  },

  consultation: {
    ko: {
      purpose: "출생 차트 계산 결과와 질문의 맥락을 함께 반영해 1:1 상담형 답변을 제공하는 자유 질문 상담입니다.",
      provides: [
        "질문의 맥락과 출생 차트 계산 결과를 함께 반영한 1:1 상담형 답변",
        "답변을 받은 뒤 같은 맥락에서 이어가는 후속 질문",
        "결과 카카오톡 공유",
      ],
      inputs: "프로필을 선택하고 질문을 자유롭게 씁니다(최대 1,000자). 구체적으로 쓸수록 답변이 정확해집니다.",
      output: "텍스트 답변. 대화 목록에 저장되어 언제든 다시 열람할 수 있습니다.",
      pricing: [
        `1회 망원경 1개 (${won(CONSULTATION_PRICE)}). 이용권은 구매 페이지에서 충전합니다.`,
        VALIDITY_KO,
      ],
    },
    en: {
      purpose: "A free-form consultation that answers your own question one-to-one, combining your natal chart with the context you describe.",
      provides: [
        "A one-to-one answer that reflects both your question's context and your natal chart",
        "Follow-up questions in the same thread after the first answer",
        "Share results via KakaoTalk",
      ],
      inputs: "Pick a profile and write your question freely (up to 1,000 characters). The more specific, the more precise the answer.",
      output: "A text answer, saved to your conversation list for later reading.",
      pricing: [`1 telescope credit per question (${usdish(CONSULTATION_PRICE)}). Top up on the purchase page.`, VALIDITY_EN],
    },
  },

  compatibility: {
    ko: {
      purpose: "두 사람의 출생 차트를 대조해 관계의 끌림과 마찰 지점을 해석하는 궁합 분석입니다.",
      provides: [
        "두 사람의 출생 차트를 대조(시너스트리)해 서로 끌리는 지점과 거슬리는 지점을 해석",
        "연인·배우자·친구·가족·동료 등 관계 유형에 맞춘 풀이",
        "종합 점수와 해석 텍스트",
      ],
      inputs: "프로필 2개를 선택하고 관계 유형을 고릅니다. 프로필마다 생년월일·출생 시각·출생 도시가 필요합니다.",
      output: "궁합 점수와 해석 텍스트. 결과는 저장되어 다시 열람하고 공유할 수 있습니다.",
      pricing: [`1회 망원경 1개 (${won(COMPATIBILITY_PRICE)})`, VALIDITY_KO],
    },
    en: {
      purpose: "A compatibility reading that compares two natal charts to show where a relationship attracts and where it chafes.",
      provides: [
        "Two natal charts compared (synastry) to show attraction and friction points",
        "Interpretation tuned to the relationship type — partner, spouse, friend, family or colleague",
        "An overall score with a written reading",
      ],
      inputs: "Select two profiles and a relationship type. Each profile needs birth date, time and city.",
      output: "A score and written reading, saved so you can revisit and share it.",
      pricing: [`1 telescope credit per reading (${usdish(COMPATIBILITY_PRICE)})`, VALIDITY_EN],
    },
  },

  yearly: {
    ko: {
      purpose: "출생 차트를 기준으로 오늘의 운세(데일리)와 종합 운세를 제공합니다.",
      provides: [
        "데일리 운세(오늘의 나침반): 날짜를 골라 그날의 흐름과 방향을 확인",
        "종합 운세(내 인생 사용 설명서): 타고난 기질과 잠재력, 인생의 방향성",
      ],
      inputs: "프로필을 선택합니다. 데일리 운세는 날짜를 함께 고릅니다.",
      output: "텍스트 해석. 결과는 저장되어 다시 열람할 수 있습니다.",
      pricing: [
        `데일리 운세 1회: 나침반 1개 (${DAILY_PACK_QUANTITY}개 묶음 ${won(DAILY_PACK_PRICE)}부터)`,
        `종합 운세 1회: 탐사선 1대 (${won(LIFETIME_PRICE)})`,
        VALIDITY_KO,
      ],
    },
    en: {
      purpose: "Daily fortune and a life overview, both read from your natal chart.",
      provides: [
        "Daily fortune (Today's Compass): pick a date to see that day's flow and direction",
        "Life overview (Your Owner's Manual): innate temperament, potential and life direction",
      ],
      inputs: "Select a profile. For the daily fortune, also pick a date.",
      output: "A written reading, saved for later.",
      pricing: [
        `Daily fortune: 1 compass credit (from a pack of ${DAILY_PACK_QUANTITY} at ${usdish(DAILY_PACK_PRICE)})`,
        `Life overview: 1 probe credit (${usdish(LIFETIME_PRICE)})`,
        VALIDITY_EN,
      ],
    },
  },

  dailyTarot: {
    ko: {
      purpose: "타로와 오라클 카드 중 한 장을 하루 한 번 무료로 뽑고, 뽑힌 카드의 의미와 오늘의 조언을 AI 해석으로 받아보는 페이지입니다.",
      provides: ["타로 카드 또는 오라클 카드 덱 선택", "하루 한 장 뽑기와 카드 의미 해석"],
      inputs: "덱만 고르면 됩니다. 로그인이나 출생 정보가 필요하지 않습니다.",
      output: "뽑힌 카드와 AI가 쓴 해석 텍스트. 같은 날에는 뽑은 카드가 그대로 유지됩니다.",
      pricing: "무료. 하루 한 번 뽑을 수 있습니다.",
    },
    en: {
      purpose: "Draw one tarot or oracle card once a day for free and read what the card means for you today, with an AI-written interpretation.",
      provides: ["Choose a tarot or an oracle deck", "One draw a day with the card's meaning explained"],
      inputs: "Just pick a deck. No sign-in or birth details needed.",
      output: "The drawn card and an AI-written reading. Your card for the day stays the same until tomorrow.",
      pricing: "Free. One draw per day.",
    },
  },

  purchase: {
    ko: {
      purpose: "진짜미래의 자유 질문 상담·궁합·오늘의 운세·종합 운세를 이용하기 위한 이용권 결제 페이지입니다.",
      provides: TICKET_PACKAGES.map((p) => `${p.nameKo} — ${won(p.price)} · ${ticketUse(p, "ko")}에 사용`),
      inputs: "로그인 후 원하는 묶음을 선택하고 결제합니다. 국내 카드(포트원)와 페이팔을 지원합니다.",
      output: "결제 즉시 이용권이 계정에 충전됩니다. 결제 내역은 마이페이지에서 확인합니다.",
      pricing: [VALIDITY_KO, REFUND_KO],
    },
    en: {
      purpose: "The purchase page for the credits used across True Future's consultation, compatibility, daily fortune and life overview.",
      provides: TICKET_PACKAGES.map((p) => `${p.nameEn} — ${usdish(p.price)} · for ${ticketUse(p, "en")}`),
      inputs: "Sign in, choose a pack and pay. Korean cards (PortOne) and PayPal are supported.",
      output: "Credits are added to your account immediately. Payment history is in My Page.",
      pricing: [VALIDITY_EN, REFUND_EN],
    },
  },
};

export const PAGE_INTRO_KEYS = Object.freeze(Object.keys(CONTENT));

/**
 * @param {keyof typeof CONTENT} pageKey
 * @param {"ko"|"en"} lang
 * @param {{ description?: string }} [opts]  description: 그 페이지의 meta description (purpose 본문으로 그대로 사용)
 * @returns {{ toggle: string, items: { key: string, title: string, body: string | string[] }[] }}
 */
export function getPageIntro(pageKey, lang = "ko", { description = null } = {}) {
  const page = CONTENT[pageKey];
  if (!page) throw new Error(`unknown page intro key: ${pageKey}`);
  const l = lang === "en" ? "en" : "ko";
  const labels = PAGE_INTRO_LABELS[l];
  const c = page[l];
  const items = [
    { key: "purpose", title: labels.purpose, body: description || c.purpose },
    { key: "provides", title: labels.provides, body: c.provides },
    { key: "inputs", title: labels.inputs, body: c.inputs },
    { key: "output", title: labels.output, body: c.output },
    { key: "pricing", title: labels.pricing, body: c.pricing },
  ];
  return { toggle: labels.toggle, items };
}
