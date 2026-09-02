-- 리뷰 INSERT 가드 보강: 사이트에서 작성하는 후기는 반드시 결과(result_id) 또는 리포트(report_id)에 연결되어야 한다.
-- (검증 과정에서 증빙 ID 없는 작성이 허용되어 같은 사용자가 무제한 중복 작성 가능한 구멍 확인 → 차단)
-- 서비스 롤/마이그레이션 경로(시드·이관)는 기존과 동일하게 값을 신뢰한다.

CREATE OR REPLACE FUNCTION public.reviews_before_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := auth.role();
  v_uid UUID := auth.uid();
  v_recent INT;
BEGIN
  -- 서비스 롤 / 마이그레이션(SQL) 경로: 값을 그대로 신뢰 (시드·이관용)
  IF v_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REVIEW_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- 클라이언트가 보낸 값 중 신뢰하지 않는 컬럼을 강제
  NEW.user_id := v_uid;
  NEW.source := 'site';
  NEW.status := 'pending';
  NEW.admin_note := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.published_at := NULL;

  IF NEW.service IS NULL THEN
    RAISE EXCEPTION 'REVIEW_SERVICE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  -- 증빙 대상 필수: 리포트는 report_id, 그 외 서비스는 result_id
  IF NEW.service = 'report' THEN
    NEW.result_id := NULL;
    IF NEW.report_id IS NULL THEN
      RAISE EXCEPTION 'REVIEW_TARGET_REQUIRED' USING ERRCODE = '23514';
    END IF;
  ELSE
    NEW.report_id := NULL;
    IF NEW.result_id IS NULL THEN
      RAISE EXCEPTION 'REVIEW_TARGET_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 일일 작성 제한 (스팸 방지): 24시간 내 3건
  SELECT COUNT(*) INTO v_recent
  FROM public.reviews
  WHERE user_id = v_uid AND created_at > now() - INTERVAL '1 day';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'REVIEW_RATE_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  -- 이용 검증 (본인 기록과 대조)
  IF NEW.service = 'report' THEN
    NEW.is_verified := EXISTS (
      SELECT 1 FROM public.premium_reports pr
      WHERE pr.id = NEW.report_id AND pr.user_id = v_uid AND pr.status = 'DONE'
    );
  ELSE
    NEW.is_verified := (
      EXISTS (
        SELECT 1 FROM public.fortune_history fh
        WHERE fh.result_id = NEW.result_id AND fh.user_id = v_uid
      )
      OR EXISTS (
        SELECT 1 FROM public.fortune_results fr
        WHERE fr.id = NEW.result_id AND fr.user_id = v_uid
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
