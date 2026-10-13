// consultationTopics.ts — 자유상담 카테고리 ID·키워드
//  index.ts 의 카테고리 자동 판단(미선택 시)과 knowledgeBase.ts 의 지식베이스 주입 범위(질문 본문의
//  다른 주제 감지)가 같은 표를 쓴다.

export const CONSULTATION_TOPIC_IDS = [
  "LOVE", "MONEY", "WORK", "HEALTH", "EXAM", "MOVE", "WEEKLY", "MONTHLY", "YEARLY",
] as const;
export type ConsultationTopicId = (typeof CONSULTATION_TOPIC_IDS)[number];

/** 주제 카테고리 (시간 프레임 WEEKLY·MONTHLY·YEARLY 제외) */
export const SUBJECT_TOPIC_IDS = ["LOVE", "MONEY", "WORK", "HEALTH", "EXAM", "MOVE"] as const;
export type SubjectTopicId = (typeof SUBJECT_TOPIC_IDS)[number];

/** 카테고리를 고르지 않은 것으로 보는 값 */
export const AUTO_TOPIC_VALUES = new Set(["AUTO", "OTHER", "GENERAL"]);

export const TOPIC_KEYWORDS: Record<ConsultationTopicId, RegExp> = {
  LOVE: /연애|사랑|결혼|이별|재회|썸|소개팅|남친|여친|남자친구|여자친구|배우자|이혼|짝사랑|고백|데이트|인연|애인|남편|아내|love|marri|boyfriend|girlfriend|dating|relationship|crush|divorce|spouse/i,
  MONEY: /돈|재물|재산|투자|주식|코인|부동산|대출|빚|수입|월급|연봉|저축|복권|매매|money|invest|stock|crypto|debt|income|salary|wealth|loan/i,
  WORK: /이직|취업|직장|회사|사업|창업|승진|퇴사|커리어|직업|일자리|프리랜서|상사|팀장|업무|학원|가게|매출|career|job|work|business|promotion|resign|startup|boss|shop/i,
  HEALTH: /건강|병원|수술|질병|아프|통증|다이어트|체력|우울|불면|치료|health|sick|surgery|illness|pain|diet|depress|insomnia/i,
  EXAM: /시험|합격|수능|공무원|자격증|고시|입시|편입|필기|exam|test\b|pass\b|certificat|admission/i,
  MOVE: /이사|이민|유학|전근|해외|타지|집 ?구하|전세|월세|거주|move\b|moving|relocat|abroad|immigra/i,
  WEEKLY: /이번 ?주|다음 ?주|주간|일주일|this week|next week|weekly/i,
  MONTHLY: /이번 ?달|다음 ?달|월간|한 ?달|(?:^|[^0-9])[0-9]{1,2}월(?:에|의|은|는|엔|부터|까지|\s)|this month|next month|monthly/i,
  YEARLY: /올해|내년|연간|한 ?해|(?:19|20)[0-9]{2}년|신년|this year|next year|yearly|annual/i,
};

/** 다중 후보·모델 실패 시 폴백 우선순위: 시간 프레임(연/월/주)이 명시되면 그것을 우선 */
export const TOPIC_PRIORITY: ConsultationTopicId[] = [
  "YEARLY", "MONTHLY", "WEEKLY", "EXAM", "MOVE", "HEALTH", "LOVE", "MONEY", "WORK",
];

/**
 * 질문 본문에 언급된 주제 카테고리 (키워드 휴리스틱, SUBJECT_TOPIC_IDS 순서).
 * 선택한 카테고리와 다른 주제가 섞인 질문("연애 카테고리에서 이직 시기를 물음")을 잡기 위한 용도라
 * 오탐은 토큰을 조금 더 쓰는 비용만 있고, 미탐은 선택 카테고리 범위로 남는다.
 */
export function detectSubjectTopics(question: string | null | undefined): SubjectTopicId[] {
  const q = String(question ?? "");
  if (!q.trim()) return [];
  return SUBJECT_TOPIC_IDS.filter((t) => TOPIC_KEYWORDS[t].test(q));
}
