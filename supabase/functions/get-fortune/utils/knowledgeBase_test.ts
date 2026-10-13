// knowledgeBase_test.ts — 자유상담 지식베이스 주입 범위(topic / full) 검증
//   deno test --no-check --allow-read --allow-env --allow-net supabase/functions/get-fortune/utils/knowledgeBase_test.ts
//   (--no-check: astrologyCalculator.ts 의 기존 타입 오류 TS7053 때문. 이 파일·knowledgeBase.ts 자체는 타입 오류 없음)
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { calculateChart } from "./astrologyCalculator.ts";
import { buildKnowledgeContext, consultationKbTopics, resolveKnowledgeScope } from "./knowledgeBase.ts";
import { detectSubjectTopics } from "./consultationTopics.ts";
import { FortuneType } from "../types.ts";

// 가상 인물 (1990-05-15 10:30 KST, 서울)
const chart = await calculateChart(new Date("1990-05-15T01:30:00Z"), { lat: 37.5665, lng: 126.978 }, 9);
const kb = (topic: string | null, kbScope?: "topic" | "full", question?: string, timeFrame?: string | null) =>
  buildKnowledgeContext(chart, FortuneType.CONSULTATION, {
    consultationTopic: topic,
    kbScope,
    questionTopics: detectSubjectTopics(question),
    timeFrame,
  });

Deno.test("full 범위는 종전과 같다 — 카테고리와 무관하게 동일, 1·2·7·10 하우스 + 직업·연애·재물 규칙", () => {
  const full = kb("WORK", "full");
  assertEquals(kb("LOVE", "full"), full);
  assertEquals(kb(null, "full"), full);
  for (const h of ["1하우스", "2하우스", "7하우스", "10하우스"]) assertStringIncludes(full, `· ${h}`);
  assertStringIncludes(full, "■ 적용 규칙");
  assertStringIncludes(full, "〔직업기질:");
});

Deno.test("OTHER · WEEKLY · MONTHLY · YEARLY · 미지정은 topic 모드에서도 전체 범위", () => {
  const full = kb("OTHER", "full");
  assertEquals(kb("OTHER"), full);
  assertEquals(kb(null), full);
  assertEquals(kb("WEEKLY"), full);
  assertEquals(kb("YEARLY"), kb("YEARLY", "full"));
  // 월간·연간은 솔라리턴 규칙이 추가된다 (기존 동작 유지)
  assertStringIncludes(kb("MONTHLY"), "■ 솔라리턴 해석 기준");
  assertEquals(kb("MONTHLY"), kb("MONTHLY", "full"));
});

Deno.test("topic 모드: 카테고리 관련 하우스·규칙만 들어가고 분량이 15% 이상 준다", () => {
  const full = kb("WORK", "full");

  const love = kb("LOVE");
  assertStringIncludes(love, "· 5하우스");
  assertStringIncludes(love, "· 7하우스");
  assert(!love.includes("· 10하우스"), "연애: 10하우스 제외");
  assert(!love.includes("〔직업기질:"), "연애: 직업 기질 제외");
  assert(!love.includes("재물경로:"), "연애: 재물 경로 제외");

  const work = kb("WORK");
  assertStringIncludes(work, "· 10하우스");
  assertStringIncludes(work, "· 6하우스");
  assertStringIncludes(work, "〔직업기질:");
  assert(!work.includes("· 7하우스"), "직업: 7하우스 제외");
  assert(!work.includes("재물경로:"), "직업: 재물 경로 제외");

  const money = kb("MONEY");
  assertStringIncludes(money, "· 2하우스");
  assertStringIncludes(money, "· 8하우스");
  assert(!money.includes("〔직업기질:"), "재물: 직업 기질 제외");

  const health = kb("HEALTH");
  assertStringIncludes(health, "· 6하우스");
  assertStringIncludes(health, "〔신체:");

  for (const t of ["LOVE", "MONEY", "WORK", "HEALTH", "EXAM", "MOVE"]) {
    const s = kb(t);
    assert(s.length < full.length * 0.85, `${t}: ${s.length} < ${Math.round(full.length * 0.85)}`);
    // 공통 블록은 유지
    assertStringIncludes(s, "· 1하우스");
    assertStringIncludes(s, "■ 핵심 기질 (사인)");
    assertStringIncludes(s, "■ 시기 해석 기준");
    assertStringIncludes(s, "■ 세외3행성·달의 교점 판단");
  }
});

Deno.test("질문에 다른 주제가 섞이면 그 주제의 하우스·규칙도 합쳐 넣는다 (선택 카테고리는 유지)", () => {
  // 연애 카테고리를 골랐지만 실제로는 이직을 묻는 질문
  const q = "이직을 언제 할지 몰라서 연애 시작하기가 어려운데, 이직은 어떻게 될까요?";
  assertEquals(detectSubjectTopics(q), ["LOVE", "WORK"]);
  assertEquals(consultationKbTopics("LOVE", detectSubjectTopics(q)), ["LOVE", "WORK"]);

  const mixed = kb("LOVE", undefined, q);
  for (const h of ["1하우스", "2하우스", "5하우스", "6하우스", "7하우스", "10하우스"]) {
    assertStringIncludes(mixed, `· ${h}`, `연애+직업: ${h} 포함`);
  }
  assertStringIncludes(mixed, "〔직업기질:");
  assert(!mixed.includes("재물경로:"), "연애+직업: 재물 경로는 여전히 제외");
  assert(mixed.length > kb("LOVE").length, "연애 단독보다 커진다");

  // 질문에 연애 키워드가 없어도 선택한 카테고리 범위는 유지된다
  const workOnly = kb("LOVE", undefined, "이직은 언제가 좋을까요?");
  assertStringIncludes(workOnly, "· 5하우스");
  assertStringIncludes(workOnly, "· 10하우스");

  // 선택 카테고리와 같은 주제만 언급하면 변화 없음
  assertEquals(kb("LOVE", undefined, "올해 결혼할 수 있을까요?"), kb("LOVE"));
  assertEquals(detectSubjectTopics("올해 흐름이 궁금해요"), []);

  // 주제가 3개 이상 섞이면 전체 범위
  const three = "연애도 이직도 돈 문제도 다 걱정이에요";
  assertEquals(consultationKbTopics("LOVE", detectSubjectTopics(three)), null);
  assertEquals(kb("LOVE", undefined, three), kb("LOVE", "full"));

  // 시간 프레임·기타 카테고리는 질문 주제와 무관하게 전체, full 모드도 질문 주제를 무시
  assertEquals(consultationKbTopics("YEARLY", ["WORK"]), null);
  assertEquals(kb("YEARLY", undefined, q), kb("YEARLY", "full"));
  assertEquals(kb("LOVE", "full", q), kb("WORK", "full"));
});

Deno.test("시간 프레임이 MONTHLY·YEARLY 면 주제 범위를 유지한 채 솔라리턴 규칙만 더한다", () => {
  const work = kb("WORK");
  assert(!work.includes("■ 솔라리턴 해석 기준"), "직업 단독: 솔라리턴 규칙 없음");
  const workYear = kb("WORK", undefined, undefined, "YEARLY");
  assertStringIncludes(workYear, "■ 솔라리턴 해석 기준");
  assertStringIncludes(workYear, "· 10하우스");
  assert(!workYear.includes("· 7하우스"), "직업+연간: 여전히 직업 범위");
  assert(workYear.length < kb("WORK", "full").length, "전체 범위보다 작다");
  assert(!kb("WORK", undefined, undefined, "WEEKLY").includes("■ 솔라리턴 해석 기준"), "주간은 솔라리턴 없음");
});

Deno.test("resolveKnowledgeScope: 요청값 > 환경변수 CONSULTATION_KB_SCOPE > 기본 topic", () => {
  Deno.env.delete("CONSULTATION_KB_SCOPE");
  assertEquals(resolveKnowledgeScope(undefined), "topic");
  assertEquals(resolveKnowledgeScope("full"), "full");
  assertEquals(resolveKnowledgeScope("bogus"), "topic");
  Deno.env.set("CONSULTATION_KB_SCOPE", "full");
  assertEquals(resolveKnowledgeScope(undefined), "full");
  assertEquals(resolveKnowledgeScope("topic"), "topic");
  Deno.env.delete("CONSULTATION_KB_SCOPE");
});
