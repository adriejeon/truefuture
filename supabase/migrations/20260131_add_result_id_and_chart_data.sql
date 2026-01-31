-- fortune_results: 복구용 chart_data (JSONB) 추가
-- DAILY 운세의 chart, transitChart, aspects, transitMoonHouse 등 저장
ALTER TABLE public.fortune_results
  ADD COLUMN IF NOT EXISTS chart_data JSONB;

COMMENT ON COLUMN public.fortune_results.chart_data IS '복구용 차트 데이터 (chart, transitChart, aspects, transitMoonHouse 등)';

-- fortune_history: fortune_results와 연결하는 result_id (UUID, FK) 추가
ALTER TABLE public.fortune_history
  ADD COLUMN IF NOT EXISTS result_id UUID REFERENCES public.fortune_results(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fortune_history_result_id
  ON public.fortune_history(result_id);

COMMENT ON COLUMN public.fortune_history.result_id IS 'fortune_results.id (공유/복구용)';
