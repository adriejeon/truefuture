-- 재가입 어뷰징 방지: 탈퇴 시 해시 계산 + 저장을 DB 한 곳에서 수행 (JS/엣지와 해시 불일치 방지)
-- store_deleted_user_hash(p_user_id): compute_identity_hash 호출 후 deleted_users_hash에 INSERT

CREATE OR REPLACE FUNCTION public.store_deleted_user_hash(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  v_hash := public.compute_identity_hash(p_user_id);

  IF v_hash IS NULL OR v_hash = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.deleted_users_hash (identity_hash, deleted_at)
  VALUES (v_hash, NOW())
  ON CONFLICT (identity_hash)
  DO UPDATE SET deleted_at = NOW();
END;
$$;

COMMENT ON FUNCTION public.store_deleted_user_hash(UUID)
IS '탈퇴 유저 식별 해시를 compute_identity_hash로 계산 후 deleted_users_hash에 저장 (재가입 시 무료 쿠폰 중복 지급 방지)';
