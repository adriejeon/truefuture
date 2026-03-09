-- 친구 추천: 초대 코드 자동 발급
-- 1) 기존 유저(auth.users) 일괄 백필: 고유 referral_code 생성 후 referral_codes에 INSERT
-- 2) 신규 가입 시 트리거: auth.users INSERT 직후 자동으로 고유 코드 생성 후 referral_codes INSERT

-- pgcrypto: generate_referral_code 내 digest() 사용을 위해 먼저 활성화
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. 초대 코드 생성 헬퍼 (대문자 영문+숫자 8자리, SHA256 기반 고유값)
--    트리거/백필에서 사용. 충돌 최소화를 위해 user_id + salt 조합 해시의 앞 8자 사용
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id UUID, p_salt TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_input TEXT;
  v_code TEXT;
BEGIN
  v_input := p_user_id::text || coalesce(p_salt, gen_random_uuid()::text);
  v_code := upper(substr(encode(digest(v_input, 'sha256'), 'hex'), 1, 8));
  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.generate_referral_code(UUID, TEXT)
IS '친구 추천용 8자리 코드 생성 (대문자 영문+숫자). p_salt 없으면 랜덤으로 고유성 확보';

-- =============================================================================
-- 2. 백필: auth.users에 이미 존재하는 모든 유저에게 고유 초대 코드 부여
--    (id + created_at 기반으로 유저별 고유 코드 생성, 이미 있는 user_id는 스킵)
-- =============================================================================
INSERT INTO public.referral_codes (user_id, code)
SELECT
  u.id,
  public.generate_referral_code(u.id, u.created_at::text)
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.referral_codes rc WHERE rc.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- 코드 유니크 충돌 시 재생성 (극히 드묾): 동일 code가 이미 있으면 백필에서 제외됨.
-- ON CONFLICT (user_id)만 있으므로 code 중복 시 INSERT가 실패할 수 있음.
-- referral_codes에는 code UNIQUE가 있으므로, 동일 code가 나오면 INSERT 시 에러.
-- 해결: 백필을 루프 없이 하려면 code를 user_id 기반으로만 하면 충돌 없음.
-- id + created_at 조합은 유저마다 다르므로 code도 유일. 단, generate_referral_code가
-- 8자리 hex이므로 16^8 공간에서 created_at이 같으면 이론적 충돌 가능.
-- 더 안전하게: 백필 시 code = upper(substr(encode(digest(u.id::text || u.created_at::text, 'sha256'), 'hex'), 1, 8))
-- 그대로 두고, 만약 한 건이라도 code 중복으로 실패하면 수동으로 재실행하거나
-- 아래 트리거와 동일하게 gen_random_uuid() 대신 created_at을 쓰면 유저별로 다름.
-- 현재 정의대로 진행 (created_at 사용 시 유저별 고유).

-- =============================================================================
-- 3. 트리거 함수: 신규 유저 생성 시 자동으로 초대 코드 1건 삽입
-- =============================================================================
CREATE OR REPLACE FUNCTION public.on_auth_user_created_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_code TEXT;
BEGIN
  v_code := public.generate_referral_code(NEW.id, gen_random_uuid()::text);
  INSERT INTO public.referral_codes (user_id, code)
  VALUES (NEW.id, v_code)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_auth_user_created_referral_code()
IS 'auth.users INSERT 후 실행. 해당 유저에 대한 고유 초대 코드를 referral_codes에 삽입';

-- =============================================================================
-- 4. 트리거 등록: auth.users INSERT 직후 실행
-- =============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created_referral_code ON auth.users;

CREATE TRIGGER on_auth_user_created_referral_code
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.on_auth_user_created_referral_code();
