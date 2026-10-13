// consultationTopics_test.ts — 자유상담 주제 계획(주주제·부주제·시간 프레임) 판단 규칙 검증 (순수 함수, 네트워크 없음)
//   deno test supabase/functions/get-fortune/utils/consultationTopics_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildConsultationPlan,
  detectStrongSubjectTopics,
  detectSubjectTopics,
  detectTimeFrame,
  planCategory,
  planLabel,
  type SubjectTopicId,
} from "./consultationTopics.ts";

const CROSS = "이직을 언제 할지 몰라서 연애 시작하기가 어려운데, 이직은 어떻게 될까요?";

/** 분류기 스텁: 호출 기록을 남기고 정해진 답을 돌려준다 */
function stubClassifier(answer: SubjectTopicId | null) {
  const calls: Array<{ question: string; candidates: SubjectTopicId[] }> = [];
  const classify = async (question: string, candidates: SubjectTopicId[]) => {
    calls.push({ question, candidates });
    return answer;
  };
  return { classify, calls };
}

Deno.test("시간 프레임은 정규식으로 따로 판단한다 (여럿이면 긴 쪽)", () => {
  assertEquals(detectTimeFrame("올해 안에 이직할 수 있을까요?"), "YEARLY");
  assertEquals(detectTimeFrame("3월에 이사 가도 될까요?"), "MONTHLY");
  assertEquals(detectTimeFrame("이번 주 흐름이 어때요?"), "WEEKLY");
  assertEquals(detectTimeFrame("올해 이번 달은 어때요?"), "YEARLY");
  assertEquals(detectTimeFrame("결혼할 수 있을까요?"), null);
});

Deno.test("강 키워드와 약 키워드: 스쳐 가는 단어는 부주제가 되지 않는다", () => {
  assertEquals(detectStrongSubjectTopics(CROSS), ["LOVE", "WORK"]);
  // 회사(약)·아프(약)·돈독(제외)은 강 키워드가 아니다
  assertEquals(detectSubjectTopics("회사 동료와 연애를 시작했어요"), ["LOVE", "WORK"]);
  assertEquals(detectStrongSubjectTopics("회사 동료와 연애를 시작했어요"), ["LOVE"]);
  assertEquals(detectStrongSubjectTopics("헤어지고 마음이 아파요"), []);
  assertEquals(detectStrongSubjectTopics("돈독한 사이예요"), []);
  assertEquals(detectStrongSubjectTopics("돈이 언제 들어올까요"), ["MONEY"]);
  assertEquals(detectStrongSubjectTopics("회사 생활이 힘든데 옮길까요"), ["WORK"]);
});

Deno.test("강 키워드 1개면 모델 없이 주주제 확정, 부주제 없음", async () => {
  const { classify, calls } = stubClassifier("HEALTH");
  const plan = await buildConsultationPlan({ questions: ["올해 안에 이직할 수 있을까요?"], classify });
  assertEquals(calls.length, 0, "모델 호출 없음");
  assertEquals(plan, { primary: "WORK", secondary: [], timeFrame: "YEARLY", source: "keyword" });
  assertEquals(planCategory(plan), "WORK");
  assertEquals(planLabel(plan), "WORK [YEARLY]");
});

Deno.test("약 키워드만 1개여도 주주제로 쓴다 (종전 동작 유지)", async () => {
  const { classify, calls } = stubClassifier(null);
  const plan = await buildConsultationPlan({ questions: ["상사가 저를 어떻게 보고 있을까요?"], classify });
  assertEquals(calls.length, 0);
  assertEquals(plan.primary, "WORK");
  assertEquals(plan.source, "keyword");
});

Deno.test("주제가 2개 이상이면 모델이 주주제를 고르고 나머지가 부주제", async () => {
  const { classify, calls } = stubClassifier("WORK");
  const plan = await buildConsultationPlan({ questions: [CROSS], classify });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].candidates, ["LOVE", "WORK"]);
  assertEquals(plan, { primary: "WORK", secondary: ["LOVE"], timeFrame: null, source: "model" });
  assertEquals(planLabel(plan), "WORK (+LOVE)");
});

Deno.test("모델이 실패하거나 OTHER 면 우선순위 폴백, 모델이 던져도 reject 하지 않는다", async () => {
  const { classify } = stubClassifier(null);
  const plan = await buildConsultationPlan({ questions: [CROSS], classify });
  assertEquals(plan, { primary: "LOVE", secondary: ["WORK"], timeFrame: null, source: "fallback" });

  const throwing = async () => { throw new Error("boom"); };
  const plan2 = await buildConsultationPlan({ questions: [CROSS], classify: throwing });
  assertEquals(plan2.primary, "LOVE");
  assertEquals(plan2.source, "fallback");
});

Deno.test("키워드가 전혀 없으면 모델에 맡기고, 그것도 없으면 주제 없음(OTHER)", async () => {
  const q = "요즘 뭘 해도 잘 안 풀리는 것 같아요";
  const { classify: pickLove, calls } = stubClassifier("LOVE");
  const plan = await buildConsultationPlan({ questions: [q], classify: pickLove });
  assertEquals(calls[0].candidates, []);
  assertEquals(plan, { primary: "LOVE", secondary: [], timeFrame: null, source: "model" });

  const none = await buildConsultationPlan({ questions: [q], classify: stubClassifier(null).classify });
  assertEquals(none, { primary: null, secondary: [], timeFrame: null, source: "none" });
  assertEquals(planCategory(none), "OTHER");
  assertEquals(planLabel(none), "OTHER");

  const yearOnly = await buildConsultationPlan({ questions: ["올해 흐름이 궁금해요"], classify: stubClassifier(null).classify });
  assertEquals(yearOnly, { primary: null, secondary: [], timeFrame: "YEARLY", source: "none" });
  assertEquals(planCategory(yearOnly), "YEARLY");
  assertEquals(planLabel(yearOnly), "[YEARLY]");
});

Deno.test("부주제는 최대 2개, 주주제가 모델 선택이면 후보 전부가 부주제 후보", async () => {
  const q = "연애도 이직도 투자도 수술도 다 걱정이에요";
  const { classify } = stubClassifier("HEALTH");
  const plan = await buildConsultationPlan({ questions: [q], classify });
  assertEquals(plan.primary, "HEALTH");
  assertEquals(plan.secondary, ["LOVE", "MONEY"]);
});

Deno.test("저장된 카테고리(후속 질문·명시 요청)가 주제면 모델 없이 그대로, 부주제는 질문들에서", async () => {
  const { classify, calls } = stubClassifier("WORK");
  const plan = await buildConsultationPlan({ storedCategory: "love", questions: [CROSS], classify });
  assertEquals(calls.length, 0);
  assertEquals(plan, { primary: "LOVE", secondary: ["WORK"], timeFrame: null, source: "stored" });
});

Deno.test("저장된 카테고리가 시간 프레임이면 그 프레임을 유지하고 주제는 질문들에서 (후속 질문, 모델 없음)", async () => {
  const plan = await buildConsultationPlan({
    storedCategory: "YEARLY",
    questions: ["올해 흐름이 궁금해요", "그럼 이직은요?"],
  });
  assertEquals(plan, { primary: "WORK", secondary: [], timeFrame: "YEARLY", source: "keyword" });
});

Deno.test("후속 질문: 앞선 질문의 주제가 유지되고 새 질문의 주제가 더해진다", async () => {
  const plan = await buildConsultationPlan({
    storedCategory: "WORK",
    questions: ["올해 안에 이직할 수 있을까요?", "그럼 결혼은 언제쯤 할 수 있을까요?"],
  });
  assertEquals(plan, { primary: "WORK", secondary: ["LOVE"], timeFrame: "YEARLY", source: "stored" });
});

Deno.test("AUTO/OTHER/빈 카테고리는 저장값으로 취급하지 않는다", async () => {
  for (const stored of ["AUTO", "OTHER", "GENERAL", "", null, undefined]) {
    const plan = await buildConsultationPlan({ storedCategory: stored, questions: ["올해 안에 이직할 수 있을까요?"] });
    assert(plan.primary === "WORK" && plan.source === "keyword", `stored=${stored}`);
  }
});
