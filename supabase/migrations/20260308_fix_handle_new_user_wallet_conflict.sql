-- handle_new_user_wallet: grant_welcome_telescope_on_signup과의 경쟁 시 중복 키(23505) 방지
-- 이미 다른 트리거가 user_wallets 행을 만들었으면 INSERT를 건너뜀

CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_wallets (user_id, paid_stars, bonus_stars, updated_at)
  VALUES (NEW.id, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user_wallet()
IS '신규 유저 생성 시 user_wallets 행 생성. ON CONFLICT DO NOTHING으로 다른 트리거와의 중복 삽입 방지';
