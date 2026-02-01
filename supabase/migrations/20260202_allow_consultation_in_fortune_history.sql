-- fortune_history: fortune_type CHECK에 'consultation' 추가
-- 자유 질문 상담소(CONSULTATION) 이력을 저장하기 위함

ALTER TABLE public.fortune_history
  DROP CONSTRAINT IF EXISTS fortune_history_fortune_type_check;

ALTER TABLE public.fortune_history
  ADD CONSTRAINT fortune_history_fortune_type_check
  CHECK (fortune_type IN ('daily', 'lifetime', 'yearly', 'compatibility', 'consultation'));

COMMENT ON COLUMN public.fortune_history.fortune_type IS '운세 타입: daily, lifetime, yearly, compatibility, consultation';
