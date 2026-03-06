-- compute_identity_hash 함수 수정
-- Supabase auth.identities에는 provider_id 컬럼이 기본적으로 없으므로
-- identity_data JSON에서 provider id를 추출하도록 정정

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
  -- 소셜 identity 우선 조회 (email/phone 제외)
  -- provider_id는 identity_data 내부에서만 추출 (예: provider_id, id, sub)
  SELECT
    i.provider,
    COALESCE(
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

COMMENT ON FUNCTION public.compute_identity_hash(UUID)
IS '유저 식별 해시 계산 - 이메일 또는 provider:provider_id 기반 SHA-256 hex (identity_data 기반 추출)';
