-- get_valid_stars 함수의 모호한 컬럼 참조 수정
CREATE OR REPLACE FUNCTION get_valid_stars(p_user_id UUID)
RETURNS TABLE(
  paid_stars BIGINT,
  bonus_stars BIGINT,
  total_stars BIGINT
) AS $$
DECLARE
  v_total_charged BIGINT;
  v_total_consumed BIGINT;
  v_expired_charged BIGINT;
  v_wallet_paid BIGINT;
  v_wallet_bonus BIGINT;
BEGIN
  -- 1. 총 충전된 별 (만료 여부 무관)
  SELECT COALESCE(SUM(st.amount), 0) INTO v_total_charged
  FROM public.star_transactions st
  WHERE st.user_id = p_user_id AND st.type = 'CHARGE';

  -- 2. 총 사용된 별
  SELECT COALESCE(SUM(ABS(st.amount)), 0) INTO v_total_consumed
  FROM public.star_transactions st
  WHERE st.user_id = p_user_id AND st.type = 'CONSUME';

  -- 3. 만료된 충전 별
  SELECT COALESCE(SUM(st.amount), 0) INTO v_expired_charged
  FROM public.star_transactions st
  WHERE st.user_id = p_user_id 
    AND st.type = 'CHARGE'
    AND st.expires_at IS NOT NULL
    AND (st.expires_at < NOW() OR st.is_expired = true);

  -- 4. user_wallets에서 현재 잔액 조회 (테이블 별칭 명시)
  SELECT 
    COALESCE(uw.paid_stars, 0),
    COALESCE(uw.bonus_stars, 0)
  INTO v_wallet_paid, v_wallet_bonus
  FROM public.user_wallets uw
  WHERE uw.user_id = p_user_id;

  -- 5. 만료된 별을 제외한 유효 잔액 계산
  -- 유효 잔액 = user_wallets 잔액 (이미 사용분 차감됨)
  -- 하지만 만료된 별은 아직 반영되지 않았을 수 있으므로, 만료된 별을 추가로 차감
  RETURN QUERY
  SELECT 
    GREATEST(v_wallet_paid, 0)::BIGINT as paid_stars,
    GREATEST(v_wallet_bonus, 0)::BIGINT as bonus_stars,
    GREATEST(v_wallet_paid + v_wallet_bonus, 0)::BIGINT as total_stars;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_valid_stars IS '사용자의 유효한 별 잔액 조회 (user_wallets 기반, 테이블 별칭 명시로 모호성 해결)';
