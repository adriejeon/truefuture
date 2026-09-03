/**
 * /faq 페이지의 질문·답변 단일 소스.
 * 화면(FAQ.jsx)과 FAQPage 구조화 데이터, 프리렌더 HTML 이 모두 이 배열을 쓴다 —
 * 화면에 없는 답변이 구조화 데이터에만 들어가는 일을 막기 위함이다.
 *
 * 답변에는 검증할 수 있는 사실만 쓴다(가격은 constants/pricing.js 에서 가져온다).
 */
import { CONSULTATION_PRICE } from "./pricing.js";

export const SITE_FAQ_ITEMS = Object.freeze([
  {
    title: "진짜미래는 다른 무료 사주 사이트와 무엇이 다른가요?",
    content:
      "진짜미래는 미리 써둔 문구를 조합해 보여주는 무료 운세가 아닙니다. 사주·타로가 아닌 서양 정통 고전 점성술을 사용하며, 태어난 시각과 출생지로 실제 천체 위치를 계산해 출생 차트를 만든 뒤 20년간 상담해 온 점성술사의 해석 규칙에 따라 질문에 답합니다. 이용권을 결제한 만큼만 사용하는 유료 서비스입니다.",
  },
  {
    title: "자유 질문 상담소에서는 어떤 고민을 물어볼 수 있나요?",
    content:
      "연애, 이직, 금전 등 구체적이고 복잡한 고민을 자유롭게 텍스트로 입력해 주세요. 질문의 맥락과 출생 차트 계산 결과를 함께 반영해 1:1 상담형 답변을 작성합니다.",
  },
  {
    title: "상담 비용 결제는 어떻게 진행되나요?",
    content: `자유 질문 상담 1회는 망원경 1개(${CONSULTATION_PRICE.toLocaleString(
      "ko-KR"
    )}원)로 이용합니다. 필요한 만큼 이용권을 구매해 쓰는 방식이며, 국내 카드 결제와 해외 이용자를 위한 페이팔(PayPal) 결제를 지원합니다.`,
  },
]);

/**
 * /report 랜딩 FAQ 의 i18n 키 목록.
 * 화면(ReportLanding.ReportFaq)·FAQPage JSON-LD·프리렌더가 같은 키를 읽는다.
 * 각 키는 `${key}_q` / `${key}_a` 로 질문·답변을 가진다.
 */
export const REPORT_FAQ_KEYS = Object.freeze(["faq_1", "faq_2", "faq_3", "faq_4"]);
