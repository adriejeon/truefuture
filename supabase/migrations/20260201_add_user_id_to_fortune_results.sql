-- fortune_results 테이블에 user_id 컬럼 추가
-- CONSULTATION 저장 시 user_id를 기록하기 위함

ALTER TABLE public.fortune_results
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 인덱스 추가 (사용자별 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_fortune_results_user_id
  ON public.fortune_results(user_id);

COMMENT ON COLUMN public.fortune_results.user_id IS '운세를 생성한 사용자 ID (선택적, CONSULTATION 등에서 사용)';
