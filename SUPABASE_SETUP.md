# Supabase Edge Functions 설정 가이드

## 개요

이 프로젝트는 Google Gemini API를 안전하고 안정적으로 호출하기 위해 Supabase Edge Functions를 사용합니다.
프론트엔드에서 직접 API를 호출할 때 발생하는 다음 문제들을 해결합니다:

- ✅ **지역 차단 문제**: 모바일(LTE) 환경에서 `User location is not supported` (400) 에러
- ✅ **CORS 문제**: 브라우저의 CORS 정책으로 인한 제한
- ✅ **API 키 보안**: 클라이언트 측에 API 키 노출 방지

## 설정 완료 항목

### ✅ 1. Supabase CLI 설치
```bash
# 이미 설치 완료 (버전: 2.72.7)
supabase --version
```

### ✅ 2. 프로젝트 초기화
```bash
# 이미 완료
supabase init
```

### ✅ 3. Edge Function 생성 및 코드 작성
- 함수 이름: `get-fortune`
- 위치: `supabase/functions/get-fortune/index.ts`
- 기능:
  - 점성술 차트 계산 (astronomy-engine 사용)
  - Gemini API 호출 및 AI 해석
  - CORS 헤더 처리

### ✅ 4. Frontend 코드 수정
- 기존: Cloudflare Workers API 호출
- 변경: Supabase Edge Functions 호출 (`supabase.functions.invoke`)

## 남은 단계 (수동 실행 필요)

### 1️⃣ Supabase 로그인
터미널에서 다음 명령어를 실행하여 Supabase에 로그인하세요:

```bash
supabase login
```

브라우저가 열리고 인증을 완료하면 자동으로 CLI가 연결됩니다.

### 2️⃣ 프로젝트 연결
```bash
supabase link --project-ref mxcdrqdcadnccpuntdxw
```

### 3️⃣ Secret 등록
`.dev.vars` 파일에 있는 `GEMINI_API_KEY`를 Supabase 프로젝트의 환경 변수로 등록:

```bash
supabase secrets set GEMINI_API_KEY=YOUR_API_KEY_HERE
```

실제 명령어 (`.dev.vars`의 키 사용):
```bash
supabase secrets set GEMINI_API_KEY=AIzaSyApLFpyP4CyY0dlQ9UvGMlVnICN7-iKHaM
```

### 4️⃣ 함수 배포
```bash
supabase functions deploy get-fortune --no-verify-jwt
```

**참고**: `--no-verify-jwt` 플래그는 JWT 인증 없이 함수를 호출할 수 있도록 합니다.

### 5️⃣ 배포 확인
배포가 완료되면 다음과 같은 URL이 생성됩니다:
```
https://mxcdrqdcadnccpuntdxw.supabase.co/functions/v1/get-fortune
```

테스트 명령어:
```bash
curl -X POST 'https://mxcdrqdcadnccpuntdxw.supabase.co/functions/v1/get-fortune' \
  -H 'Content-Type: application/json' \
  -d '{
    "birthDate": "1990-01-01T12:00:00",
    "lat": 37.5665,
    "lng": 126.9780,
    "reportType": "daily"
  }'
```

## 로컬 테스트

로컬에서 Edge Function을 테스트하려면:

```bash
# Supabase 로컬 환경 시작
supabase start

# 로컬 함수 실행 (별도 터미널)
supabase functions serve get-fortune --env-file .dev.vars

# 테스트 요청
curl -X POST 'http://localhost:54321/functions/v1/get-fortune' \
  -H 'Content-Type: application/json' \
  -d '{
    "birthDate": "1990-01-01T12:00:00",
    "lat": 37.5665,
    "lng": 126.9780,
    "reportType": "daily"
  }'
```

## 트러블슈팅

### 문제: "Access token not provided" 에러
**해결**: `supabase login` 명령어를 실행하여 로그인하세요.

### 문제: "GEMINI_API_KEY not configured" 에러
**해결**: `supabase secrets set` 명령어로 API 키를 등록하세요.

### 문제: CORS 에러
**해결**: Edge Function 코드에 CORS 헤더가 포함되어 있습니다. 배포 후에도 문제가 지속되면 Supabase 대시보드에서 CORS 설정을 확인하세요.

### 문제: "User location is not supported" 에러 (기존 문제)
**해결**: Edge Function은 서버 사이드에서 API를 호출하므로 이 문제가 자동으로 해결됩니다.

## 아키텍처 변경 사항

### Before (Cloudflare Workers)
```
Frontend → Cloudflare Workers → Gemini API
```

### After (Supabase Edge Functions)
```
Frontend → Supabase Edge Functions → Gemini API
```

## 추가 참고 자료

- [Supabase Edge Functions 문서](https://supabase.com/docs/guides/functions)
- [Deno 문서](https://deno.land/manual)
- [Google Gemini API 문서](https://ai.google.dev/docs)

## 비용 정보

- **Supabase Edge Functions**: 무료 플랜에서 월 50만 요청 제공
- **Google Gemini API**: gemini-2.5-flash-lite 모델은 하루 1,000회 무료

## 보안 고려사항

✅ API 키는 서버 사이드에만 저장되며 클라이언트에 노출되지 않습니다.
✅ Supabase Secrets를 통해 환경 변수를 안전하게 관리합니다.
✅ CORS 정책을 통해 허용된 도메인에서만 접근 가능합니다.

---

**마지막 업데이트**: 2026-01-22
**작성자**: Claude (Cursor IDE)
