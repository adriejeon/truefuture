-- admin_users 를 대시보드(Table Editor)에서 관리하기 쉽게 재구성
--  · email 컬럼 추가: 누가 관리자인지 바로 보이도록
--  · UUID(user_id)만 넣으면 auth.users 에서 이메일을 자동으로 채움
--  · 이메일만 넣으면 가입 사용자의 UUID 를 자동으로 매칭 (미가입 이메일이면 오류)
--  · 실제 가입 사용자만 등록 가능 (auth.users FK + 트리거 검증)

-- 1. 대리 키로 전환: Table Editor 에서 user_id 를 비워두고 email 만으로도 행을 넣을 수 있게
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_pkey;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.admin_users ADD PRIMARY KEY (id);
ALTER TABLE public.admin_users ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_user_id_key;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_user_id_key UNIQUE (user_id);

-- 2. 이메일 컬럼
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email TEXT;
COMMENT ON COLUMN public.admin_users.user_id IS 'auth.users.id (Authentication > Users 의 UUID). 비워두고 email 만 넣어도 자동 매칭';
COMMENT ON COLUMN public.admin_users.email IS '가입 이메일. user_id 로 등록하면 자동 채움, email 로 등록하면 이 값으로 user_id 를 찾음';

-- 3. 등록 시 검증·자동 채움 (INSERT/UPDATE 공통)
CREATE OR REPLACE FUNCTION public.admin_users_resolve_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_email TEXT;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT u.id, u.email INTO v_id, v_email FROM auth.users u WHERE u.id = NEW.user_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'ADMIN_USER_NOT_FOUND: 해당 UUID 의 가입 사용자가 없습니다 (%)', NEW.user_id
        USING ERRCODE = '23503';
    END IF;
    NEW.email := v_email;  -- auth.users 가 기준
  ELSIF NULLIF(btrim(COALESCE(NEW.email, '')), '') IS NOT NULL THEN
    SELECT u.id, u.email INTO v_id, v_email
    FROM auth.users u
    WHERE lower(u.email) = lower(btrim(NEW.email))
    ORDER BY u.created_at ASC
    LIMIT 1;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'ADMIN_USER_NOT_FOUND: 해당 이메일로 가입한 사용자가 없습니다 (%)', NEW.email
        USING ERRCODE = '23503';
    END IF;
    NEW.user_id := v_id;
    NEW.email := v_email;
  ELSE
    RAISE EXCEPTION 'ADMIN_USER_REQUIRED: user_id(UUID) 또는 email 중 하나는 입력해야 합니다'
      USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_users_resolve_user ON public.admin_users;
CREATE TRIGGER trg_admin_users_resolve_user
  BEFORE INSERT OR UPDATE OF user_id, email ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_users_resolve_user();

-- 트리거가 채운 뒤에도 user_id 가 비어 있으면 거부 (CHECK 는 BEFORE 트리거 이후 평가됨)
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_user_id_required;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_user_id_required CHECK (user_id IS NOT NULL);

-- 4. 기존 행 이메일 백필
UPDATE public.admin_users a
SET email = u.email
FROM auth.users u
WHERE u.id = a.user_id AND (a.email IS NULL OR a.email <> u.email);

COMMENT ON TABLE public.admin_users IS
  '운영 관리자 목록. 행이 있으면 is_admin() = true → /admin/reviews 접근 가능. '
  'Table Editor 에서 user_id(UUID) 또는 email 중 하나만 넣고 저장하면 나머지는 자동 채움.';
