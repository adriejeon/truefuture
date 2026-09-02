-- 사용자 리뷰 시스템 + 관리자 권한
--
-- 흐름: 작성(pending) → 관리자 검수 → 공개(published) / 비공개(hidden) / 거절(rejected)
-- 사이트에는 public_reviews 뷰(published 만, 개인 식별 컬럼 제외)를 통해서만 노출된다.
--
-- 이용 검증(is_verified)은 클라이언트 값을 신뢰하지 않고 BEFORE INSERT 트리거가 계산한다.
--   · report          : premium_reports(id=report_id, user_id=본인, status='DONE') 존재
--   · 그 외 서비스     : fortune_history(result_id, user_id=본인) 또는 fortune_results(id, user_id=본인) 존재

-- ─────────────────────────────────────────────────────────────
-- 1. 관리자 목록 + is_admin()
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_users IS '운영 관리자 계정 목록. 행이 있으면 is_admin() = true';

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 본인 행만 조회 가능 (관리자 여부 확인용). INSERT/UPDATE/DELETE 는 클라이언트 정책 없음 → SQL/service role 만 가능
DROP POLICY IF EXISTS "Admins can view own admin row" ON public.admin_users;
CREATE POLICY "Admins can view own admin row"
  ON public.admin_users FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS '현재 로그인 사용자가 admin_users 에 있으면 true';
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. reviews 테이블
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 작성자 (탈퇴 시 NULL 로 남겨 익명 후기로 보존)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 이용 서비스. imported(과거 채널에서 옮겨온 후기)는 NULL 허용
  service TEXT CHECK (service IN ('consultation', 'compatibility', 'daily', 'lifetime', 'report')),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 10 AND 500),
  -- 사이트에 표시되는 익명화 이름 (예: 달리***)
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 20),
  -- 이용 증빙: 운세권 서비스는 fortune_results.id, 리포트는 premium_reports.id
  result_id UUID REFERENCES public.fortune_results(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.premium_reports(id) ON DELETE SET NULL,
  -- 트리거가 계산. 실제 이용/구매 기록과 대조된 후기인지
  is_verified BOOLEAN NOT NULL DEFAULT false,
  -- site: 사이트에서 직접 작성 / imported: 기존 채널 후기 이관
  source TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'imported')),
  language TEXT NOT NULL DEFAULT 'ko' CHECK (language IN ('ko', 'en')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'hidden', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reviews_service_required_for_site
    CHECK (source = 'imported' OR service IS NOT NULL)
);

COMMENT ON TABLE public.reviews IS '사용자 후기. pending → 관리자 검수 → published 만 사이트 노출';
COMMENT ON COLUMN public.reviews.service IS 'consultation | compatibility | daily | lifetime | report (imported 는 NULL 가능)';
COMMENT ON COLUMN public.reviews.is_verified IS '실제 이용/구매 기록(fortune_history·fortune_results·premium_reports)과 대조 성공 여부. 트리거 계산';
COMMENT ON COLUMN public.reviews.status IS 'pending(검수 대기) | published(공개) | hidden(비공개) | rejected(거절)';

-- 같은 결과/리포트에 대한 중복 후기 방지
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_user_result
  ON public.reviews (user_id, result_id) WHERE result_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_user_report
  ON public.reviews (user_id, report_id) WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_status_created
  ON public.reviews (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_published_service
  ON public.reviews (service, language, published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_reviews_user_created
  ON public.reviews (user_id, created_at DESC);

-- updated_at 자동 갱신 (profiles 마이그레이션의 공용 함수 재사용)
DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 3. INSERT 가드: 클라이언트 작성 시 소유자·상태 강제 + 이용 검증 + 일일 작성 제한
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

  -- 일일 작성 제한 (스팸 방지): 24시간 내 3건
  SELECT COUNT(*) INTO v_recent
  FROM public.reviews
  WHERE user_id = v_uid AND created_at > now() - INTERVAL '1 day';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'REVIEW_RATE_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  -- 이용 검증
  IF NEW.service = 'report' THEN
    NEW.result_id := NULL;
    NEW.is_verified := NEW.report_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.premium_reports pr
      WHERE pr.id = NEW.report_id AND pr.user_id = v_uid AND pr.status = 'DONE'
    );
  ELSE
    NEW.report_id := NULL;
    NEW.is_verified := NEW.result_id IS NOT NULL AND (
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

DROP TRIGGER IF EXISTS trg_reviews_before_insert ON public.reviews;
CREATE TRIGGER trg_reviews_before_insert
  BEFORE INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.reviews_before_insert_guard();

-- 상태 변경 시 검수자·시각 기록
CREATE OR REPLACE FUNCTION public.reviews_before_update_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 작성자·증빙·출처는 사후 변경 불가
  NEW.user_id := OLD.user_id;
  NEW.result_id := OLD.result_id;
  NEW.report_id := OLD.report_id;
  NEW.is_verified := OLD.is_verified;
  NEW.source := OLD.source;
  NEW.created_at := OLD.created_at;

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

DROP TRIGGER IF EXISTS trg_reviews_before_update ON public.reviews;
CREATE TRIGGER trg_reviews_before_update
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.reviews_before_update_audit();

-- ─────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 본인 후기 + 관리자는 전체 조회
DROP POLICY IF EXISTS "Users view own reviews or admin views all" ON public.reviews;
CREATE POLICY "Users view own reviews or admin views all"
  ON public.reviews FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- 로그인 사용자는 본인 명의로만 작성 (나머지 컬럼은 트리거가 강제)
DROP POLICY IF EXISTS "Users create own reviews" ON public.reviews;
CREATE POLICY "Users create own reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 검수(상태 변경)·삭제는 관리자만
DROP POLICY IF EXISTS "Admins update reviews" ON public.reviews;
CREATE POLICY "Admins update reviews"
  ON public.reviews FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete reviews" ON public.reviews;
CREATE POLICY "Admins delete reviews"
  ON public.reviews FOR DELETE
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 5. 공개 뷰 (published 만, 개인 식별 컬럼 제외) + 요약 RPC
-- ─────────────────────────────────────────────────────────────
-- 뷰 소유자(postgres) 권한으로 실행되어 reviews RLS 를 우회하지만, WHERE 절과 컬럼 선택으로
-- 공개해도 되는 정보만 노출한다. (security_invoker 를 켜면 anon 이 published 행을 볼 수 없음)
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
    r.created_at
  FROM public.reviews r
  WHERE r.status = 'published';

COMMENT ON VIEW public.public_reviews IS '사이트 노출용 공개 후기 (published 만, user_id 등 개인 식별 컬럼 제외)';
GRANT SELECT ON public.public_reviews TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_review_summary(p_service TEXT DEFAULT NULL, p_language TEXT DEFAULT NULL)
RETURNS TABLE (review_count BIGINT, avg_rating NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT AS review_count,
    COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0) AS avg_rating
  FROM public.reviews
  WHERE status = 'published'
    AND (p_service IS NULL OR service = p_service)
    AND (p_language IS NULL OR language = p_language);
$$;

COMMENT ON FUNCTION public.get_review_summary(TEXT, TEXT) IS '공개 후기 개수·평균 별점 (서비스/언어 필터 선택)';
GRANT EXECUTE ON FUNCTION public.get_review_summary(TEXT, TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. 시드
-- ─────────────────────────────────────────────────────────────
-- 6-1. 관리자: 운영자 계정 (이메일 기준, 존재하는 계정만)
INSERT INTO public.admin_users (user_id, note)
SELECT u.id, 'seed: site owner'
FROM auth.users u
WHERE lower(u.email) IN ('jupiteradrie@gmail.com', 'mhjun01@plateer.com')
ON CONFLICT (user_id) DO NOTHING;

-- 6-2. 기존 메인 페이지에 하드코딩되어 있던 실제 고객 후기 3건을 이관 (ko/en)
--      source='imported' 로 구분해 사이트에서는 '재구매 고객' 라벨로 표시된다.
INSERT INTO public.reviews
  (id, user_id, service, rating, content, display_name, is_verified, source, language, status, published_at, created_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001', NULL, NULL, 5,
   '작년에 운세를 확인했고, 올해 알려진 흐름과 일치하는 부분이 있어 다시 이용했습니다. 시기 안내가 도움이 되었습니다.',
   '달리***', true, 'imported', 'ko', 'published', '2026-01-25 09:00:00+09', '2026-01-25 09:00:00+09'),
  ('a1000000-0000-4000-8000-000000000002', NULL, NULL, 5,
   '적중률도 높고 다른 데와 달리 디테일하게 나와서 너무 만족스러워요.',
   '전통***', true, 'imported', 'ko', 'published', '2026-01-25 09:00:00+09', '2026-01-25 09:00:00+09'),
  ('a1000000-0000-4000-8000-000000000003', NULL, NULL, 5,
   '항상 너무너무 잘 맞습니다. 전에 받았던 상담 파일 보면 다 말씀해 주신 내용입니다. 다음에 또 찾아뵙겠습니다.',
   '진지***', true, 'imported', 'ko', 'published', '2026-01-25 09:00:00+09', '2026-01-25 09:00:00+09'),
  ('a1000000-0000-4000-8000-000000000011', NULL, NULL, 5,
   'I used the service last year; several themes matched what unfolded this year, so I came back. The timing notes were helpful.',
   'dalli***', true, 'imported', 'en', 'published', '2026-01-25 09:00:00+09', '2026-01-25 09:00:00+09'),
  ('a1000000-0000-4000-8000-000000000012', NULL, NULL, 5,
   'The accuracy is high and the details are unmatched — way more satisfying than anything else out there.',
   'jeontu***', true, 'imported', 'en', 'published', '2026-01-25 09:00:00+09', '2026-01-25 09:00:00+09'),
  ('a1000000-0000-4000-8000-000000000013', NULL, NULL, 5,
   'It''s always spot-on. Every time I re-read my old reading, everything was exactly as described. I''ll definitely be back.',
   'jinji***', true, 'imported', 'en', 'published', '2026-01-25 09:00:00+09', '2026-01-25 09:00:00+09')
ON CONFLICT (id) DO NOTHING;
