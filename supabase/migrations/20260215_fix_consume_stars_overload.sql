-- consume_stars 함수 오버로딩 충돌 해결
-- 모든 기존 오버로드를 제거하고 단일 함수로 재생성

-- 모든 consume_stars 함수 제거 (동적 쿼리로 모든 시그니처 제거)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- consume_stars라는 이름의 모든 함수 찾아서 제거
  FOR r IN 
    SELECT oidvectortypes(proargtypes) as argtypes, proname
    FROM pg_proc
    WHERE proname = 'consume_stars'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s(%s) CASCADE', r.proname, r.argtypes);
  END LOOP;
END $$;

-- 새로운 consume_stars 함수 생성
CREATE OR REPLACE FUNCTION consume_stars(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT
)
RETURNS JSON AS $$
DECLARE
  v_current_paid BIGINT;
  v_current_bonus BIGINT;
  v_new_paid BIGINT;
  v_new_bonus BIGINT;
  v_is_daily BOOLEAN;
BEGIN
  -- 데일리 운세 여부 확인
  v_is_daily := p_description LIKE '%오늘 운세%' OR p_description LIKE '%데일리%';

  -- 현재 잔액 조회 (유효한 운세권만)
  SELECT 
    COALESCE(paid_stars, 0),
    COALESCE(bonus_stars, 0)
  INTO v_current_paid, v_current_bonus
  FROM user_wallets
  WHERE user_id = p_user_id;

  -- 잔액이 없는 경우 초기화
  IF v_current_paid IS NULL THEN
    v_current_paid := 0;
  END IF;
  IF v_current_bonus IS NULL THEN
    v_current_bonus := 0;
  END IF;

  -- 데일리 운세인 경우
  IF v_is_daily THEN
    -- 데일리 운세권(bonus_stars) 확인
    IF v_current_bonus < p_amount THEN
      RETURN json_build_object(
        'success', false,
        'message', '데일리 운세권이 부족합니다.',
        'newBalance', json_build_object(
          'paid', v_current_paid,
          'bonus', v_current_bonus
        )
      );
    END IF;
    
    -- 데일리 운세권 차감
    v_new_paid := v_current_paid;
    v_new_bonus := v_current_bonus - p_amount;
  ELSE
    -- 일반 운세인 경우: paid_stars 확인
    IF v_current_paid < p_amount THEN
      RETURN json_build_object(
        'success', false,
        'message', '일반 운세권이 부족합니다.',
        'newBalance', json_build_object(
          'paid', v_current_paid,
          'bonus', v_current_bonus
        )
      );
    END IF;
    
    -- 일반 운세권 차감
    v_new_paid := v_current_paid - p_amount;
    v_new_bonus := v_current_bonus;
  END IF;

  -- user_wallets 업데이트
  UPDATE user_wallets
  SET 
    paid_stars = v_new_paid,
    bonus_stars = v_new_bonus,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 차감 트랜잭션 기록
  INSERT INTO star_transactions (
    user_id,
    type,
    amount,
    description,
    paid_amount,
    bonus_amount
  ) VALUES (
    p_user_id,
    'CONSUME',
    -p_amount,
    p_description,
    CASE WHEN v_is_daily THEN 0 ELSE p_amount END,
    CASE WHEN v_is_daily THEN p_amount ELSE 0 END
  );

  -- 성공 응답
  RETURN json_build_object(
    'success', true,
    'message', '운세권이 차감되었습니다.',
    'newBalance', json_build_object(
      'paid', v_new_paid,
      'bonus', v_new_bonus
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_stars(UUID, INTEGER, TEXT) IS '운세권 차감 함수 - 데일리는 bonus_stars, 나머지는 paid_stars에서 차감';
