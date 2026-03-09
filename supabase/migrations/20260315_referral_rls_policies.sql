-- RLS 정책: 마이페이지에서 본인 추천 코드·추천인 정보 조회 허용
-- referral_codes: 로그인 유저가 자신의 code만 조회
-- referrals: 로그인 유저가 자신이 피추천인인 행만 조회 (referee_id = 본인)

CREATE POLICY "Users can read own referral code"
  ON public.referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own referral row as referee"
  ON public.referrals
  FOR SELECT
  USING (auth.uid() = referee_id);
