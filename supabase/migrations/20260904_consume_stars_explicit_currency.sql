-- =============================================================================
-- consume_stars: 차감 통화(재화)를 호출자가 명시할 수 있도록 p_currency 파라미터 추가
--
-- 배경:
--   기존 consume_stars 는 p_description 문자열의 키워드("오늘 운세"/"데일리",
--   "종합운세"/"탐사선")로 차감할 재화를 추론했다. description 은 사용자 표시용
--   문자열이라 문구가 바뀌면 엉뚱한 재화가 차감될 수 있다.
--   → 엣지 함수(get-fortune)가 fortuneType 을 근거로 통화를 직접 결정해 넘긴다.
--
-- 하위 호환:
--   p_currency 는 DEFAULT NULL 이고, NULL 이면 기존 키워드 판정 로직을 그대로 사용한다.
--   따라서 3인자로 호출하는 구버전 클라이언트/엣지는 동작이 전혀 바뀌지 않는다.
--   (인자 목록이 바뀌므로 기존 3인자 함수는 DROP 후 4인자로 재생성)
-- =============================================================================

DROP FUNCTION IF EXISTS public.consume_stars(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.consume_stars(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_currency TEXT DEFAULT NULL
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
  v_tx_id UUID;
  v_currency TEXT;
BEGIN
  -- 명시적 통화가 유효하면 그것을 쓰고, 아니면(NULL/알 수 없는 값) 기존 키워드 판정 유지
  v_currency := UPPER(NULLIF(TRIM(COALESCE(p_currency, '')), ''));

  IF v_currency IN ('PAID', 'BONUS', 'PROBE') THEN
    v_is_probe := (v_currency = 'PROBE');
    v_is_daily := (v_currency = 'BONUS');
  ELSE
    v_is_daily := p_description LIKE '%오늘 운세%' OR p_description LIKE '%데일리%';
    v_is_probe := p_description LIKE '%종합운세%' OR p_description LIKE '%종합 운세%'
      OR p_description LIKE '%탐사선%';
  END IF;

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

  -- CONSUME 기록 시 consume_status = 'PENDING'
  -- (엣지에서 성공 시 SUCCESS, catch 시 FAILED, 크론에서 SYSTEM_FAILED)
  INSERT INTO star_transactions (
    user_id,
    type,
    amount,
    description,
    paid_amount,
    bonus_amount,
    probe_amount,
    consume_status
  ) VALUES (
    p_user_id,
    'CONSUME',
    -p_amount,
    p_description,
    CASE WHEN v_is_probe THEN 0 WHEN v_is_daily THEN 0 ELSE p_amount END,
    CASE WHEN v_is_probe THEN 0 WHEN v_is_daily THEN p_amount ELSE 0 END,
    CASE WHEN v_is_probe THEN p_amount ELSE 0 END,
    'PENDING'
  )
  RETURNING id INTO v_tx_id;

  RETURN json_build_object(
    'success', true,
    'message', '운세권이 차감되었습니다.',
    'transactionId', v_tx_id,
    -- 호출자가 환불 시 동일 재화를 되돌릴 수 있도록 실제 차감 통화를 함께 반환
    'currency', CASE WHEN v_is_probe THEN 'PROBE' WHEN v_is_daily THEN 'BONUS' ELSE 'PAID' END,
    'newBalance', json_build_object(
      'paid', v_new_paid,
      'bonus', v_new_bonus,
      'probe', v_new_probe
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.consume_stars(UUID, INTEGER, TEXT, TEXT) IS
  '재화 차감. p_currency(PAID/BONUS/PROBE)가 주어지면 그 재화를 차감하고, NULL이면 기존 description 키워드 판정(데일리→bonus, 종합운세/탐사선→probe, 그 외→paid)을 사용한다. 소모 건은 consume_status=PENDING으로 기록 후 엣지/크론에서 SUCCESS/FAILED/SYSTEM_FAILED로 갱신';

-- refund_stars 는 이미 p_refund_type(PAID/BONUS/PROBE) 인자를 받으므로 변경하지 않는다.
-- (20260311_three_currency_system.sql 참조)
