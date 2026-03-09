-- digest(text, unknown) does not exist 방지: pgcrypto가 extensions 스키마에 있으므로
-- compute_identity_hash 및 digest를 직접 사용하는 함수에 SET search_path = public, auth, extensions 추가

-- =============================================================================
-- 1. compute_identity_hash (digest 호출 3회)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compute_identity_hash(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email TEXT;
  v_provider TEXT;
  v_provider_id TEXT;
  v_payload TEXT;
BEGIN
  -- 소셜 identity 우선 조회 (email/phone 제외)
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

  SELECT lower(trim(u.email))
  INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN encode(digest(v_email, 'sha256'), 'hex');
  END IF;

  RETURN encode(digest(p_user_id::TEXT, 'sha256'), 'hex');
END;
$$;

COMMENT ON FUNCTION public.compute_identity_hash(UUID)
IS '유저 식별 해시 계산 - 이메일 또는 provider:provider_id 기반 SHA-256 hex (search_path에 extensions 포함)';

-- =============================================================================
-- 2. store_deleted_user_hash (compute_identity_hash만 호출, search_path 통일)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.store_deleted_user_hash(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  v_hash := public.compute_identity_hash(p_user_id);

  IF v_hash IS NULL OR v_hash = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.deleted_users_hash (identity_hash, deleted_at)
  VALUES (v_hash, NOW())
  ON CONFLICT (identity_hash)
  DO UPDATE SET deleted_at = NOW();
END;
$$;

COMMENT ON FUNCTION public.store_deleted_user_hash(UUID)
IS '탈퇴 유저 식별 해시를 compute_identity_hash로 계산 후 deleted_users_hash에 저장';

-- =============================================================================
-- 3. grant_welcome_telescope_on_signup (compute_identity_hash 호출)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.grant_welcome_telescope_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_already_granted BOOLEAN;
  v_identity_hash TEXT;
  v_deleted_within_year BOOLEAN;
  v_provider TEXT;
BEGIN
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  IF v_provider NOT IN ('email', '') THEN
    RETURN NEW;
  END IF;

  v_identity_hash := public.compute_identity_hash(NEW.id);
  SELECT EXISTS (
    SELECT 1
    FROM public.deleted_users_hash d
    WHERE d.identity_hash = v_identity_hash
      AND d.deleted_at >= NOW() - INTERVAL '1 year'
  ) INTO v_deleted_within_year;

  IF v_deleted_within_year THEN
    RETURN NEW;
  END IF;

  v_expires_at := NOW() + INTERVAL '90 days';

  SELECT EXISTS (
    SELECT 1
    FROM public.star_transactions
    WHERE user_id = NEW.id
      AND type = 'CHARGE'
      AND description = '신규 가입 무료 망원경 1개'
  ) INTO v_already_granted;

  IF v_already_granted THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_wallets (user_id, paid_stars, bonus_stars, updated_at)
  VALUES (NEW.id, 1, 0, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    paid_stars = public.user_wallets.paid_stars + 1,
    updated_at = NOW();

  INSERT INTO public.star_transactions (
    user_id,
    type,
    amount,
    description,
    related_item_id,
    paid_amount,
    bonus_amount,
    expires_at,
    is_expired
  ) VALUES (
    NEW.id,
    'CHARGE',
    1,
    '신규 가입 무료 망원경 1개',
    'welcome_telescope',
    1,
    0,
    v_expires_at,
    false
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_welcome_telescope_on_signup()
IS '신규 이메일 가입 시 무료 망원경 1개 지급';

-- =============================================================================
-- 4. grant_welcome_telescope_on_social_identity (digest 직접 호출 1회)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.grant_welcome_telescope_on_social_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_already_granted BOOLEAN;
  v_identity_hash TEXT;
  v_deleted_within_year BOOLEAN;
  v_provider_id TEXT;
  v_payload TEXT;
BEGIN
  IF NEW.provider IN ('email', 'phone') THEN
    RETURN NEW;
  END IF;

  v_provider_id := COALESCE(
    NEW.identity_data->>'provider_id',
    NEW.identity_data->>'id',
    NEW.identity_data->>'sub'
  );

  IF v_provider_id IS NULL OR v_provider_id = '' THEN
    RETURN NEW;
  END IF;

  v_payload := NEW.provider || ':' || v_provider_id;
  v_identity_hash := encode(digest(v_payload, 'sha256'), 'hex');

  SELECT EXISTS (
    SELECT 1
    FROM public.deleted_users_hash d
    WHERE d.identity_hash = v_identity_hash
      AND d.deleted_at >= NOW() - INTERVAL '1 year'
  ) INTO v_deleted_within_year;

  IF v_deleted_within_year THEN
    RETURN NEW;
  END IF;

  v_expires_at := NOW() + INTERVAL '90 days';

  SELECT EXISTS (
    SELECT 1
    FROM public.star_transactions
    WHERE user_id = NEW.user_id
      AND type = 'CHARGE'
      AND description = '신규 가입 무료 망원경 1개'
  ) INTO v_already_granted;

  IF v_already_granted THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_wallets (user_id, paid_stars, bonus_stars, updated_at)
  VALUES (NEW.user_id, 1, 0, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    paid_stars = public.user_wallets.paid_stars + 1,
    updated_at = NOW();

  INSERT INTO public.star_transactions (
    user_id,
    type,
    amount,
    description,
    related_item_id,
    paid_amount,
    bonus_amount,
    expires_at,
    is_expired
  ) VALUES (
    NEW.user_id,
    'CHARGE',
    1,
    '신규 가입 무료 망원경 1개',
    'welcome_telescope',
    1,
    0,
    v_expires_at,
    false
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_welcome_telescope_on_social_identity()
IS '소셜 가입 시 무료 망원경 1개 지급 - digest는 extensions(pgcrypto)에서 조회';
