-- =============================================================================
-- 결제 충전(CHARGE) 중복 지급 방지: related_item_id 부분 UNIQUE 인덱스
--
-- 목적:
--   purchase-stars / purchase-stars-iap / portone-webhook 이 "원장(star_transactions)
--   insert 를 먼저 하고, 23505(UNIQUE 위반)가 나면 already_processed 로 200 응답"
--   하는 원자적 멱등 처리를 할 수 있게 한다. (조회-후-삽입 방식은 동시 요청에서
--   이중 지급이 발생한다.)
--
-- 왜 술어를 결제 키 접두로 한정하는가:
--   운영 DB 의 CHARGE 행에는 related_item_id = 'welcome_telescope'(신규 가입 무료
--   망원경) 가 152건 중복 존재한다. 또한 refund_stars 는 related_item_id 없이
--   CHARGE 를 남긴다(NULL 은 UNIQUE 대상이 아니라 무관). 따라서 전체 CHARGE 에
--   UNIQUE 를 걸면 인덱스 생성 자체가 실패한다.
--   → 실제 결제 키 접두(order_ / imp_ / iap_)에만 유일성을 강제한다.
--   현재 키 분포: order_ 165건, iap_ 4건, test_order_01 1건.
--
-- ⚠️ 따라서 엣지 함수의 "23505 → already_processed" 멱등 처리는
--    related_item_id 가 'order_' / 'imp_' / 'iap_' 로 시작할 때에만 DB 수준으로
--    보장된다. 새로운 결제 채널을 추가할 때는 그 접두사를 아래 술어에 반드시 추가할 것.
--    (그 전까지 새 채널은 조회-후-삽입 수준의 약한 멱등성만 갖는다.)
--
-- 주의:
--   - LIKE 패턴에서 '_' 는 임의의 한 글자를 뜻하는 와일드카드이므로
--     백슬래시로 이스케이프해야 정확히 접두사를 매칭한다.
--   - supabase db push 는 마이그레이션을 트랜잭션 안에서 실행하므로
--     CREATE INDEX CONCURRENTLY 를 쓸 수 없다.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_star_transactions_charge_related
ON public.star_transactions (related_item_id)
WHERE type = 'CHARGE'
  AND (
    related_item_id LIKE 'order\_%'
    OR related_item_id LIKE 'imp\_%'
    OR related_item_id LIKE 'iap\_%'
  );

COMMENT ON INDEX public.idx_star_transactions_charge_related IS
  '결제 충전 멱등성: 결제 키 접두(order_/imp_/iap_)를 가진 CHARGE 행의 related_item_id 중복 방지. 엣지 함수의 23505→already_processed 처리가 이 접두들에서만 DB 수준으로 보장된다. welcome_telescope 등 비결제 CHARGE 는 술어에서 제외(운영 DB 에 중복 존재)';
