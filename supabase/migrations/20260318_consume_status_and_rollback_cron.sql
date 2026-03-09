-- =============================================================================
-- 재화 소모 PENDING 상태 및 pg_cron 기반 롤백 시스템
-- Edge Function 타임아웃/강제 종료 시 catch 미실행으로 인한 재화 미환불 방지
-- =============================================================================

-- 1. star_transactions에 소모 상태 컬럼 추가 (CONSUME 건만 사용)
ALTER TABLE public.star_transactions
ADD COLUMN IF NOT EXISTS consume_status TEXT;

COMMENT ON COLUMN public.star_transactions.consume_status IS 'CONSUME 건 처리 상태: PENDING(처리중), SUCCESS(성공), FAILED(일반에러 환불), SYSTEM_FAILED(크론 롤백)';

-- 기존 CONSUME 건은 이미 완료된 것으로 간주
UPDATE public.star_transactions
SET consume_status = 'SUCCESS'
WHERE type = 'CONSUME' AND consume_status IS NULL;

-- CONSUME 타입일 때만 유효한 값 허용 (CHARGE는 NULL)
ALTER TABLE public.star_transactions
DROP CONSTRAINT IF EXISTS star_transactions_consume_status_check;

ALTER TABLE public.star_transactions
ADD CONSTRAINT star_transactions_consume_status_check
CHECK (
  (type <> 'CONSUME') OR
  (consume_status IN ('PENDING', 'SUCCESS', 'FAILED', 'SYSTEM_FAILED'))
);

-- 크론 쿼리용 인덱스: PENDING이며 오래된 CONSUME 건 조회
CREATE INDEX IF NOT EXISTS idx_star_transactions_consume_pending_created
ON public.star_transactions (created_at)
WHERE type = 'CONSUME' AND consume_status = 'PENDING';


-- 2. consume_stars: CONSUME INSERT 시 consume_status = 'PENDING', 반환값에 transaction_id 포함
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
  v_tx_id UUID;
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

  -- CONSUME 기록 시 consume_status = 'PENDING' (엣지에서 성공 시 SUCCESS, catch 시 FAILED, 크론에서 SYSTEM_FAILED)
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
    'newBalance', json_build_object(
      'paid', v_new_paid,
      'bonus', v_new_bonus,
      'probe', v_new_probe
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_stars(UUID, INTEGER, TEXT) IS '재화 차감: 데일리→bonus, 종합운세/탐사선→probe, 그 외→paid. 소모 건은 consume_status=PENDING으로 기록 후 엣지/크론에서 SUCCESS/FAILED/SYSTEM_FAILED로 갱신';


-- 3. PENDING 10분 초과 건 일괄 환불 및 상태를 SYSTEM_FAILED로 변경하는 함수
CREATE OR REPLACE FUNCTION public.rollback_pending_consumes()
RETURNS TABLE(processed_id UUID, user_id UUID, refund_type TEXT, amount INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_refund_type TEXT;
  v_amount INT;
BEGIN
  FOR r IN
    SELECT id, st.user_id, st.amount, st.paid_amount, st.bonus_amount, st.probe_amount
    FROM public.star_transactions st
    WHERE st.type = 'CONSUME'
      AND st.consume_status = 'PENDING'
      AND st.created_at < NOW() - INTERVAL '10 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_amount := ABS(r.amount);

    IF r.probe_amount > 0 THEN
      v_refund_type := 'PROBE';
    ELSIF r.bonus_amount > 0 THEN
      v_refund_type := 'BONUS';
    ELSE
      v_refund_type := 'PAID';
    END IF;

    -- 재화 환불 (user_wallets 복구 + CHARGE 거래 기록)
    PERFORM public.refund_stars(
      r.user_id,
      v_amount,
      '시스템 타임아웃(Edge Function 종료)으로 인한 자동 환불',
      v_refund_type
    );

    -- 중복 환불 방지: 상태를 SYSTEM_FAILED로 변경
    UPDATE public.star_transactions
    SET consume_status = 'SYSTEM_FAILED'
    WHERE id = r.id;

    processed_id := r.id;
    user_id := r.user_id;
    refund_type := v_refund_type;
    amount := v_amount;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.rollback_pending_consumes() IS 'PENDING 상태로 10분 이상 지난 CONSUME 건을 환불하고 consume_status를 SYSTEM_FAILED로 변경 (pg_cron 5분마다 호출)';


-- 4. pg_cron 스케줄 등록 (5분마다 실행)
-- cron 스키마가 있을 때만 등록 (pg_cron 확장이 활성화된 경우). 없으면 스킵하여 마이그레이션은 성공.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'rollback-pending-consumes',
      '*/5 * * * *',
      'SELECT * FROM public.rollback_pending_consumes()'
    );
  END IF;
END $$;
-- pg_cron 미활성화 시: Supabase 대시보드 → Database → Extensions → pg_cron 활성화 후
-- SQL 에디터에서 수동 실행: SELECT cron.schedule('rollback-pending-consumes', '*/5 * * * *', 'SELECT * FROM public.rollback_pending_consumes()');
