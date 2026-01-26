-- 운세 결과 공유용 테이블 생성
-- 카카오톡 공유 링크를 통해 누구나 조회 가능

CREATE TABLE IF NOT EXISTS public.fortune_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 사용자 입력 정보 (JSONB로 저장)
  user_info JSONB NOT NULL,
  
  -- 운세 결과 텍스트
  fortune_text TEXT NOT NULL,
  
  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 운세 타입 (선택 사항)
  fortune_type VARCHAR(50) DEFAULT 'daily'
);

-- 기존 테이블에 fortune_type 컬럼이 없으면 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'fortune_results' 
    AND column_name = 'fortune_type'
  ) THEN
    ALTER TABLE public.fortune_results 
    ADD COLUMN fortune_type VARCHAR(50) DEFAULT 'daily';
  END IF;
END $$;

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_fortune_results_created_at 
  ON public.fortune_results(created_at DESC);

-- RLS (Row Level Security) 활성화
ALTER TABLE public.fortune_results ENABLE ROW LEVEL SECURITY;

-- 정책: 누구나 조회 가능 (공유용)
CREATE POLICY "Anyone can view fortune results"
  ON public.fortune_results
  FOR SELECT
  USING (true);

-- 정책: Edge Function에서만 생성 가능 (service_role 키 사용)
-- 참고: Edge Function은 service_role 키를 사용하므로 RLS를 우회할 수 있습니다.

-- 주석 추가
COMMENT ON TABLE public.fortune_results IS '운세 결과 공유용 테이블 - 카카오톡 공유 링크를 통해 누구나 조회 가능';
COMMENT ON COLUMN public.fortune_results.user_info IS '사용자 입력 정보 (JSON): birthDate, lat, lng, fortuneType 등';
COMMENT ON COLUMN public.fortune_results.fortune_text IS 'AI가 생성한 운세 결과 텍스트 (Markdown)';
COMMENT ON COLUMN public.fortune_results.fortune_type IS '운세 타입: daily, lifetime, yearly, compatibility';
