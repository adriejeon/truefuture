-- ============================================================
-- terms_definitions 테이블에 language 컬럼 추가
-- 목적: 다국어 약관(이용약관·개인정보처리방침) 분리 저장
-- ============================================================

-- 1. language 컬럼 추가 (기본값 'ko', Not Null)
ALTER TABLE public.terms_definitions
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ko';

-- 2. 기존 데이터를 명시적으로 'ko'로 설정
UPDATE public.terms_definitions
  SET language = 'ko'
  WHERE language IS NULL OR language = '';

-- 3. 기존 UNIQUE 제약 제거 후 language 포함한 제약으로 교체
--    (type + version 만으로는 영문/한국어 동일 버전 공존 불가)
ALTER TABLE public.terms_definitions
  DROP CONSTRAINT IF EXISTS unique_type_version;

ALTER TABLE public.terms_definitions
  ADD CONSTRAINT unique_type_version_language UNIQUE (type, version, language);

-- 4. language 컬럼 허용값 제약 추가
ALTER TABLE public.terms_definitions
  ADD CONSTRAINT terms_language_check CHECK (language IN ('ko', 'en'));

-- 5. 언어별 조회 성능을 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_terms_definitions_type_lang_effective
  ON public.terms_definitions(type, language, effective_at DESC);

-- 6. 컬럼 주석
COMMENT ON COLUMN public.terms_definitions.language IS '약관 언어 코드: ko(한국어) 또는 en(영어)';
