-- =============================================================================
-- add_wallet_stars: 지갑 재화 원자 증가 (결제 충전 전용)
--
-- 배경:
--   purchase-stars / purchase-stars-iap 는 지갑을 read-modify-write(조회 후 upsert)
--   로 갱신했다. 동시 요청(모바일 리다이렉트 재진입, 웹훅과 클라이언트 동시 호출 등)
--   에서 lost update 가 발생해 지급분이 사라질 수 있다.
--   → UPDATE ... SET col = col + n 으로 DB 안에서 원자 증가시킨다.
--
-- 사용처: 엣지 함수(서비스 롤)만. 원장(star_transactions) INSERT 성공 뒤에 호출한다.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.add_wallet_stars(
  p_user_id UUID,
  p_paid INTEGER,
  p_bonus INTEGER,
  p_probe INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid BIGINT;
  v_bonus BIGINT;
  v_probe BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id는 필수입니다.';
  END IF;
  IF COALESCE(p_paid, 0) < 0 OR COALESCE(p_bonus, 0) < 0 OR COALESCE(p_probe, 0) < 0 THEN
    RAISE EXCEPTION 'add_wallet_stars는 증가만 허용합니다(음수 불가).';
  END IF;

  -- 행이 없으면 생성, 있으면 원자 증가 (동시 실행 시 lost update 없음)
  INSERT INTO public.user_wallets (user_id, paid_stars, bonus_stars, probe_stars, updated_at)
  VALUES (
    p_user_id,
    COALESCE(p_paid, 0),
    COALESCE(p_bonus, 0),
    COALESCE(p_probe, 0),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    paid_stars  = user_wallets.paid_stars  + COALESCE(p_paid, 0),
    bonus_stars = user_wallets.bonus_stars + COALESCE(p_bonus, 0),
    probe_stars = user_wallets.probe_stars + COALESCE(p_probe, 0),
    updated_at  = NOW()
  RETURNING paid_stars, bonus_stars, probe_stars
  INTO v_paid, v_bonus, v_probe;

  RETURN json_build_object(
    'success', true,
    'paid_stars', v_paid,
    'bonus_stars', v_bonus,
    'probe_stars', v_probe
  );
END;
$$;

COMMENT ON FUNCTION public.add_wallet_stars(UUID, INTEGER, INTEGER, INTEGER) IS
  '지갑 재화 원자 증가(결제 충전용). 행이 없으면 INSERT, 있으면 col = col + n 으로 UPDATE 하고 갱신된 잔액을 반환한다. 서비스 롤 전용';

-- 엣지 함수(서비스 롤)만 호출 가능
REVOKE ALL ON FUNCTION public.add_wallet_stars(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_wallet_stars(UUID, INTEGER, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_wallet_stars(UUID, INTEGER, INTEGER, INTEGER) TO service_role;
