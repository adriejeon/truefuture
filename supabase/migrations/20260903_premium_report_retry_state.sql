-- 프리미엄 리포트: 생성 재시도 상태를 요청 간에 넘기기 위한 컬럼
-- (엣지 워커 리소스 한도 회피 — 한 요청은 Gemini 호출 1번만, 재시도는 다음 요청이 수행)

ALTER TABLE public.premium_reports
  ADD COLUMN IF NOT EXISTS generation_attempts INT NOT NULL DEFAULT 0;

ALTER TABLE public.premium_reports
  ADD COLUMN IF NOT EXISTS pending_fix JSONB;

COMMENT ON COLUMN public.premium_reports.generation_attempts IS
  '누적 generate 시도 횟수 (무한 루프 방지 상한용)';
COMMENT ON COLUMN public.premium_reports.pending_fix IS
  '직전 시도의 원고 검증 실패 항목 — 다음 시도에서 교정 지시로 사용, 성공 시 NULL';
