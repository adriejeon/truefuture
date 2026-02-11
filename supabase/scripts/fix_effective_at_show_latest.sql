-- Supabase SQL Editor에서 실행하세요.
-- 이용약관 1.4, 개인정보처리방침 1.1이 "현재 시행 중"으로 조회되도록 effective_at을 과거로 수정합니다.

UPDATE public.terms_definitions
SET effective_at = '2026-02-11 00:00:00+00'
WHERE (type = 'terms' AND version = '1.4')
   OR (type = 'privacy' AND version = '1.1');
