-- 프리미엄 상세 리포트 (15,000원 단건 결제 상품)
-- 결제 → 리포트 생성(섹션 순차) → 열람/PDF 저장까지의 전체 수명주기를 담는 전용 원장.
-- 운세권(별) 3종 화폐 시스템과는 완전히 분리된 단건 entitlement 방식.

CREATE TABLE IF NOT EXISTS public.premium_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- 프로필 스냅샷: 프로필이 수정/삭제되어도 리포트 생성 당시 정보를 보존
  profile_snapshot JSONB NOT NULL,
  -- 사용자가 더 주의 깊게 보고 싶다고 입력한 질문 (선택)
  question TEXT,
  status TEXT NOT NULL DEFAULT 'PAID'
    CHECK (status IN ('PAID', 'GENERATING', 'DONE', 'FAILED')),
  sections_total INT NOT NULL DEFAULT 3,
  sections_done INT NOT NULL DEFAULT 0,
  -- 생성된 리포트 본문 (markdown, 섹션이 완료될 때마다 이어붙임)
  content TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  -- 결제 정보 (PortOne V2). merchant_uid 로 중복 결제 방지
  merchant_uid TEXT NOT NULL UNIQUE,
  payment_id TEXT,
  amount INT NOT NULL DEFAULT 15000,
  currency TEXT NOT NULL DEFAULT 'KRW',
  -- 동시 생성 방지 락 (생성 요청 시각, 일정 시간 경과 시 무시)
  generation_lock_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_premium_reports_user_created
  ON public.premium_reports (user_id, created_at DESC);

ALTER TABLE public.premium_reports ENABLE ROW LEVEL SECURITY;

-- 본인 리포트만 조회 가능 (결제된 개인 리포트이므로 공유 링크 없음)
DROP POLICY IF EXISTS "Users can view own premium reports" ON public.premium_reports;
CREATE POLICY "Users can view own premium reports"
  ON public.premium_reports FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE 는 클라이언트 정책 없음 → Edge Function(service role)만 가능

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.set_premium_reports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_premium_reports_updated_at ON public.premium_reports;
CREATE TRIGGER trg_premium_reports_updated_at
  BEFORE UPDATE ON public.premium_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_premium_reports_updated_at();
