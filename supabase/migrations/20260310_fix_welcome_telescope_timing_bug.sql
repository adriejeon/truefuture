-- [버그 수정] 소셜 로그인 재가입 시 망원경 중복 지급 문제
-- 원인: auth.users INSERT 트리거 실행 시점에는 auth.identities에 소셜 identity가 아직 없음
--       → compute_identity_hash가 이메일 해시로 폴백 → deleted_users_hash 매칭 실패 → 망원경 지급
-- 해결:
--   1. auth.users 트리거에서 소셜 로그인(email/phone 외) 건너뜀 (이메일 가입 전용)
--   2. auth.identities INSERT 트리거 추가로 소셜 로그인 망원경 지급 처리

-- ── 1. auth.users 트리거 함수 수정 (이메일 가입 전용으로 제한) ──────────────────────────

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
  -- 소셜 로그인(Google, Kakao 등)은 auth.identities 트리거에서 처리
  -- 이 시점에는 auth.identities에 소셜 identity가 아직 INSERT되지 않아 해시가 부정확함
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  IF v_provider NOT IN ('email', '') THEN
    RETURN NEW;
  END IF;

  -- 이메일 가입: 1년 내 탈퇴 이력 확인
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

  -- 만료일: 가입일 기준 + 90일
  v_expires_at := NOW() + INTERVAL '90 days';

  -- 중복 지급 방지
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
IS '신규 이메일 가입 시 무료 망원경 1개 지급 (소셜 로그인은 auth.identities 트리거에서 처리)';

-- auth.users 트리거 재등록 (변경 없이 그대로 유지, 함수만 교체됨)
DROP TRIGGER IF EXISTS on_auth_user_created_grant_welcome_telescope ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_welcome_telescope
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.grant_welcome_telescope_on_signup();


-- ── 2. auth.identities INSERT 트리거 추가 (소셜 로그인 전용) ──────────────────────────

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
  -- 이메일/전화번호 identity는 건너뜀 (auth.users 트리거에서 처리)
  IF NEW.provider IN ('email', 'phone') THEN
    RETURN NEW;
  END IF;

  -- provider_id 추출
  v_provider_id := COALESCE(
    NEW.identity_data->>'provider_id',
    NEW.identity_data->>'id',
    NEW.identity_data->>'sub'
  );

  IF v_provider_id IS NULL OR v_provider_id = '' THEN
    RETURN NEW;
  END IF;

  -- 소셜 identity 기반 해시 계산 (탈퇴 시 저장된 해시와 동일한 방식)
  v_payload := NEW.provider || ':' || v_provider_id;
  v_identity_hash := encode(digest(v_payload, 'sha256'), 'hex');

  -- 1년 내 탈퇴 이력 확인
  SELECT EXISTS (
    SELECT 1
    FROM public.deleted_users_hash d
    WHERE d.identity_hash = v_identity_hash
      AND d.deleted_at >= NOW() - INTERVAL '1 year'
  ) INTO v_deleted_within_year;

  IF v_deleted_within_year THEN
    RETURN NEW;
  END IF;

  -- 만료일: 가입일 기준 + 90일
  v_expires_at := NOW() + INTERVAL '90 days';

  -- 중복 지급 방지
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
IS '소셜 가입(Google, Kakao 등) 시 무료 망원경 1개 지급 - auth.identities INSERT 이후 실행하여 해시 정확성 보장';

DROP TRIGGER IF EXISTS on_auth_identity_created_grant_welcome_telescope ON auth.identities;
CREATE TRIGGER on_auth_identity_created_grant_welcome_telescope
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE PROCEDURE public.grant_welcome_telescope_on_social_identity();
