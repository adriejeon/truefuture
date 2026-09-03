-- 리뷰 표시 정보 보강
--  1) 표시 이름을 운세를 본 프로필 기준으로 서버가 생성: '김** (만 34세)' (en: 'K** (34)')
--  2) 누적 이용 횟수(usage_count)와 재구매 여부(is_repeat = 누적 2회 이상)를 작성 시점에 계산
--  3) 공개 뷰에 is_repeat 노출, 이관 후기는 재구매 고객으로 표기

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_repeat BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reviews.profile_id IS '후기 대상 결과를 본 프로필 (표시 이름·나이 산출 근거)';
COMMENT ON COLUMN public.reviews.usage_count IS '작성 시점 누적 이용 횟수 = fortune_history 행 수 + 완료 리포트 수';
COMMENT ON COLUMN public.reviews.is_repeat IS '재구매 고객 여부 (usage_count >= 2). 이관 후기는 true';

-- 이관 후기(기존 "재구매 고객" 표기)는 재구매로 유지
UPDATE public.reviews SET is_repeat = true WHERE source = 'imported' AND is_repeat = false;

-- ─────────────────────────────────────────────────────────────
-- INSERT 가드 재정의
-- ─────────────────────────────────────────────────────────────
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
  v_profile_id UUID;
  v_name TEXT;
  v_birth TIMESTAMPTZ;
  v_snapshot JSONB;
  v_initial TEXT;
  v_age INT;
  v_history_count INT;
  v_report_count INT;
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
  NEW.profile_id := NULL;

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

  -- 이용 검증 + 표시용 프로필 확인 (본인 기록과 대조)
  IF NEW.service = 'report' THEN
    SELECT pr.profile_id, pr.profile_snapshot
      INTO v_profile_id, v_snapshot
    FROM public.premium_reports pr
    WHERE pr.id = NEW.report_id AND pr.user_id = v_uid AND pr.status = 'DONE'
    LIMIT 1;
    NEW.is_verified := FOUND;

    IF v_profile_id IS NOT NULL THEN
      SELECT p.name, p.birth_date INTO v_name, v_birth
      FROM public.profiles p WHERE p.id = v_profile_id;
    END IF;
    -- 프로필이 삭제/수정됐어도 리포트 생성 당시 스냅샷으로 보완
    IF v_name IS NULL AND v_snapshot IS NOT NULL THEN
      v_name := v_snapshot->>'name';
    END IF;
    IF v_birth IS NULL AND v_snapshot IS NOT NULL AND (v_snapshot->>'birth_date') IS NOT NULL THEN
      BEGIN
        v_birth := (v_snapshot->>'birth_date')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_birth := NULL;
      END;
    END IF;
  ELSE
    SELECT fh.profile_id INTO v_profile_id
    FROM public.fortune_history fh
    WHERE fh.result_id = NEW.result_id AND fh.user_id = v_uid
    ORDER BY fh.created_at ASC
    LIMIT 1;

    NEW.is_verified := v_profile_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.fortune_results fr
      WHERE fr.id = NEW.result_id AND fr.user_id = v_uid
    );

    IF v_profile_id IS NOT NULL THEN
      SELECT p.name, p.birth_date INTO v_name, v_birth
      FROM public.profiles p WHERE p.id = v_profile_id;
    END IF;
    -- 이력이 없으면 결과에 저장된 프로필 이름으로 보완 (나이는 미표기)
    IF v_name IS NULL THEN
      SELECT fr.user_info->>'profileName' INTO v_name
      FROM public.fortune_results fr
      WHERE fr.id = NEW.result_id AND fr.user_id = v_uid;
    END IF;
  END IF;

  NEW.profile_id := v_profile_id;

  -- 표시 이름: 이름 첫 글자 + '**' + (만 나이). 프로필을 못 찾으면 클라이언트 값(익명) 유지
  v_name := NULLIF(btrim(COALESCE(v_name, '')), '');
  IF v_name IS NOT NULL THEN
    v_initial := left(v_name, 1);
    IF v_birth IS NOT NULL THEN
      v_age := date_part('year', age(now(), v_birth))::int;
    END IF;
    IF v_age IS NOT NULL AND v_age BETWEEN 0 AND 120 THEN
      NEW.display_name := CASE
        WHEN NEW.language = 'en' THEN v_initial || '** (' || v_age || ')'
        ELSE v_initial || '** (만 ' || v_age || '세)'
      END;
    ELSE
      NEW.display_name := v_initial || '**';
    END IF;
  END IF;

  -- 누적 이용 횟수(모든 서비스 질문/조회 + 완료 리포트) → 2회 이상이면 재구매 고객
  SELECT COUNT(*) INTO v_history_count FROM public.fortune_history WHERE user_id = v_uid;
  SELECT COUNT(*) INTO v_report_count FROM public.premium_reports WHERE user_id = v_uid AND status = 'DONE';
  NEW.usage_count := COALESCE(v_history_count, 0) + COALESCE(v_report_count, 0);
  NEW.is_repeat := NEW.usage_count >= 2;

  RETURN NEW;
END;
$$;

-- UPDATE 시 계산 컬럼 동결 (기존 감사 트리거 재정의)
CREATE OR REPLACE FUNCTION public.reviews_before_update_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := OLD.user_id;
  NEW.result_id := OLD.result_id;
  NEW.report_id := OLD.report_id;
  NEW.is_verified := OLD.is_verified;
  NEW.source := OLD.source;
  NEW.created_at := OLD.created_at;
  NEW.profile_id := OLD.profile_id;
  NEW.usage_count := OLD.usage_count;
  NEW.is_repeat := OLD.is_repeat;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
    IF NEW.status = 'published' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 공개 뷰: is_repeat 추가 (컬럼 추가는 CREATE OR REPLACE 로 가능)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.public_reviews AS
  SELECT
    r.id,
    r.service,
    r.rating,
    r.content,
    r.display_name,
    r.is_verified,
    r.source,
    r.language,
    COALESCE(r.published_at, r.created_at) AS published_at,
    r.created_at,
    r.is_repeat
  FROM public.reviews r
  WHERE r.status = 'published';

GRANT SELECT ON public.public_reviews TO anon, authenticated;
