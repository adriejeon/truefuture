-- 3종 재화 시스템: 망원경(paid_stars), 나침반(bonus_stars), 탐사선(probe_stars)
-- user_wallets에 probe_stars 추가, star_transactions에 probe_amount 추가
-- get_valid_stars / handle_new_user_wallet / consume_stars / refund_stars 반영

-- 1. user_wallets에 probe_stars 컬럼 추가 (기본값 0)
ALTER TABLE public.user_wallets
ADD COLUMN IF NOT EXISTS probe_stars BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_wallets.probe_stars IS '탐사선(종합운세 1회권) 잔여 개수';

-- 2. star_transactions에 probe_amount 컬럼 추가 (CHARGE/CONSUME 시 탐사선 개수 구분용)
ALTER TABLE public.star_transactions
ADD COLUMN IF NOT EXISTS probe_amount INTEGER DEFAULT 0;

COMMENT ON COLUMN public.star_transactions.probe_amount IS '해당 거래에서 충전/차감된 탐사선 개수';

-- 3. get_valid_stars: 반환 타입 변경(컬럼 추가)은 CREATE OR REPLACE 불가 → DROP 후 재생성
DROP FUNCTION IF EXISTS get_valid_stars(UUID);

CREATE OR REPLACE FUNCTION get_valid_stars(p_user_id UUID)
RETURNS TABLE(
  paid_stars BIGINT,
  bonus_stars BIGINT,
  probe_stars BIGINT,
  total_stars BIGINT
) AS $$
DECLARE
  v_total_charged BIGINT;
  v_total_consumed BIGINT;
  v_expired_charged BIGINT;
  v_wallet_paid BIGINT;
  v_wallet_bonus BIGINT;
  v_wallet_probe BIGINT;
BEGIN
  SELECT COALESCE(SUM(st.amount), 0) INTO v_total_charged
  FROM public.star_transactions st
  WHERE st.user_id = p_user_id AND st.type = 'CHARGE';

  SELECT COALESCE(SUM(ABS(st.amount)), 0) INTO v_total_consumed
  FROM public.star_transactions st
  WHERE st.user_id = p_user_id AND st.type = 'CONSUME';

  SELECT COALESCE(SUM(st.amount), 0) INTO v_expired_charged
  FROM public.star_transactions st
  WHERE st.user_id = p_user_id
    AND st.type = 'CHARGE'
    AND st.expires_at IS NOT NULL
    AND (st.expires_at < NOW() OR st.is_expired = true);

  SELECT
    COALESCE(uw.paid_stars, 0),
    COALESCE(uw.bonus_stars, 0),
    COALESCE(uw.probe_stars, 0)
  INTO v_wallet_paid, v_wallet_bonus, v_wallet_probe
  FROM public.user_wallets uw
  WHERE uw.user_id = p_user_id;

  RETURN QUERY
  SELECT
    GREATEST(v_wallet_paid, 0)::BIGINT AS paid_stars,
    GREATEST(v_wallet_bonus, 0)::BIGINT AS bonus_stars,
    GREATEST(v_wallet_probe, 0)::BIGINT AS probe_stars,
    GREATEST(v_wallet_paid + v_wallet_bonus + v_wallet_probe, 0)::BIGINT AS total_stars;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_valid_stars(UUID) IS '사용자 유효 재화 조회 (망원경/나침반/탐사선, total = paid+bonus+probe)';

-- 4. handle_new_user_wallet: INSERT 시 probe_stars 명시
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_wallets (user_id, paid_stars, bonus_stars, probe_stars, updated_at)
  VALUES (NEW.id, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user_wallet()
IS '신규 유저 생성 시 user_wallets 행 생성 (paid/bonus/probe 0). ON CONFLICT DO NOTHING';

-- 5. consume_stars: 종합운세/탐사선 키워드 시 probe_stars 차감, 기존 망원경/나침반 로직 유지
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oidvectortypes(proargtypes) AS argtypes, proname
    FROM pg_proc
    WHERE proname = 'consume_stars'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s(%s) CASCADE', r.proname, r.argtypes);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION consume_stars(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT
)
RETURNS JSON AS $$
DECLARE
  v_current_paid BIGINT;
  v_current_bonus BIGINT;
  v_current_probe BIGINT;
  v_new_paid BIGINT;
  v_new_bonus BIGINT;
  v_new_probe BIGINT;
  v_is_daily BOOLEAN;
  v_is_probe BOOLEAN;
BEGIN
  v_is_daily := p_description LIKE '%오늘 운세%' OR p_description LIKE '%데일리%';
  v_is_probe := p_description LIKE '%종합운세%' OR p_description LIKE '%종합 운세%'
    OR p_description LIKE '%탐사선%';

  SELECT
    COALESCE(paid_stars, 0),
    COALESCE(bonus_stars, 0),
    COALESCE(probe_stars, 0)
  INTO v_current_paid, v_current_bonus, v_current_probe
  FROM user_wallets
  WHERE user_id = p_user_id;

  IF v_current_paid IS NULL THEN v_current_paid := 0; END IF;
  IF v_current_bonus IS NULL THEN v_current_bonus := 0; END IF;
  IF v_current_probe IS NULL THEN v_current_probe := 0; END IF;

  IF v_is_probe THEN
    IF v_current_probe < p_amount THEN
      RETURN json_build_object(
        'success', false,
        'message', '탐사선(종합운세권)이 부족합니다.',
        'newBalance', json_build_object(
          'paid', v_current_paid,
          'bonus', v_current_bonus,
          'probe', v_current_probe
        )
      );
    END IF;
    v_new_paid := v_current_paid;
    v_new_bonus := v_current_bonus;
    v_new_probe := v_current_probe - p_amount;
  ELSIF v_is_daily THEN
    IF v_current_bonus < p_amount THEN
      RETURN json_build_object(
        'success', false,
        'message', '데일리 운세권이 부족합니다.',
        'newBalance', json_build_object(
          'paid', v_current_paid,
          'bonus', v_current_bonus,
          'probe', v_current_probe
        )
      );
    END IF;
    v_new_paid := v_current_paid;
    v_new_bonus := v_current_bonus - p_amount;
    v_new_probe := v_current_probe;
  ELSE
    IF v_current_paid < p_amount THEN
      RETURN json_build_object(
        'success', false,
        'message', '일반 운세권이 부족합니다.',
        'newBalance', json_build_object(
          'paid', v_current_paid,
          'bonus', v_current_bonus,
          'probe', v_current_probe
        )
      );
    END IF;
    v_new_paid := v_current_paid - p_amount;
    v_new_bonus := v_current_bonus;
    v_new_probe := v_current_probe;
  END IF;

  UPDATE user_wallets
  SET
    paid_stars = v_new_paid,
    bonus_stars = v_new_bonus,
    probe_stars = v_new_probe,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO star_transactions (
    user_id,
    type,
    amount,
    description,
    paid_amount,
    bonus_amount,
    probe_amount
  ) VALUES (
    p_user_id,
    'CONSUME',
    -p_amount,
    p_description,
    CASE WHEN v_is_probe THEN 0 WHEN v_is_daily THEN 0 ELSE p_amount END,
    CASE WHEN v_is_probe THEN 0 WHEN v_is_daily THEN p_amount ELSE 0 END,
    CASE WHEN v_is_probe THEN p_amount ELSE 0 END
  );

  RETURN json_build_object(
    'success', true,
    'message', '운세권이 차감되었습니다.',
    'newBalance', json_build_object(
      'paid', v_new_paid,
      'bonus', v_new_bonus,
      'probe', v_new_probe
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_stars(UUID, INTEGER, TEXT) IS '재화 차감: 데일리→bonus, 종합운세/탐사선→probe, 그 외→paid';

-- 6. refund_stars: 환불 타입(PAID/BONUS/PROBE)을 파라미터로 받아 해당 재화만 복구
DROP FUNCTION IF EXISTS refund_stars(UUID, INT, TEXT);

CREATE OR REPLACE FUNCTION refund_stars(
  p_user_id UUID,
  p_amount INT,
  p_description TEXT,
  p_refund_type TEXT
)
RETURNS void AS $$
BEGIN
  IF p_refund_type NOT IN ('PAID', 'BONUS', 'PROBE') THEN
    RAISE EXCEPTION 'p_refund_type은 PAID, BONUS, PROBE 중 하나여야 합니다.';
  END IF;

  IF p_refund_type = 'PAID' THEN
    UPDATE user_wallets
    SET paid_stars = paid_stars + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_refund_type = 'BONUS' THEN
    UPDATE user_wallets
    SET bonus_stars = bonus_stars + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_refund_type = 'PROBE' THEN
    UPDATE user_wallets
    SET probe_stars = probe_stars + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO star_transactions (
    user_id,
    amount,
    type,
    description,
    paid_amount,
    bonus_amount,
    probe_amount
  ) VALUES (
    p_user_id,
    p_amount,
    'CHARGE',
    p_description,
    CASE WHEN p_refund_type = 'PAID' THEN p_amount ELSE 0 END,
    CASE WHEN p_refund_type = 'BONUS' THEN p_amount ELSE 0 END,
    CASE WHEN p_refund_type = 'PROBE' THEN p_amount ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refund_stars(UUID, INT, TEXT, TEXT) IS '운세 생성 실패 등 시 재화 환불. p_refund_type: PAID(망원경), BONUS(나침반), PROBE(탐사선)';
