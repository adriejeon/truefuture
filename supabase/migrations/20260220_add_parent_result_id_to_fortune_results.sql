-- 후속 질문 결과를 부모 결과와 연결하기 위한 컬럼
ALTER TABLE public.fortune_results
ADD COLUMN IF NOT EXISTS parent_result_id UUID REFERENCES public.fortune_results(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fortune_results_parent_result_id
  ON public.fortune_results(parent_result_id)
  WHERE parent_result_id IS NOT NULL;

COMMENT ON COLUMN public.fortune_results.parent_result_id IS '후속 질문인 경우, 첫 질문의 fortune_results.id';
