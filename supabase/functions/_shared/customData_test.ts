// 결제 customData 질문 인코딩 왕복 테스트 — 프런트 인코더(실제 파일)와 서버 디코더를 함께 검증
//   deno test --allow-read supabase/functions/_shared/customData_test.ts
import { assertEquals, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { decodeBase64UrlText, decodeCustomQuestion } from "./customData.ts";
// @ts-ignore 프런트 ESM 파일을 그대로 가져와 같은 알고리즘인지 확인
import { encodeTextForCustomData } from "../../../frontend/src/utils/paymentCustomData.js";

const SAMPLES = [
  "",
  "a",
  "ab",
  "abc",
  "올해 이직을 해도 될까요? 지금 회사에서 승진 가능성도 궁금해요.",
  '따옴표 """ 와 이모지 🌙✨, 줄바꿈\n그리고 탭\t포함',
  "한".repeat(300),
];

Deno.test("인코딩 결과는 ASCII(base64url) 만 포함한다", () => {
  for (const s of SAMPLES) {
    const enc = encodeTextForCustomData(s);
    assertMatch(enc, /^[A-Za-z0-9_-]*$/);
    if (s) assertEquals(enc.length > 0, true);
  }
});

Deno.test("프런트 인코딩 → 서버 디코딩 왕복이 원문과 같다", () => {
  for (const s of SAMPLES) {
    assertEquals(decodeBase64UrlText(encodeTextForCustomData(s)), s);
  }
});

Deno.test("decodeCustomQuestion: qe 우선, 구버전 평문 q 도 복원, 손상된 값은 빈 문자열", () => {
  const q = "궁합이 궁금해요";
  assertEquals(decodeCustomQuestion({ k: "report", qe: encodeTextForCustomData(q) }), q);
  assertEquals(decodeCustomQuestion({ k: "report", q: "  " + q + " " }), q);
  assertEquals(decodeCustomQuestion({ k: "report", qe: encodeTextForCustomData(q), q: "다른 값" }), q);
  // qe 가 깨졌으면 q 로 폴백
  assertEquals(decodeCustomQuestion({ qe: "%%%not-base64", q }), q);
  assertEquals(decodeCustomQuestion({ qe: "%%%not-base64" }), "");
  assertEquals(decodeCustomQuestion({ k: "report" }), "");
  assertEquals(decodeCustomQuestion(null), "");
  assertEquals(decodeCustomQuestion("string"), "");
});

Deno.test("300자 한글 질문의 인코딩 길이는 1,200자 (JSON 포함 약 1.3KB)", () => {
  const enc = encodeTextForCustomData("한".repeat(300));
  assertEquals(enc.length, 1200);
});
