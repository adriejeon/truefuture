-- 탈퇴 유저 식별 해시 테이블 (재가입 어뷰징 방지)
-- identity_hash: 이메일 또는 "provider:provider_id"의 SHA-256 해시 (소문자/공백 제거 후)
-- 1년 내 탈퇴 이력이 있으면 신규 가입 무료 망원경 지급 스킵

CREATE TABLE IF NOT EXISTS public.deleted_users_hash (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    identity_hash TEXT NOT NULL UNIQUE,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deleted_users_identity_hash
  ON public.deleted_users_hash(identity_hash);

CREATE INDEX IF NOT EXISTS idx_deleted_users_deleted_at
  ON public.deleted_users_hash(deleted_at);

COMMENT ON TABLE public.deleted_users_hash IS '탈퇴 유저 식별 해시 - 재가입 시 무료 쿠폰 중복 수령 방지용';
COMMENT ON COLUMN public.deleted_users_hash.identity_hash IS '이메일 또는 provider:provider_id 의 SHA-256 해시(hex)';
COMMENT ON COLUMN public.deleted_users_hash.deleted_at IS '탈퇴 시각 (1년 이내 재가입 시 쿠폰 미지급)';

-- pgcrypto: digest() 사용
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 유저 식별 해시 계산 함수 (auth.users + auth.identities 기반)
-- 이메일 가입: lower(trim(email)) -> SHA-256 hex
-- 소셜 가입: provider:provider_id -> SHA-256 hex (provider_id는 identity_data에서 추출)
CREATE OR REPLACE FUNCTION public.compute_identity_hash(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_provider TEXT;
  v_provider_id TEXT;
  v_payload TEXT;
BEGIN
  -- 소셜 identity 우선 조회 (email 제외)
  -- provider_id: auth.identities 컬럼 또는 identity_data 내부 값
  SELECT i.provider, COALESCE(
    i.provider_id,
    i.identity_data->>'provider_id',
    i.identity_data->>'id',
    i.identity_data->>'sub'
  )
  INTO v_provider, v_provider_id
  FROM auth.identities i
  WHERE i.user_id = p_user_id
    AND i.provider IS NOT NULL
    AND i.provider NOT IN ('email', 'phone')
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_provider IS NOT NULL AND v_provider_id IS NOT NULL AND v_provider_id <> '' THEN
    v_payload := v_provider || ':' || v_provider_id;
    RETURN encode(digest(v_payload, 'sha256'), 'hex');
  END IF;

  -- 이메일 가입: auth.users.email 사용
  SELECT lower(trim(u.email))
  INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN encode(digest(v_email, 'sha256'), 'hex');
  END IF;

  -- fallback: user_id 자체를 해시 (이메일/소셜 모두 없는 경우)
  RETURN encode(digest(p_user_id::TEXT, 'sha256'), 'hex');
END;
$$;

COMMENT ON FUNCTION public.compute_identity_hash(UUID) IS '유저 식별 해시 계산 - 이메일 또는 provider:provider_id 기반 SHA-256 hex';

-- RLS: 백엔드/트리거만 사용. 정책 없이 활성화 시 테이블 소유자 등은 기존대로 접근 가능.
ALTER TABLE public.deleted_users_hash ENABLE ROW LEVEL SECURITY;
