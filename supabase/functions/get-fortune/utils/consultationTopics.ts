// consultationTopics.ts — 자유상담 "주제 계획" (카테고리 ID·키워드·판단 규칙)
//
//  사용자는 질문만 넣고 카테고리를 고르지 않는다(웹·앱 모두 AUTO). 종전에는 서버가 카테고리 하나만 골라
//  모든 블록(시스템 지침·지표성·분석 블록·지식베이스·솔라리턴 지침)을 그 하나에 묶었다.
//  이 모듈은 질문을 두 축으로 나눠 판단한다.
//    - 주제(subject): 주주제(primary) 1개 + 부주제(secondary) 최대 2개
//    - 시간 프레임(timeFrame): WEEKLY · MONTHLY · YEARLY (정규식만, 모델 호출 없음)
//  판단 순서는 싼 것부터: 강 키워드 → 약 키워드 → (모호할 때만) 분류 모델 → 우선순위 폴백.
//  index.ts(판단·블록 연결)와 knowledgeBase.ts(지식베이스 범위)가 함께 쓴다.

export const CONSULTATION_TOPIC_IDS = [
  "LOVE", "MONEY", "WORK", "HEALTH", "EXAM", "MOVE", "WEEKLY", "MONTHLY", "YEARLY",
] as const;
export type ConsultationTopicId = (typeof CONSULTATION_TOPIC_IDS)[number];

/** 주제 카테고리 (시간 프레임 제외) */
export const SUBJECT_TOPIC_IDS = ["LOVE", "MONEY", "WORK", "HEALTH", "EXAM", "MOVE"] as const;
export type SubjectTopicId = (typeof SUBJECT_TOPIC_IDS)[number];

/** 시간 프레임 카테고리 */
export const TIME_FRAME_IDS = ["WEEKLY", "MONTHLY", "YEARLY"] as const;
export type TimeFrameId = (typeof TIME_FRAME_IDS)[number];

/** 카테고리를 고르지 않은 것으로 보는 값 */
export const AUTO_TOPIC_VALUES = new Set(["AUTO", "OTHER", "GENERAL"]);

/** 부주제 최대 개수. 주주제까지 3개가 되면 지식베이스는 전체 범위로 간다 (knowledgeBase.ts) */
export const MAX_SECONDARY_TOPICS = 2;

/**
 * 전체 키워드 (약 키워드 포함). 주주제 후보를 찾는 데 쓴다.
 * 약 키워드(회사·업무·일·아프·돈 등)는 다른 주제의 질문에도 흔히 섞여 들어오므로 부주제 판단에는 쓰지 않는다.
 */
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

/**
 * 강 키워드: 그 주제를 실제로 묻고 있다고 볼 수 있는 단어만. 부주제는 여기에만 반응한다.
 *  - "회사 동료와 연애" → 회사(약)는 무시, 연애(강)만
 *  - "돈독한 사이" → 돈독 제외
 *  - "마음이 아프다" → 아프(약) 무시
 */
export const STRONG_TOPIC_KEYWORDS: Record<SubjectTopicId, RegExp> = {
  LOVE: /연애|결혼|이별|재회|썸|소개팅|남친|여친|남자친구|여자친구|배우자|이혼|짝사랑|고백|데이트|애인|남편|아내|marri|boyfriend|girlfriend|dating|divorce|spouse/i,
  MONEY: /돈(?!독)|재물|재산|투자|주식|코인|부동산|대출|빚|수입|월급|연봉|저축|복권|invest|stock|crypto|debt|income|salary|wealth|loan/i,
  WORK: /이직|취업|직장|회사 ?(?:생활|옮|그만|이직|이동)|사업|창업|승진|퇴사|커리어|직업|일자리|프리랜서|매출|career|job\b|promotion|resign|startup/i,
  HEALTH: /건강|병원|수술|질병|통증|다이어트|체력|우울|불면|치료|health|surgery|illness|insomnia|depress/i,
  EXAM: /시험|합격|수능|공무원|자격증|고시|입시|편입|exam|certificat|admission/i,
  MOVE: /이사|이민|유학|전근|해외|타지|집 ?구하|전세|월세|moving|relocat|abroad|immigra/i,
};

/** 주제 후보가 여럿이고 모델도 못 골랐을 때의 폴백 순서 (좁고 구체적인 주제 우선) */
export const SUBJECT_PRIORITY: SubjectTopicId[] = ["EXAM", "MOVE", "HEALTH", "LOVE", "MONEY", "WORK"];
/** 시간 프레임이 여럿 언급되면 긴 쪽 우선 */
const TIME_FRAME_PRIORITY: TimeFrameId[] = ["YEARLY", "MONTHLY", "WEEKLY"];

export interface ConsultationPlan {
  /** 주주제. score·가이드·그래프 지식·지표성 추가 지침의 기준. null = 주제 없음(OTHER) */
  primary: SubjectTopicId | null;
  /** 부주제 (최대 MAX_SECONDARY_TOPICS). 지표성·분석 블록·지식베이스를 합집합으로 넓힌다 */
  secondary: SubjectTopicId[];
  /** 시간 프레임. MONTHLY·YEARLY 면 솔라리턴 지침·규칙이 붙는다 */
  timeFrame: TimeFrameId | null;
  /** 주주제를 정한 근거 (로그·검증용) */
  source: "stored" | "keyword" | "model" | "fallback" | "none";
}

/** 질문 본문에 언급된 주제 (전체 키워드, SUBJECT_TOPIC_IDS 순서) */
export function detectSubjectTopics(question: string | null | undefined): SubjectTopicId[] {
  const q = String(question ?? "");
  if (!q.trim()) return [];
  return SUBJECT_TOPIC_IDS.filter((t) => TOPIC_KEYWORDS[t].test(q));
}

/** 질문 본문에서 강 키워드로 확인되는 주제 */
export function detectStrongSubjectTopics(question: string | null | undefined): SubjectTopicId[] {
  const q = String(question ?? "");
  if (!q.trim()) return [];
  return SUBJECT_TOPIC_IDS.filter((t) => STRONG_TOPIC_KEYWORDS[t].test(q));
}

/** 질문 본문의 시간 프레임 (여럿이면 긴 쪽) */
export function detectTimeFrame(question: string | null | undefined): TimeFrameId | null {
  const q = String(question ?? "");
  if (!q.trim()) return null;
  return TIME_FRAME_PRIORITY.find((t) => TOPIC_KEYWORDS[t].test(q)) ?? null;
}

const isSubject = (v: string): v is SubjectTopicId =>
  (SUBJECT_TOPIC_IDS as readonly string[]).includes(v);
const isTimeFrame = (v: string): v is TimeFrameId =>
  (TIME_FRAME_IDS as readonly string[]).includes(v);

/** 저장·후속 요청·[Category] 표기에 쓰는 종전 형식의 카테고리 하나: 주주제 > 시간 프레임 > OTHER */
export function planCategory(plan: ConsultationPlan): string {
  return plan.primary ?? plan.timeFrame ?? "OTHER";
}

/** 로그·프롬프트 표기용 한 줄 (예: "LOVE (+WORK) [YEARLY]") */
export function planLabel(plan: ConsultationPlan): string {
  let s = plan.primary ?? (plan.timeFrame ? "" : "OTHER");
  if (plan.secondary.length) s += `${s ? " " : ""}(+${plan.secondary.join(", ")})`;
  if (plan.timeFrame) s += `${s ? " " : ""}[${plan.timeFrame}]`;
  return s;
}

export interface BuildPlanInput {
  /** 클라이언트가 보낸 카테고리. AUTO/OTHER/GENERAL/빈값은 null 로 넘길 것. 후속 질문은 첫 질문 때 저장된 값이 온다 */
  storedCategory?: string | null;
  /** 대화의 질문들 (첫 질문부터 현재 질문까지, 답변 본문은 넣지 않는다) */
  questions: readonly string[];
  /**
   * 주제가 모호할 때(강 키워드 0개 또는 2개 이상)만 호출되는 분류기. 첫 질문에만 넘기고 후속 질문은 생략한다.
   * candidates 는 키워드로 잡힌 후보. null 을 돌려주면 폴백 규칙을 쓴다. 던지는 오류는 여기서 흡수한다.
   */
  classify?: (question: string, candidates: SubjectTopicId[]) => Promise<SubjectTopicId | null>;
}

/**
 * 주제 계획 수립. 절대 reject 하지 않는다 (분류기 오류는 폴백으로).
 *
 *  주주제:
 *   1. 저장된 카테고리가 주제면 그대로 (후속 질문, 명시 요청)
 *   2. 강 키워드가 정확히 1개 주제면 그것
 *   3. 강 키워드가 없고 약 키워드가 정확히 1개 주제면 그것
 *   4. 그 외(0개 또는 2개 이상)는 분류기 → 실패하면 후보 중 SUBJECT_PRIORITY 순 → 후보도 없으면 null
 *  부주제: 강 키워드 주제 중 주주제를 뺀 것, 최대 MAX_SECONDARY_TOPICS (주주제가 없으면 없음)
 *  시간 프레임: 저장된 카테고리가 시간 프레임이면 그것, 아니면 질문 전체에서 감지
 */
export async function buildConsultationPlan(input: BuildPlanInput): Promise<ConsultationPlan> {
  const stored = String(input.storedCategory ?? "").trim().toUpperCase();
  const questions = input.questions.map((q) => String(q ?? "").trim()).filter(Boolean);
  const text = questions.join("\n");
  const firstQuestion = questions[0] ?? "";

  const timeFrame = isTimeFrame(stored) ? stored : detectTimeFrame(text);
  const strong = detectStrongSubjectTopics(text);
  const weak = detectSubjectTopics(text);

  let primary: SubjectTopicId | null = null;
  let source: ConsultationPlan["source"] = "none";

  if (isSubject(stored)) {
    primary = stored;
    source = "stored";
  } else if (strong.length === 1) {
    primary = strong[0];
    source = "keyword";
  } else if (strong.length === 0 && weak.length === 1) {
    primary = weak[0];
    source = "keyword";
  } else {
    const candidates = strong.length ? strong : weak;
    if (input.classify && firstQuestion) {
      try {
        const picked = await input.classify(firstQuestion, candidates);
        if (picked && isSubject(picked)) {
          primary = picked;
          source = "model";
        }
      } catch (e) {
        console.warn("⚠️ 주제 분류기 실패 — 키워드 폴백:", (e as Error)?.message);
      }
    }
    if (!primary && candidates.length) {
      primary = SUBJECT_PRIORITY.find((t) => candidates.includes(t)) ?? candidates[0];
      source = "fallback";
    }
  }

  const secondary = primary
    ? strong.filter((t) => t !== primary).slice(0, MAX_SECONDARY_TOPICS)
    : [];

  return { primary, secondary, timeFrame, source };
}
