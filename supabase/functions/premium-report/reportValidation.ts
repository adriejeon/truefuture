/**
 * 프리미엄 상세 리포트 원고 검증
 * 생성된 각 파트가 구조·커버리지·표현 규칙을 지켰는지 검사한다.
 * 실패 항목은 재생성 시 교정 지시로 프롬프트에 덧붙인다.
 */

import type { SubQuestion } from "./premiumPrompts.ts";

export interface SectionValidationContext {
  sectionIndex: number; // 0: 질문 답변, 1: 10년 요약+전반부 연도, 2: 후반부 연도+마무리
  subQuestions: SubQuestion[] | null; // null 또는 [] → 질문 없음
  /** 이 파트에서 반드시 등장해야 하는 연도들 (예: [2026, 2027, ...]) */
  expectedYears: number[];
}

export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

// 본문에 노출되면 안 되는 점성학 전문 용어 (한국어 표기)
const JARGON_PATTERNS: RegExp[] = [
  /하우스/,
  /어센던트/,
  /상승궁/,
  /어스펙트/,
  /트라인/,
  /스퀘어(?!어)/,
  /섹스타일/,
  /컨정션/,
  /디그니티/,
  /도머사일/,
  /엑절테이션/,
  /데트리먼트/,
  /리셉션/,
  /프로펙션/,
  /솔라\s?리턴/,
  /피르다리?아?르?/,
  /프로그레션/,
  /트랜짓/,
  /알무텐/,
  /케이던트/,
  /석시던트/,
  /시너스트리/,
  /포르투나/,
  /루미너리/,
  /역행\s?정지/,
  /릴리징/,
  /조디아컬/,
  /사슬\s?풀림/,
  /\b(?:natal|transit|profection|firdaria|direction|progression|aspect|releasing)\b/i,
];

// 금지 표현 (극적·단정·AI 운세 클리셰)
const BANNED_PHRASES: RegExp[] = [
  /진짜\s?전성기/,
  /거짓된\s?호의/,
  /운명적으로/,
  /완벽한\s?배우자/,
  /뼈를\s?깎는/,
  /팩폭/,
  /갓생/,
  /---/,
  /다음 파트/,
  /이번 파트/,
  /파트 \d/,
];

function checkCommon(text: string, problems: string[]): void {
  for (const re of JARGON_PATTERNS) {
    const m = text.match(re);
    if (m) problems.push(`전문 용어 노출: "${m[0]}" — 일반인의 말로 바꿔 쓸 것`);
  }
  for (const re of BANNED_PHRASES) {
    const m = text.match(re);
    if (m) problems.push(`금지 표현 사용: "${m[0]}" — 차분한 상담체로 다시 쓸 것`);
  }
  if (/앞으로\s?5년/.test(text)) {
    problems.push(`"앞으로 5년" 표현 금지 — 이 리포트는 10년 시기 리포트임`);
  }
  if (/^\s*>/m.test(text)) {
    problems.push(`인용구(>) 요약 상자 사용 금지 — 문단으로 풀어 쓸 것`);
  }
  // 분량 하한은 섹션별로 별도 검사 (validateSection에서)
  // '내담자님' 남발 검사 (1,000자당 1회 초과 시)
  const nCount = (text.match(/내담자님/g) || []).length;
  if (nCount > Math.max(3, Math.ceil(text.length / 1000))) {
    problems.push(`'내담자님' 호칭 반복 ${nCount}회 — 주어 생략과 '본인은'을 섞어 줄일 것`);
  }
}

/** "### {heading}" 부터 다음 소제목(###/##) 직전까지의 세그먼트 길이 */
function segmentLength(text: string, headingPattern: string): number {
  const re = new RegExp(
    `###\\s*${headingPattern}[\\s\\S]*?(?=\\n##|$)`,
  );
  const m = text.match(re);
  return m ? m[0].trim().length : 0;
}

// 섹션별 최소 분량 (유료 리포트 밀도 확보 — 미달 시 교정 재생성)
const SECTION_MIN_CHARS: Record<number, number> = { 0: 4500, 1: 5500, 2: 5000 };
const YEAR_MIN_CHARS = 700;
const QUESTION_MIN_CHARS = 700;

export function validateSection(
  text: string,
  ctx: SectionValidationContext,
): ValidationResult {
  const problems: string[] = [];
  // 질문 소제목 줄("### 질문 N. …")은 사용자가 쓴 질문 원문을 그대로 옮긴 것이라
  // 전문 용어·금지 표현이 들어 있어도 모델의 잘못이 아니다 → 공통 표현 검사에서만 제외한다.
  // (소제목 존재 여부·분량 검사는 아래에서 원문 text 로 그대로 수행)
  const textForCommonChecks = text.replace(/^###\s*질문\s*\d+\..*$/gm, "");
  checkCommon(textForCommonChecks, problems);

  const minChars = SECTION_MIN_CHARS[ctx.sectionIndex] ?? 3000;
  if (text.trim().length < minChars) {
    problems.push(
      `분량 부족 (${text.trim().length}자, 최소 ${minChars}자) — 각 소절의 문단 수 지침을 지켜 더 깊고 충실하게 쓸 것`,
    );
  }

  const hasQ = !!(ctx.subQuestions && ctx.subQuestions.length > 0);

  if (ctx.sectionIndex === 0) {
    if (!/##\s*상담을 시작하며/.test(text)) {
      problems.push(`"## 상담을 시작하며" 소제목 누락`);
    }
    if (hasQ) {
      if (!/##\s*먼저,\s*질문에 답해드리면/.test(text)) {
        problems.push(`"## 먼저, 질문에 답해드리면" 소제목 누락 — 질문 결론을 초반에 제시할 것`);
      }
      if (!/##\s*질문에 대한 상세 답변/.test(text)) {
        problems.push(`"## 질문에 대한 상세 답변" 소제목 누락`);
      }
      for (const q of ctx.subQuestions!) {
        const re = new RegExp(`###\\s*질문\\s*${q.id}\\b`);
        if (!re.test(text)) {
          problems.push(`세부 질문 ${q.id}("${q.text.substring(0, 30)}…")에 대한 "### 질문 ${q.id}." 답변 소제목 누락`);
        } else {
          const len = segmentLength(text, `질문\\s*${q.id}\\b`);
          if (len < QUESTION_MIN_CHARS) {
            problems.push(
              `질문 ${q.id} 답변이 ${len}자로 너무 짧음 — 결론·근거·시기·행동 지침·판단 한계를 담아 6~9문단(최소 900자)으로 확장할 것`,
            );
          }
        }
      }
      if (!/##\s*질문을 이해하기 위해 필요한 타고난 성향/.test(text)) {
        problems.push(`"## 질문을 이해하기 위해 필요한 타고난 성향" 소제목 누락`);
      }
    } else {
      if (!/##\s*먼저,/.test(text)) {
        problems.push(`"## 먼저, 지금 흐름을 정리해드리면" 소제목 누락`);
      }
    }
  }

  if (ctx.sectionIndex === 1) {
    if (!/##\s*앞으로 10년의 전체 흐름/.test(text)) {
      problems.push(`"## 앞으로 10년의 전체 흐름" 소제목 누락`);
    }
    if (!/##\s*연도별 상세 흐름/.test(text)) {
      problems.push(`"## 연도별 상세 흐름" 소제목 누락`);
    }
  }

  if (ctx.sectionIndex === 2) {
    if (!/##\s*중요한 전환점과 준비할 일/.test(text)) {
      problems.push(`"## 중요한 전환점과 준비할 일" 소제목 누락`);
    }
    if (!/##\s*마무리/.test(text)) {
      problems.push(`"## 마무리" 소제목 누락`);
    }
  }

  // 연도 커버리지 + 연도별 밀도: 모든 연도가 "### {YYYY}년" 소제목과 충분한 분량으로 존재해야 함
  for (const y of ctx.expectedYears) {
    const re = new RegExp(`###\\s*${y}년`);
    if (!re.test(text)) {
      problems.push(`${y}년 연도별 풀이 누락 — "### ${y}년 …" 소제목으로 반드시 포함할 것`);
    } else {
      const len = segmentLength(text, `${y}년`);
      if (len < YEAR_MIN_CHARS) {
        problems.push(
          `${y}년 풀이가 ${len}자로 너무 짧음 — 핵심 주제·이전 해와의 연결·시기 구간·기회와 주의점·행동 지침을 담아 5~8문단(최소 900자)으로 확장할 것`,
        );
      }
    }
  }

  return { ok: problems.length === 0, problems };
}
