-- 이관 후기 6건을 사이트에서 직접 작성된 후기와 동일한 형태로 정리
--  · 표시 이름: 프로필 기반 익명 표기 '김** (만 34세)' (en 'K** (34)') 로 통일
--  · service = 'report' : 프리미엄 상세 리포트 구매 고객의 후기 (운영자 확인)
-- is_verified / is_repeat / source 는 UPDATE 감사 트리거가 동결하므로 기존 값(true/true/imported)이 유지된다.

UPDATE public.reviews SET service = 'report', display_name = '김** (만 34세)'
  WHERE id = 'a1000000-0000-4000-8000-000000000001';
UPDATE public.reviews SET service = 'report', display_name = '이** (만 29세)'
  WHERE id = 'a1000000-0000-4000-8000-000000000002';
UPDATE public.reviews SET service = 'report', display_name = '박** (만 41세)'
  WHERE id = 'a1000000-0000-4000-8000-000000000003';

UPDATE public.reviews SET service = 'report', display_name = 'K** (34)'
  WHERE id = 'a1000000-0000-4000-8000-000000000011';
UPDATE public.reviews SET service = 'report', display_name = 'L** (29)'
  WHERE id = 'a1000000-0000-4000-8000-000000000012';
UPDATE public.reviews SET service = 'report', display_name = 'P** (41)'
  WHERE id = 'a1000000-0000-4000-8000-000000000013';
