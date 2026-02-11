-- star_transactions 테이블의 type 체크 제약조건 수정
-- 'CONSUME' 타입이 허용되도록 제약조건 업데이트

-- 1. 기존 제약조건 제거
ALTER TABLE public.star_transactions
DROP CONSTRAINT IF EXISTS star_transactions_type_check;

-- 2. 기존 데이터 정리
-- NULL이거나 빈 문자열인 경우 CHARGE로 설정
UPDATE public.star_transactions
SET type = 'CHARGE'
WHERE type IS NULL OR type = '';

-- 'CHARGE'나 'CONSUME'이 아닌 다른 값이 있다면 CHARGE로 변경 (기존 충전 데이터로 가정)
UPDATE public.star_transactions
SET type = 'CHARGE'
WHERE type NOT IN ('CHARGE', 'CONSUME');

-- 3. 새로운 제약조건 추가 (CHARGE와 CONSUME 모두 허용)
ALTER TABLE public.star_transactions
ADD CONSTRAINT star_transactions_type_check
CHECK (type IN ('CHARGE', 'CONSUME'));

COMMENT ON CONSTRAINT star_transactions_type_check ON public.star_transactions IS '운세권 거래 타입: CHARGE(충전), CONSUME(차감)';
