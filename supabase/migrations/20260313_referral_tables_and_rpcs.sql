-- 친구 추천 이벤트: 초대 링크로 가입한 유저가 '생애 최초 결제' 시 추천인에게 망원경 1개 지급
-- 1) referral_codes: 유저별 고유 초대 코드
-- 2) referrals: 추천인-피추천인 매핑, 피추천인 첫 결제 시 보상 지급 여부 추적
-- 3) RPC: register_referral (가입 시 매핑, 탈퇴 재가입 유저는 INSERT 차단)
-- 4) RPC: grant_referral_reward_if_first_purchase (결제 완료 후 호출, 첫 결제 시에만 추천인에게 1개 지급)

-- =============================================================================
-- 1. referral_codes: 기존 유저가 공유하는 초대 코드 (유저당 1개)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON public.referral_codes(user_id);

COMMENT ON TABLE public.referral_codes IS '친구 추천용 초대 코드 - 유저당 1개';
COMMENT ON COLUMN public.referral_codes.code IS '공유용 고유 코드 (예: 8~12자 영숫자)';

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. referrals: 추천인-피추천인 매핑, 피추천인 첫 결제 시 보상 지급 여부
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 보상 지급 추적: NULL = 미지급, 값 있음 = 해당 시각에 지급 완료 (피추천인 1명당 1회만)
  reward_granted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON public.referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_reward_pending ON public.referrals(referee_id) WHERE reward_granted_at IS NULL;

COMMENT ON TABLE public.referrals IS '친구 추천 매핑 - 피추천인이 첫 결제 시 추천인에게 망원경 1개 지급';
COMMENT ON COLUMN public.referrals.referrer_id IS '추천인(초대한 유저) auth.users.id';
COMMENT ON COLUMN public.referrals.referee_id IS '피추천인(초대받아 가입한 유저) auth.users.id, UNIQUE로 1인 1회만 피추천인으로 등록';
COMMENT ON COLUMN public.referrals.reward_granted_at IS '추천인에게 망원경 1개 지급 완료 시각. NULL이면 아직 미지급';

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. register_referral: 가입 후 추천 등록 (탈퇴 재가입 유저는 INSERT 차단)
--    호출: Edge Function 또는 프론트에서 "추천 등록" API 호출 시
--    - p_referee_id: 방금 가입한 유저 id
--    - p_referral_code: URL 등에서 넘어온 초대 코드
--    반환: 성공 시 true, 실패(코드 없음/이미 등록/탈퇴 재가입) 시 false 또는 메시지
-- =============================================================================
CREATE OR REPLACE FUNCTION public.register_referral(p_referee_id UUID, p_referral_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_referrer_id UUID;
  v_identity_hash TEXT;
  v_deleted_within_year BOOLEAN;
BEGIN
  IF p_referee_id IS NULL OR p_referral_code IS NULL OR trim(p_referral_code) = '' THEN
    RETURN json_build_object('success', false, 'message', 'referee_id 또는 referral_code가 없습니다.');
  END IF;

  -- 추천인 조회: 코드로 referrer_id 확보
  SELECT user_id INTO v_referrer_id
  FROM public.referral_codes
  WHERE code = trim(p_referral_code)
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', '유효하지 않은 초대 코드입니다.');
  END IF;

  -- 자기 자신은 추천 불가
  IF v_referrer_id = p_referee_id THEN
    RETURN json_build_object('success', false, 'message', '자기 자신은 추천할 수 없습니다.');
  END IF;

  -- 어뷰징 방지: 피추천인이 1년 이내 탈퇴 재가입 유저인지 확인
  v_identity_hash := public.compute_identity_hash(p_referee_id);
  SELECT EXISTS (
    SELECT 1
    FROM public.deleted_users_hash d
    WHERE d.identity_hash = v_identity_hash
      AND d.deleted_at >= NOW() - INTERVAL '1 year'
  ) INTO v_deleted_within_year;

  IF v_deleted_within_year THEN
    RETURN json_build_object('success', false, 'message', '재가입 유저는 추천 대상에서 제외됩니다.');
  END IF;

  -- 이미 이 피추천인으로 등록된 경우 (중복 클릭 등) 무시하고 성공 처리
  INSERT INTO public.referrals (referrer_id, referee_id, referral_code)
  VALUES (v_referrer_id, p_referee_id, trim(p_referral_code))
  ON CONFLICT (referee_id) DO NOTHING;

  RETURN json_build_object('success', true, 'message', '추천이 등록되었습니다.');
END;
$$;

COMMENT ON FUNCTION public.register_referral(UUID, TEXT)
IS '친구 추천 등록. 탈퇴 재가입 유저(1년 이내)는 매핑하지 않음.';

-- =============================================================================
-- 4. grant_referral_reward_if_first_purchase: 결제 완료 후 호출
--    피추천인(p_referee_id)이 '운세권 구매' CHARGE 기준 생애 첫 결제인 경우에만,
--    해당 추천인에게 망원경(paid) 1개 지급하고 reward_granted_at 갱신
--    호출: purchase-stars Edge Function에서 star_transactions INSERT 직후
-- =============================================================================
CREATE OR REPLACE FUNCTION public.grant_referral_reward_if_first_purchase(p_referee_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral RECORD;
  v_purchase_charge_count BIGINT;
BEGIN
  IF p_referee_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'referee_id 없음');
  END IF;

  -- 첫 결제 여부: 이 유저의 '운세권 구매' CHARGE 건수가 1개여야 함 (방금 넣은 것만 있음)
  SELECT COUNT(*) INTO v_purchase_charge_count
  FROM public.star_transactions
  WHERE user_id = p_referee_id
    AND type = 'CHARGE'
    AND description LIKE '운세권 구매%';

  IF v_purchase_charge_count <> 1 THEN
    RETURN json_build_object('success', false, 'reason', '첫 결제가 아님', 'charge_count', v_purchase_charge_count);
  END IF;

  -- 미지급 추천 행 1건 조회 (referee_id UNIQUE이므로 최대 1건), 행 잠금으로 중복 지급 방지
  SELECT id, referrer_id INTO v_referral
  FROM public.referrals
  WHERE referee_id = p_referee_id
    AND reward_granted_at IS NULL
  FOR UPDATE
  LIMIT 1;

  IF v_referral.id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', '추천 관계 없음 또는 이미 보상 지급됨');
  END IF;

  -- 보상 지급 시각 기록 (먼저 기록하여 재호출 시 중복 지급 방지)
  UPDATE public.referrals
  SET reward_granted_at = NOW()
  WHERE id = v_referral.id;

  -- 추천인에게 망원경(paid) 1개 지급
  PERFORM public.refund_stars(
    v_referral.referrer_id,
    1,
    '친구 추천 이벤트 보상 (피추천인 첫 결제)',
    'PAID'
  );

  RETURN json_build_object('success', true, 'referrer_id', v_referral.referrer_id, 'message', '추천인에게 망원경 1개 지급 완료');
END;
$$;

COMMENT ON FUNCTION public.grant_referral_reward_if_first_purchase(UUID)
IS '피추천인이 생애 첫 결제(운세권 구매) 완료 시에만 추천인에게 망원경 1개 지급. 한 피추천인당 1회만 지급';
