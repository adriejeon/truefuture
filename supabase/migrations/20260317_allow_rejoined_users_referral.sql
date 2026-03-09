-- 정책 변경: 탈퇴 후 재가입 유저도 추천 등록 허용
-- 보상은 피추천인 '최초 결제' 시에만 지급되므로, 가입 시점의 재가입 여부로 차단할 필요 없음

CREATE OR REPLACE FUNCTION public.register_referral(p_referee_id UUID, p_referral_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  IF p_referee_id IS NULL OR p_referral_code IS NULL OR trim(p_referral_code) = '' THEN
    RETURN json_build_object('success', false, 'message', 'referee_id 또는 referral_code가 없습니다.');
  END IF;

  SELECT user_id INTO v_referrer_id
  FROM public.referral_codes
  WHERE code = trim(p_referral_code)
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', '유효하지 않은 초대 코드입니다.');
  END IF;

  IF v_referrer_id = p_referee_id THEN
    RETURN json_build_object('success', false, 'message', '자기 자신은 추천할 수 없습니다.');
  END IF;

  INSERT INTO public.referrals (referrer_id, referee_id, referral_code)
  VALUES (v_referrer_id, p_referee_id, trim(p_referral_code))
  ON CONFLICT (referee_id) DO NOTHING;

  RETURN json_build_object('success', true, 'message', '추천이 등록되었습니다.');
END;
$$;

COMMENT ON FUNCTION public.register_referral(UUID, TEXT)
IS '친구 추천 등록. 유효한 코드·자기 자신 아님·미등록 시 referrals에 INSERT. 재가입 유저도 허용(보상은 최초 결제 시에만 지급).';
