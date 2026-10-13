// consultationPlan_prompt_test.ts — 주제 계획이 프롬프트 블록(지표성·타이밍 지시·시스템 지침)에 반영되는지 검증 (KO·EN)
//   deno test --no-check --allow-read --allow-env --allow-net supabase/functions/get-fortune/utils/consultationPlan_prompt_test.ts
//   (--no-check: astrologyCalculator.ts 의 기존 타입 오류 TS7053 때문)
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  analyzeCareerPotential,
  analyzeLoveQualities,
  calculateChart,
  calculateLotOfMarriage,
  identifySpouseCandidate,
} from "./astrologyCalculator.ts";
import * as ko from "./chartFormatter.ts";
import * as en from "./chartFormatter_en.ts";
import * as koPrompts from "../geminiPrompts.ts";
import * as enPrompts from "../geminiPrompts_en.ts";

// 가상 인물 (1990-05-15 10:30 KST, 서울)
const chart = await calculateChart(new Date("1990-05-15T01:30:00Z"), { lat: 37.5665, lng: 126.978 }, 9);
const spouse = identifySpouseCandidate(chart, "F");
const loveAnalysis = {
  lotOfMarriage: calculateLotOfMarriage(chart, "F"),
  loveQualities: analyzeLoveQualities(chart),
  spouseCandidate: spouse,
  loveTiming: { bestYears: [], notes: [] } as unknown,
  profectionSign: "Aries",
} as unknown as ko.LoveAnalysisData;
const careerAnalysis = analyzeCareerPotential(chart);
const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

for (const [label, fmt] of [["KO", ko], ["EN", en]] as const) {
  Deno.test(`${label}: 부주제가 없으면 getPlanSignificators 는 getCategorySignificators 와 같다`, () => {
    const a = fmt.getCategorySignificators(chart, "LOVE", { loveAnalysis });
    const b = fmt.getPlanSignificators(chart, "LOVE", [], { loveAnalysis });
    assertEquals(b, a);
    // 주주제와 같은 부주제는 무시
    assertEquals(fmt.getPlanSignificators(chart, "LOVE", ["love"], { loveAnalysis }), a);
  });

  Deno.test(`${label}: 연애 + 부주제 직업 → 지표성 합집합, 지시문에 부주제 표기`, () => {
    const love = fmt.getCategorySignificators(chart, "LOVE", { loveAnalysis });
    const work = fmt.getCategorySignificators(chart, "WORK", { careerAnalysis });
    const merged = fmt.getPlanSignificators(chart, "LOVE", ["WORK"], { loveAnalysis, careerAnalysis });

    for (const n of [...love.primary, ...work.primary]) {
      assert(lower(merged.primary).includes(n.toLowerCase()), `${n} 포함`);
    }
    assertStringIncludes(merged.primary.join(","), "Venus");
    assertStringIncludes(merged.primary.join(","), "MC");
    assertEquals(new Set(lower(merged.primary)).size, merged.primary.length, "중복 없음");
    assertStringIncludes(merged.timingFilterInstruction, "Current Category: **LOVE**");
    assertStringIncludes(merged.timingFilterInstruction, "Secondary Topics: **WORK**");
    assertStringIncludes(merged.timingFilterInstruction, "Additional Guidance for LOVE");
    // 부주제가 둘이면 둘 다 표기
    const three = fmt.getPlanSignificators(chart, "LOVE", ["WORK", "EXAM"], { loveAnalysis, careerAnalysis });
    assertStringIncludes(three.timingFilterInstruction, "Secondary Topics: **WORK, EXAM**");
    assert(three.houseLordsBlock?.includes("(EXAM)"), "EXAM 하우스 주인 블록이 부주제 표기와 함께 붙는다");
  });
}

Deno.test("시스템 지침: 부주제가 있을 때만 복합 질문 지침이 붙고, 없으면 종전과 같다 (KO·EN)", () => {
  const koBase = koPrompts.getConsultationSystemPrompt("LOVE");
  assertEquals(koPrompts.getConsultationSystemPrompt("LOVE", []), koBase);
  const koMulti = koPrompts.getConsultationSystemPrompt("LOVE", ["WORK"]);
  assertStringIncludes(koMulti, "**복합 질문**: 이 질문은 LOVE · WORK 주제에 걸쳐 있습니다");
  assertStringIncludes(koMulti, "주 주제(LOVE) 기준");
  assert(koMulti.length > koBase.length);

  const enBase = enPrompts.getConsultationSystemPrompt("LOVE");
  assertEquals(enPrompts.getConsultationSystemPrompt("LOVE", []), enBase);
  const enMulti = enPrompts.getConsultationSystemPrompt("LOVE", ["WORK"]);
  assertStringIncludes(enMulti, "**Multi-topic question**: this question spans LOVE · WORK");
  assertStringIncludes(enMulti, "primary topic (LOVE)");
});
