-- 별 유효기간 기능 테스트 스크립트
-- 개발 환경에서만 사용하세요!

-- 1. 테스트 데이터 삽입 (실제 user_id로 변경 필요)
-- DO $$
-- DECLARE
--   test_user_id UUID := 'YOUR-USER-ID-HERE';
-- BEGIN
--   -- 2026-02-10 구매 (1년 유효 - 2027-02-10까지)
--   INSERT INTO star_transactions (user_id, amount, type, description, paid_amount, bonus_amount, expires_at, is_expired, created_at)
--   VALUES (
--     test_user_id,
--     31,
--     'CHARGE',
--     '패키지 구매: 혜성 (Comet)',
--     30,
--     1,
--     '2027-02-10 00:00:00+00',
--     false,
--     '2026-02-10 10:00:00+00'
--   );

--   -- 2026-02-01 구매 (유효기간 없음 - 2026-02-14 이전)
--   INSERT INTO star_transactions (user_id, amount, type, description, paid_amount, bonus_amount, expires_at, is_expired, created_at)
--   VALUES (
--     test_user_id,
--     10,
--     'CHARGE',
--     '패키지 구매: 유성 (Meteor)',
--     10,
--     0,
--     NULL,
--     false,
--     '2026-02-01 10:00:00+00'
--   );

--   -- 2025-02-15 구매 (이미 만료됨 - 테스트용)
--   INSERT INTO star_transactions (user_id, amount, type, description, paid_amount, bonus_amount, expires_at, is_expired, created_at)
--   VALUES (
--     test_user_id,
--     10,
--     'CHARGE',
--     '패키지 구매: 유성 (Meteor)',
--     10,
--     0,
--     '2026-02-15 00:00:00+00',
--     false,
--     '2025-02-15 10:00:00+00'
--   );
-- END $$;

-- 2. 만료 체크 함수 테스트
SELECT check_expired_stars();

-- 3. 결과 확인
SELECT 
  id,
  user_id,
  amount,
  paid_amount,
  bonus_amount,
  description,
  expires_at,
  is_expired,
  created_at,
  CASE 
    WHEN expires_at IS NULL THEN '무제한'
    WHEN is_expired OR expires_at < NOW() THEN '만료됨'
    WHEN expires_at - NOW() < INTERVAL '30 days' THEN '곧 만료'
    ELSE '유효'
  END as status
FROM star_transactions
WHERE type = 'CHARGE'
ORDER BY created_at DESC;

-- 4. get_valid_stars 함수 테스트 (실제 user_id로 변경 필요)
-- SELECT * FROM get_valid_stars('YOUR-USER-ID-HERE');

-- 5. 사용자별 유효한 별 집계
SELECT 
  user_id,
  COUNT(*) as total_purchases,
  SUM(CASE WHEN is_expired OR (expires_at IS NOT NULL AND expires_at < NOW()) THEN 1 ELSE 0 END) as expired_count,
  SUM(CASE WHEN is_expired OR (expires_at IS NOT NULL AND expires_at < NOW()) THEN amount ELSE 0 END) as expired_stars,
  SUM(CASE WHEN NOT is_expired AND (expires_at IS NULL OR expires_at >= NOW()) THEN amount ELSE 0 END) as valid_stars
FROM star_transactions
WHERE type = 'CHARGE'
GROUP BY user_id;
