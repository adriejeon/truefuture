-- 별 유효기간 기능 추가
-- 2026년 2월 14일부터 적용: 구매한 별은 결제일로부터 1년간 유효

-- 1. star_transactions 테이블에 유효기간 관련 필드 추가
ALTER TABLE public.star_transactions
ADD COLUMN IF NOT EXISTS paid_amount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_amount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT false;

-- 2. 인덱스 생성 (유효기간 만료 체크 성능 향상)
CREATE INDEX IF NOT EXISTS idx_star_transactions_expires_at 
  ON public.star_transactions(user_id, expires_at, is_expired)
  WHERE type = 'CHARGE' AND is_expired = false;

-- 3. 주석 추가
COMMENT ON COLUMN public.star_transactions.paid_amount IS '충전된 유료 별 개수';
COMMENT ON COLUMN public.star_transactions.bonus_amount IS '충전된 보너스 별 개수';
COMMENT ON COLUMN public.star_transactions.expires_at IS '유효기간 만료일 (2026-02-14 이후 구매 건부터 적용, 결제일+1년)';
COMMENT ON COLUMN public.star_transactions.is_expired IS '만료 여부 (배치 작업으로 갱신)';

-- 4. 기존 데이터 마이그레이션
-- 2026-02-14 이전 데이터는 유효기간 없음 (NULL)
-- 2026-02-14 이후 데이터는 created_at + 1년
UPDATE public.star_transactions
SET 
  paid_amount = CASE 
    WHEN description LIKE '%유성%' THEN 10
    WHEN description LIKE '%혜성%' THEN 30
    WHEN description LIKE '%행성%' THEN 50
    WHEN description LIKE '%은하수%' THEN 100
    ELSE 0
  END,
  bonus_amount = CASE 
    WHEN description LIKE '%혜성%' THEN 1
    WHEN description LIKE '%행성%' THEN 3
    WHEN description LIKE '%은하수%' THEN 15
    ELSE 0
  END,
  expires_at = CASE
    WHEN created_at >= '2026-02-14 00:00:00+00' THEN created_at + INTERVAL '1 year'
    ELSE NULL
  END
WHERE type = 'CHARGE';

-- 5. 만료된 별 확인 함수 생성
CREATE OR REPLACE FUNCTION check_expired_stars()
RETURNS void AS $$
BEGIN
  UPDATE public.star_transactions
  SET is_expired = true
  WHERE type = 'CHARGE'
    AND is_expired = false
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_expired_stars IS '만료된 별을 체크하여 is_expired 플래그 업데이트 (크론 작업용)';

-- 6. 사용자별 유효한 별 조회 함수 생성
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
  SELECT COALESCE(SUM(amount), 0) INTO v_total_charged
  FROM public.star_transactions
  WHERE user_id = p_user_id AND type = 'CHARGE';

  -- 2. 총 사용된 별
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_consumed
  FROM public.star_transactions
  WHERE user_id = p_user_id AND type = 'CONSUME';

  -- 3. 만료된 충전 별
  SELECT COALESCE(SUM(amount), 0) INTO v_expired_charged
  FROM public.star_transactions
  WHERE user_id = p_user_id 
    AND type = 'CHARGE'
    AND expires_at IS NOT NULL
    AND (expires_at < NOW() OR is_expired = true);

  -- 4. user_wallets에서 현재 잔액 조회
  SELECT 
    COALESCE(paid_stars, 0),
    COALESCE(bonus_stars, 0)
  INTO v_wallet_paid, v_wallet_bonus
  FROM public.user_wallets
  WHERE user_id = p_user_id;

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

COMMENT ON FUNCTION get_valid_stars IS '사용자의 유효한 별 잔액 조회 (user_wallets 기반, 향후 만료 별 자동 차감 배치 작업과 연동)';
