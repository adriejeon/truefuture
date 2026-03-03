-- 신규 회원가입 시 무료 망원경 1개 자동 지급
-- auth.users INSERT 직후 트리거로 실행, 발급일 기준 90일 만료
-- 1년 내 탈퇴 이력 있으면 지급 스킵 (재가입 어뷰징 방지)

-- 1. 트리거 함수: 신규 유저에게 망원경 1개 지급 (90일 만료), 단 1년 내 재가입 시 스킵
CREATE OR REPLACE FUNCTION public.grant_welcome_telescope_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_already_granted BOOLEAN;
  v_identity_hash TEXT;
  v_deleted_within_year BOOLEAN;
BEGIN
  -- 1년 내 탈퇴 이력 확인: 동일 identity_hash가 있으면 무료 쿠폰 지급 스킵
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

  -- 만료일: 가입일(현재 시점) + 90일
  v_expires_at := NOW() + INTERVAL '90 days';

  -- 중복 지급 방지: 이미 '신규 가입 무료 망원경 1개' CHARGE 이력이 있는지 확인
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

  -- user_wallets: 없으면 생성(paid_stars=1), 있으면 paid_stars + 1
  INSERT INTO public.user_wallets (user_id, paid_stars, bonus_stars, updated_at)
  VALUES (NEW.id, 1, 0, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    paid_stars = public.user_wallets.paid_stars + 1,
    updated_at = NOW();

  -- star_transactions: CHARGE 1건 기록 (90일 만료)
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

COMMENT ON FUNCTION public.grant_welcome_telescope_on_signup() IS '신규 가입 시 무료 망원경 1개 지급 (발급일 기준 90일 만료)';

-- 2. auth.users INSERT 후 트리거 등록
DROP TRIGGER IF EXISTS on_auth_user_created_grant_welcome_telescope ON auth.users;

CREATE TRIGGER on_auth_user_created_grant_welcome_telescope
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.grant_welcome_telescope_on_signup();
