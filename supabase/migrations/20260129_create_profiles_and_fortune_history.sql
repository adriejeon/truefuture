-- 프로필 테이블 생성
-- 사용자는 여러 프로필을 가질 수 있음
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date TIMESTAMPTZ NOT NULL,
  birth_time TIME NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('남자', '여자')),
  city_name TEXT NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  timezone TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_profiles_user_id 
  ON public.profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_is_default 
  ON public.profiles(user_id, is_default);

-- RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 정책: 사용자는 자신의 프로필만 조회 가능
CREATE POLICY "Users can view their own profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- 정책: 사용자는 자신의 프로필만 생성 가능
CREATE POLICY "Users can create their own profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 정책: 사용자는 자신의 프로필만 수정 가능
CREATE POLICY "Users can update their own profiles"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 정책: 사용자는 자신의 프로필만 삭제 가능
CREATE POLICY "Users can delete their own profiles"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = user_id);

-- 주석 추가
COMMENT ON TABLE public.profiles IS '사용자 프로필 테이블 - 사용자는 여러 프로필을 가질 수 있음';
COMMENT ON COLUMN public.profiles.name IS '프로필 이름 (예: 나, 엄마, 친구)';
COMMENT ON COLUMN public.profiles.is_default IS '기본 프로필 여부';

-- 운세 조회 이력 테이블 생성
CREATE TABLE IF NOT EXISTS public.fortune_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fortune_type TEXT NOT NULL CHECK (fortune_type IN ('daily', 'lifetime', 'yearly', 'compatibility')),
  fortune_date DATE NOT NULL,
  year_period_start DATE,
  year_period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_fortune_history_user_profile 
  ON public.fortune_history(user_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_fortune_history_type_date 
  ON public.fortune_history(profile_id, fortune_type, fortune_date DESC);

-- RLS 활성화
ALTER TABLE public.fortune_history ENABLE ROW LEVEL SECURITY;

-- 정책: 사용자는 자신의 이력만 조회 가능
CREATE POLICY "Users can view their own fortune history"
  ON public.fortune_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- 정책: 사용자는 자신의 이력만 생성 가능
CREATE POLICY "Users can create their own fortune history"
  ON public.fortune_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 주석 추가
COMMENT ON TABLE public.fortune_history IS '운세 조회 이력 테이블 - 제한 체크용';
COMMENT ON COLUMN public.fortune_history.fortune_type IS '운세 타입: daily, lifetime, yearly, compatibility';
COMMENT ON COLUMN public.fortune_history.fortune_date IS '운세를 조회한 날짜';
COMMENT ON COLUMN public.fortune_history.year_period_start IS '1년 운세의 경우 시작일 (생일)';
COMMENT ON COLUMN public.fortune_history.year_period_end IS '1년 운세의 경우 종료일 (다음 생일 - 1일)';

-- 트리거: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
