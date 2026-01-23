-- 오늘의 운세 저장 테이블 생성
-- 사용자당 하루에 한 번만 운세를 생성하고, 당일에는 저장된 운세를 재사용

CREATE TABLE IF NOT EXISTS public.daily_fortunes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fortune_date DATE NOT NULL,
  
  -- 사용자 입력 정보
  birth_date TIMESTAMPTZ NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  
  -- 계산된 차트 데이터
  natal_chart JSONB NOT NULL,
  transit_chart JSONB NOT NULL,
  aspects JSONB,
  transit_moon_house INTEGER,
  
  -- 운세 결과
  interpretation TEXT NOT NULL,
  
  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 사용자당 하루에 하나의 운세만 존재
  CONSTRAINT unique_user_fortune_per_day UNIQUE (user_id, fortune_date)
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_daily_fortunes_user_date 
  ON public.daily_fortunes(user_id, fortune_date DESC);

-- RLS (Row Level Security) 활성화
ALTER TABLE public.daily_fortunes ENABLE ROW LEVEL SECURITY;

-- 정책: 사용자는 자신의 운세만 조회 가능
CREATE POLICY "Users can view their own fortunes"
  ON public.daily_fortunes
  FOR SELECT
  USING (auth.uid() = user_id);

-- 정책: 사용자는 자신의 운세만 생성 가능
CREATE POLICY "Users can create their own fortunes"
  ON public.daily_fortunes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 주석 추가
COMMENT ON TABLE public.daily_fortunes IS '오늘의 운세 저장 테이블 - 사용자당 하루 한 번만 생성';
COMMENT ON COLUMN public.daily_fortunes.fortune_date IS '운세 날짜 (날짜만 저장, 시간 제외)';
COMMENT ON COLUMN public.daily_fortunes.natal_chart IS 'Natal Chart 데이터 (JSON)';
COMMENT ON COLUMN public.daily_fortunes.transit_chart IS 'Transit Chart 데이터 (JSON)';
COMMENT ON COLUMN public.daily_fortunes.aspects IS 'Calculated Aspects 배열 (JSON)';
COMMENT ON COLUMN public.daily_fortunes.transit_moon_house IS 'Transit Moon이 위치한 Natal 하우스 번호';
