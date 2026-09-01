-- 프리미엄 상세 리포트 v2
-- 1) 가격 18,000원으로 인상 (기존 행의 amount는 결제 당시 금액 그대로 유지)
-- 2) 질문 분해 결과 저장 컬럼 (생성·검증 파이프라인용)

ALTER TABLE public.premium_reports
  ALTER COLUMN amount SET DEFAULT 18000;

ALTER TABLE public.premium_reports
  ADD COLUMN IF NOT EXISTS question_breakdown JSONB;

COMMENT ON COLUMN public.premium_reports.question_breakdown IS
  '질문을 세부 질문으로 분해한 결과 [{id, text}] — 모든 세부 질문 답변 여부 검증에 사용';
