// dailyTarotReading.js — 데일리 타로 '오늘의 흐름 힌트' 룰 기반 생성 (모델 호출 없음)
//
// 2026-10-13: Gemini 호출(daily-tarot 엣지 함수)을 없앴다. 6~12초 걸리고 간헐적으로 실패하던 것을
// 즉시·무료·결정적으로 바꾼다.
//  - 한국어: 카드마다 있는 고정 해석(description)에 날짜·카드로 정해지는 마무리 한 문장을 덧붙여
//    같은 카드라도 날마다 조금씩 다르게 보이게 한다.
//  - 영어: 고정 해석이 없어 keywordsEn 으로 3문장(결 → 드러나는 순간 → 활용)을 조립한다.
//    오라클 카드는 영어 키워드가 없어(한국어 그대로) 키워드를 넣지 않는 범용 문장을 쓴다.
//  - 같은 날·같은 카드·같은 언어면 항상 같은 문장 (localStorage 복원과 일치).
// 이 모듈은 React·네트워크에 의존하지 않는다.

/** 문자열 → 32비트 시드 (FNV-1a) */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — 시드 기반 난수 */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, r) {
  return list[Math.floor(r() * list.length) % list.length];
}

export function splitKeywords(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── 한국어 조사 ──
function hasBatchim(word) {
  const ch = String(word ?? "").trim().replace(/['"’”]+$/, "").slice(-1);
  const code = ch.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
/** 키워드에 조사 붙이기. 키워드는 따옴표로 감싸 명사가 아니어도 읽히게 한다 */
export const josa = {
  과: (w) => `'${w}'${hasBatchim(w) ? "과" : "와"}`,
  이: (w) => `'${w}'${hasBatchim(w) ? "이" : "가"}`,
  은: (w) => `'${w}'${hasBatchim(w) ? "은" : "는"}`,
  을: (w) => `'${w}'${hasBatchim(w) ? "을" : "를"}`,
  의: (w) => `'${w}'의`,
};

// 템플릿: { two: 키워드 2개 필요 여부, f: (k1, k2) => 문장 }
const KO_CLOSING_POSITIVE = [
  { two: false, f: (k1) => `오늘은 ${josa.을(k1)} 작은 일에서부터 실천해 보세요. 그 기운이 하루를 부드럽게 끌어 줄 수 있어요.` },
  { two: true, f: (k1, k2) => `${josa.과(k1)} ${josa.이(k2)} 함께 흐르는 날이에요. 조급해하지 말고 흐름을 믿어 보세요.` },
  { two: false, f: (k1) => `문득 ${josa.이(k1)} 떠오르는 순간이 있다면, 그게 오늘의 신호일지도 몰라요. 가볍게 따라가 보세요.` },
  { two: false, f: (k1) => `주변에 ${josa.을(k1)} 나눠 보세요. 돌아오는 기운이 생각보다 클 수 있어요.` },
  { two: true, f: (_k1, k2) => `오늘 하루 ${josa.을(k2)} 한 번만 의식해 보세요. 평범한 순간이 조금 다르게 보일지도 몰라요.` },
  { two: false, f: (k1) => `계획대로 되지 않아도 괜찮아요. 오늘은 ${josa.이(k1)} 알아서 길을 열어 주는 날이니까요.` },
];

const KO_CLOSING_NEGATIVE = [
  { two: false, f: (k1) => `${josa.이(k1)} 느껴지는 순간이 오더라도 억누르지 말고 이름을 붙여 보세요. 알아차리는 것만으로도 가벼워질 수 있어요.` },
  { two: true, f: (_k1, k2) => `오늘은 큰 결정을 서두르기보다 ${josa.을(k2)} 한 번 더 살펴보는 쪽이 나을 수 있어요.` },
  { two: false, f: (k1) => `${josa.의(k1)} 기운은 하루를 지나며 옅어질 수 있어요. 지금의 감정이 전부가 아니라는 걸 기억해 보세요.` },
  { two: false, f: (k1) => `${josa.과(k1)} 마주치면 한 박자 쉬어 가세요. 잠깐의 거리가 생각보다 많은 걸 바꿔 줄 수 있어요.` },
  { two: true, f: (_k1, k2) => `오늘은 ${josa.을(k2)} 핑계 삼아 나를 몰아세우지 않기로 해요. 할 수 있는 만큼만으로 충분해요.` },
  { two: false, f: (k1) => `${josa.이(k1)} 보이는 날엔 확실하지 않은 말에 흔들리기 쉬워요. 사실만 차분히 확인해 보세요.` },
];

const EN_OPENING_POSITIVE = [
  { two: true, f: (k1, k2) => `Today carries a gentle, uplifting tone, with ${k1} and ${k2} close to the surface.` },
  { two: false, f: (k1) => `There is a bright, open feeling to today, and ${k1} may be the thread running through it.` },
  { two: false, f: (k1) => `The energy of today leans toward ${k1}: light, forward-moving, and a little hopeful.` },
];
const EN_OPENING_NEGATIVE = [
  { two: false, f: (k1) => `Today has a heavier, more inward tone, and ${k1} may show up in small ways.` },
  { two: true, f: (k1, k2) => `The energy of today is a little tangled, with ${k1} and ${k2} asking for your attention.` },
  { two: false, f: (k1) => `Today may feel quieter and less certain than usual, and ${k1} could colour the mood.` },
];
const EN_MIDDLE = [
  { two: false, f: () => `You might notice it in a passing conversation, in how you react to a small delay, or in a thought that keeps returning.` },
  { two: false, f: () => `It may surface in a moment of choice, in the way you speak to someone, or in what you decide to let go of.` },
  { two: false, f: () => `Watch for it in the in-between moments: the commute, the pause before you answer, the quiet at the end of the day.` },
];
const EN_CLOSING_POSITIVE = [
  { two: true, f: (_k1, k2) => `If you lean into ${k2} today, even in one small decision, the day may open up more than you expect.` },
  { two: false, f: (k1) => `Let ${k1} guide one small thing you do today, and see where it leads.` },
  { two: false, f: (k1) => `There is no need to push; trust the flow and let ${k1} do some of the work.` },
];
const EN_CLOSING_NEGATIVE = [
  { two: false, f: (k1) => `If ${k1} rises, name it rather than fight it; noticing is often enough to soften it.` },
  { two: true, f: (_k1, k2) => `Hold off on big decisions if you can, and give ${k2} a second look before you act.` },
  { two: false, f: () => `This tone tends to fade as the day goes on, so treat it as weather, not a verdict.` },
];

// 영어 키워드가 없는 카드(오라클)용 범용 문장
const EN_GENERIC_POSITIVE = [
  `Today carries a gentle, uplifting tone, the kind that opens doors rather than closes them.`,
  `There is a bright, open feeling to today, and small things may go more smoothly than expected.`,
];
const EN_GENERIC_NEGATIVE = [
  `Today has a heavier, more inward tone, and it may ask for a little more patience than usual.`,
  `Today may feel quieter and less certain than usual, so give yourself room to move slowly.`,
];
const EN_GENERIC_CLOSING_POSITIVE = [
  `There is no need to push; trust the flow and let the day do some of the work.`,
  `Say yes to one small thing you would usually hesitate over, and see where it leads.`,
];
const EN_GENERIC_CLOSING_NEGATIVE = [
  `Treat today's mood as weather, not a verdict; it tends to fade as the day goes on.`,
  `Hold off on big decisions if you can, and check the facts before you react.`,
];

function render(pool, keywords, r) {
  const [k1, k2] = keywords;
  const eligible = keywords.length >= 2 ? pool : pool.filter((t) => !t.two);
  const tpl = pick(eligible.length ? eligible : pool, r);
  return tpl.f(k1, k2 ?? k1);
}

/**
 * 카드 → 오늘의 흐름 힌트.
 * @param {object} card tarotCards.js 의 카드 (id, keywords, keywordsEn, description, isPositive)
 * @param {{ language?: "ko" | "en", date: string }} opts date 는 한국 시간 기준 YYYY-MM-DD
 */
export function buildDailyTarotReading(card, { language = "ko", date }) {
  const lang = language === "en" ? "en" : "ko";
  const r = makeRng(hashSeed(`${date}|${card?.id ?? ""}|${lang}`));
  const positive = card?.isPositive !== false;

  if (lang === "ko") {
    const keywords = splitKeywords(card?.keywords);
    const base = String(card?.description ?? "").trim();
    if (keywords.length === 0) return base;
    const closing = render(positive ? KO_CLOSING_POSITIVE : KO_CLOSING_NEGATIVE, keywords, r);
    return [base, closing].filter(Boolean).join(" ");
  }

  const keywords = splitKeywords(card?.keywordsEn)
    .map((k) => k.toLowerCase())
    .filter((k) => /[a-z]/.test(k));
  if (keywords.length === 0) {
    return [
      pick(positive ? EN_GENERIC_POSITIVE : EN_GENERIC_NEGATIVE, r),
      render(EN_MIDDLE, [], r),
      pick(positive ? EN_GENERIC_CLOSING_POSITIVE : EN_GENERIC_CLOSING_NEGATIVE, r),
    ].join(" ");
  }
  return [
    render(positive ? EN_OPENING_POSITIVE : EN_OPENING_NEGATIVE, keywords, r),
    render(EN_MIDDLE, keywords, r),
    render(positive ? EN_CLOSING_POSITIVE : EN_CLOSING_NEGATIVE, keywords, r),
  ].join(" ");
}
