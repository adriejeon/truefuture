-- LLM 생성 기록 (공급자 비교 테스트 · 폴백 추적 · 원가 모니터링)
--  · 결과 1건(데일리 1건 / 종합운 파트 1개 / 리포트 섹션 1개 등)당 1행
--  · requested_* = 처음 시도한 공급자·모델, final_* = 실제로 결과를 만든 공급자·모델
--    GPT 실패 후 Gemini 가 만든 결과는 final_provider = 'gemini', fell_back = true 로 남는다.
--  · attempts: 시도별 { provider, model, effort, outcome, errorKind, httpStatus, latencyMs, ttftMs,
--               usage{inputTokens,cachedInputTokens,outputTokens,reasoningTokens}, costUsd, priceSource, finish }
--  · 프롬프트 원문·생년월일·질문 원문은 저장하지 않는다 (prompt_hash 로 동일 프롬프트 여부만 확인)

CREATE TABLE IF NOT EXISTS public.llm_generation_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id            UUID,
  feature            TEXT NOT NULL,
  part               TEXT,
  variant            TEXT NOT NULL,
  is_test            BOOLEAN NOT NULL DEFAULT false,
  requested_provider TEXT,
  requested_model    TEXT,
  final_provider     TEXT,
  final_model        TEXT,
  fell_back          BOOLEAN NOT NULL DEFAULT false,
  fallback_reason    TEXT,
  outcome            TEXT NOT NULL,
  fortune_result_id  UUID,
  premium_report_id  UUID,
  section_index      INT,
  prompt_hash        TEXT,
  output_chars       INT,
  latency_ms         INT,
  ttft_ms            INT,
  total_cost_usd     NUMERIC(12, 6),
  attempts           JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE public.llm_generation_logs IS
  'LLM 생성 기록. final_provider/final_model 이 실제 결과를 만든 모델. 서비스 롤 전용(RLS 정책 없음).';

CREATE INDEX IF NOT EXISTS llm_generation_logs_created_at_idx
  ON public.llm_generation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS llm_generation_logs_fortune_result_idx
  ON public.llm_generation_logs (fortune_result_id) WHERE fortune_result_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS llm_generation_logs_report_idx
  ON public.llm_generation_logs (premium_report_id) WHERE premium_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS llm_generation_logs_test_idx
  ON public.llm_generation_logs (is_test, feature, variant, created_at DESC);

-- 서비스 롤만 접근 (정책을 만들지 않으면 anon/authenticated 는 읽기·쓰기 불가)
ALTER TABLE public.llm_generation_logs ENABLE ROW LEVEL SECURITY;

-- 프리미엄 리포트: 리포트 단위 LLM 상태
--  { "variant": "openai" | "gemini" | "gemini-3.8",   -- 첫 생성 시 고정 (섹션마다 공급자가 섞이지 않게)
--    "fallbackSection": 1, "fallbackReason": "timeout" } -- 다음 요청에서 해당 섹션을 Gemini 로 생성
ALTER TABLE public.premium_reports ADD COLUMN IF NOT EXISTS llm_state JSONB;
COMMENT ON COLUMN public.premium_reports.llm_state IS
  'LLM 공급자 상태: variant(리포트 단위 고정), fallbackSection/fallbackReason(다음 요청 Gemini 폴백 지시)';
