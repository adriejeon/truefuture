# 진짜미래(True Future) 서비스 전반 분석

이 문서는 진짜미래 서비스의 **개발 파이프라인**, **운세 종류·프롬프트 구성**, **포트원/KG 이니시스 결제 연동**, **운세 요청 → Gemini 호출 → 서빙 플로우**, **점성학 차트 계산**을 정리한 분석 문서입니다.

---

## 1. 개발 파이프라인

### 1.1 전체 구조

| 구분 | 기술 스택 | 비고 |
|------|-----------|------|
| **프론트엔드** | React + Vite | `frontend/` |
| **백엔드(API)** | Supabase Edge Functions | `supabase/functions/` |
| **백엔드(레거시)** | Cloudflare Workers | `src/index.js`, `wrangler.toml` |
| **DB·인증** | Supabase | 마이그레이션 `supabase/migrations/` |
| **프론트 배포** | GitHub Actions → GitHub Pages | `.github/workflows/deploy.yml` |
| **엣지 함수 배포** | Supabase CLI | `supabase functions deploy` |
| **Docker** | 없음 | - |

### 1.2 CI/CD (GitHub Actions)

- **파일**: `.github/workflows/deploy.yml`
- **트리거**: `main` 브랜치 push 또는 `workflow_dispatch`(수동 실행)
- **동작**:
  1. Node 18 설정, `frontend/package-lock.json` 캐시
  2. `frontend`에서 `npm ci` → `npm run build`
  3. 빌드 시 시크릿 사용: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  4. `frontend/dist`를 **GitHub Pages 아티팩트**로 업로드 후 `deploy-pages`로 배포

즉, **프론트엔드만** GitHub Actions로 자동 배포되고, 백엔드(Edge Functions)는 별도로 `supabase functions deploy`로 배포합니다.

### 1.3 빌드·스크립트

**루트 `package.json`**

- `dev` → `wrangler dev` (Cloudflare Workers 로컬)
- `deploy` → `wrangler deploy`
- `build` / `build:frontend` → `cd frontend && npm run build`

**`frontend/package.json`**

- `dev` → `vite` (로컬 개발 서버)
- `build` → `vite build && node scripts/generate-sitemap.js` (빌드 + 사이트맵 생성)
- `preview` → `vite preview`
- `pw:auth` / `pw:test` → Playwright 인증·테스트

### 1.4 백엔드 설정

- **Cloudflare Workers**: `wrangler.toml` — 진입점 `src/index.js`, 로컬은 `.dev.vars`, 프로덕션은 `wrangler secret put`
- **Supabase Edge Functions**: `supabase/config.toml` — 함수별 설정
- **배포 제외**: `.cloudflareignore` — Supabase/`wrangler.toml`/`src/` 등 제외로 Pages와 충돌 방지

---

## 2. 운세 종류와 프롬프트 구성

### 2.1 운세 타입 (5종)

| 타입 | Enum | 한글명 | 필요 운세권 | 정의 위치 |
|------|------|--------|-------------|-----------|
| **daily** | `FortuneType.DAILY` | 오늘 운세 | 1 | `get-fortune/types.ts`, DB `fortune_history.fortune_type` CHECK |
| **yearly** | `FortuneType.YEARLY` | 1년 운세 | 1 | 동일 |
| **lifetime** | `FortuneType.LIFETIME` | 종합 운세 | 1 | 동일 |
| **compatibility** | `FortuneType.COMPATIBILITY` | 진짜궁합 | 1 | 동일 |
| **consultation** | `FortuneType.CONSULTATION` | 자유 질문 | 1 | 동일 |

- **타입 정의**: `supabase/functions/get-fortune/types.ts`  
- **한글명·비용**: `frontend/src/utils/starConsumption.js` — `FORTUNE_TYPE_NAMES`, `FORTUNE_STAR_COSTS`  
- **DB**: `supabase/migrations/` — `fortune_type` CHECK에 `('daily','lifetime','yearly','compatibility','consultation')` 포함

점성술 방식은 **서양/고전 점성술** 한 가지이며, 사주/타로는 FAQ·SEO 문구에서만 언급됩니다.

### 2.2 프롬프트 구성 개요

- **System instruction**: 운세 타입별로 `geminiPrompts.ts`에서 함수로 제공 → `getSystemInstruction(fortuneType, ...)`에서 선택
- **User prompt**: 차트·분석 데이터를 텍스트로 만드는 것은 `chartFormatter.ts`의 `generate*UserPrompt` / `generatePredictionPrompt` → `get-fortune/index.ts`의 `buildUserPrompt()`에서 타입별로 조합

### 2.3 System Prompt (geminiPrompts.ts)

| 운세 타입 | 함수 | 비고 |
|-----------|------|------|
| **daily** | `getDailyPrompt()` | 오늘의 달·행성 각도 기반, 가볍지만 구체적인 조언 |
| **lifetime** | `getLifetimePrompt()` / Part1~3 | Nature, Love, MoneyCareer, HealthTotal 4파트 |
| | `getLifetimePrompt_Nature()`, `_Love()`, `_MoneyCareer()`, `_HealthTotal()` | 파트별 상세 |
| **yearly** | `getYearlyPrompt()` | 1년 운세 |
| | `getSolarReturnPrompt()` | 솔라 리턴 보조 |
| **compatibility** | `getCompatibilityPrompt(natalData1, natalData2, synastryResult, relationshipType)` | 궁합 전용 |
| **consultation** | `getConsultationSystemPrompt(category)` | 자유 질문 첫 질문 |
| | `getConsultationFollowUpSystemPrompt(category)` | 후속 질문 |

공통 규칙은 `COMMON_RULES`(금기 사항, 시간 환산, 표현 다양성, MZ 점성술사 페르소나 등)와 `CLASSICAL_PERSONA_AND_DIGNITY`(에센셜 디그니티·섹트·헤이즈 해석)로 정의되어 각 프롬프트에 포함됩니다.

### 2.4 User Prompt (chartFormatter.ts + index.ts)

| 운세 타입 | 생성 함수 | 내용 |
|-----------|-----------|------|
| **daily** | `generateDailyUserPrompt(...)` | natal, profection, 오전/오후 플로우(연주 각도, 4대 감응점 타격), Neo4j 리셉션/리젝션, 연주 역행·고정별 등 |
| **yearly** | `generateYearlyUserPrompt(natal, solarReturn, profection, overlay)` | natal + 솔라 리턴 + 프로펙션 + overlay(솔라 리턴 행성이 natal 하우스에 오는 위치) |
| **lifetime** | `generateLifetimeUserPrompt(natalData)` | 출생 차트만으로 종합운 분석용 텍스트 |
| **compatibility** | `generateCompatibilityUserPrompt(chart1, chart2)` | 두 사람의 natal 차트 요약 (synastry 결과는 system 쪽에서 전달) |
| **consultation** | `generatePredictionPrompt(...)` | 내담자 정보·차트·연주·프로펙션·질문 등 예측용 데이터 |

`buildUserPrompt()`는 `get-fortune/index.ts`에 있으며, `fortuneType`과 계산된 데이터(transit, solarReturn, profection, dailyFlowAM/PM, angleStrikes 등)에 따라 위 함수들을 호출해 최종 user prompt 문자열을 만듭니다. 데일리/연간은 `formatShortTermEventsForPrompt`, `formatSolarReturnBlockForPrompt`, `formatLordOfYearTransitSectionForPrompt`, `formatLordStarConjunctionsForPrompt` 등으로 섹션을 추가합니다.

---

## 3. 포트원(PortOne) + KG 이니시스 결제 연동

### 3.1 역할 분리

- **PG사(KG 이니시스)**: 코드에는 PG ID나 이니시스 전용 파라미터가 없음. **PortOne 콘솔에서 채널로 KG 이니시스를 연결**한 구조로, 실제 카드 결제는 PortOne이 이니시스로 전달합니다.
- **프론트**: PortOne 브라우저 SDK로 결제창 호출 후, 결제 완료 시 **Supabase Edge Function `purchase-stars`** 한 번만 호출합니다.
- **백엔드**: `purchase-stars`에서 PortOne V2 API로 결제 조회·검증 후 DB에 별(운세권) 충전합니다.

### 3.2 프론트엔드 (결제 요청)

- **패키지**: `@portone/browser-sdk` (v2 사용: `import * as PortOne from "@portone/browser-sdk/v2"`)
- **파일**: `frontend/src/pages/Purchase.jsx`
- **환경 변수**: `VITE_PORTONE_STORE_ID`, `VITE_PORTONE_CHANNEL_KEY` (실제 값은 `.env` 등에 설정)
- **흐름**:
  1. `PortOne.requestPayment({ storeId, channelKey, paymentId: merchant_uid, orderName, totalAmount, currency: "CURRENCY_KRW", payMethod: "CARD", customer, redirectUrl })` 호출
  2. 결제 성공 시 `supabase.functions.invoke("purchase-stars", { body: { user_id, amount, merchant_uid, imp_uid: response?.paymentId || merchantUid } })` 호출

모바일에서는 `redirectUrl`로 돌아올 때 결제 완료 페이지(`PaymentComplete.jsx`)에서 `paymentId`/`imp_uid`/`txId`/`merchant_uid`를 쿼리에서 파싱한 뒤 같은 `purchase-stars`를 호출합니다. 문서(`MOBILE_PAYMENT_TROUBLESHOOTING.md`)에는 “모바일 결제 시 PG사(이니시스) 승인 완료” 후 PortOne V1/KG이니시스 리다이렉트 파라미터 처리 안내가 있습니다.

### 3.3 백엔드 (결제 검증·별 충전)

- **파일**: `supabase/functions/purchase-stars/index.ts`
- **환경 변수**: `PORTONE_API_SECRET` (V2 API 인증)
- **동작**:
  1. Body: `user_id` 필수, `imp_uid`, `merchant_uid`, (선택) `amount`
  2. `amount`가 없거나 유효하지 않으면 (모바일 리다이렉트 등) **PortOne V2 API**로 결제 조회:  
     `GET https://api.portone.io/payments/{paymentId}`, `Authorization: PortOne {PORTONE_API_SECRET}`
  3. `payment.status === "PAID"` 확인, `payment.amount?.total`로 금액 사용
  4. 중복 처리 방지 후 `user_wallets` 등에 망원경/나침반/탐사선(paid/bonus/probe) 충전, 필요 시 추천 이벤트 보상

패키지별 금액·이름·paid/bonus/probe 개수는 `PACKAGES` 상수로 정의되어 있습니다(예: 1000원 = 망원경 1개, 2990원 = 탐사선 종합운세 1회권 등).

### 3.4 관련 파일 요약

| 구분 | 파일 | 역할 |
|------|------|------|
| 결제 요청 | `frontend/src/pages/Purchase.jsx` | PortOne SDK `requestPayment`, 성공 시 `purchase-stars` 호출 |
| 결제 완료(리다이렉트) | `frontend/src/pages/PaymentComplete.jsx` | URL에서 paymentId/imp_uid/txId/merchant_uid 파싱 후 `purchase-stars` 호출 |
| 백엔드 결제 처리 | `supabase/functions/purchase-stars/index.ts` | PortOne V2 검증, 별 충전, 추천 보상 |
| 유틸 | `frontend/src/utils/paymentUtils.js` | 결제 시 구매자 이메일 등 |
| 문서 | `MOBILE_PAYMENT_TROUBLESHOOTING.md` | PortOne API 키·모바일 결제 트러블슈팅 |

---

## 4. 운세 요청 → Gemini 호출 → 서빙 플로우

### 4.1 진입점

- **API**: `POST /functions/v1/get-fortune` (Supabase Edge Function)
- **인증**: `Authorization: Bearer {session.access_token}`
- **프론트 호출**: `frontend/src/utils/getFortuneStream.js` — `invokeGetFortuneStream(supabase, requestBody, { onChunk, onDone, onError })`  
  - 사용 페이지: `YearlyFortune.jsx`(데일리/1년/종합), `Compatibility.jsx`(궁합), `Consultation.jsx`(자유 질문)

### 4.2 get-fortune 엣지 함수 흐름 (index.ts)

1. **CORS**: `OPTIONS` → `corsHeaders` 반환
2. **GET + id**: 공유용으로 `fortune_results` 조회 후 JSON 반환
3. **POST**:
   - `Authorization`으로 `supabaseAuth.auth.getUser(token)` 인증
   - `requestData = await req.json()` — `fortuneType`, `birthDate`, `lat`, `lng`, `profileId`, 궁합 시 두 명 데이터, 자유 질문 시 `category`·`question`·`conversationHistory` 등
   - `fortuneType` 분기: **DAILY / YEARLY / LIFETIME / COMPATIBILITY / CONSULTATION**

### 4.3 타입별 처리 요약

- **CONSULTATION(자유 상담)**  
  - 차트·Neo4j·연주 등 계산 후 **이 분기 내부에서만** 직접 `callGeminiAPIStream()` 호출 (공통 `getInterpretation` 미사용).  
  - `createFortuneSSEStream()`로 SSE 응답 → `Response(sseStream)`.

- **DAILY / YEARLY / LIFETIME / COMPATIBILITY**  
  - natal, transit, solar return, profection, synastry 등 **점성학 계산** 수행 (아래 5절 참고)
  - **공통 AI 해석**: `getInterpretation(chartData, fortuneType, apiKey, ...)` 호출
    - **스트리밍 요청 시** (`streamOptions` 있음): `callGeminiAPIStream()` → `createFortuneSSEStream()` → `return { stream }` → 응답은 `Response(interpretation.stream, { headers: sseHeaders })`
    - **비스트리밍**: `callGeminiAPIWithFallback()` → `callGeminiAPI()` → `parseGeminiResponse()` → `return { success, interpretation }` → 이후 `fortune_results` 저장 후 JSON `{ share_id, interpretation, ... }` 반환
  - **LIFETIME**만 특별: `generateLifetimeFortune()` 안에서 **Gemini를 4회 병렬** 호출 (Nature / Love / MoneyCareer / HealthTotal). 스트리밍이면 4개 결과를 합쳐 한 번에 SSE로 전송.

### 4.4 Gemini API 호출

- **비스트리밍**: `callGeminiAPI(modelName, apiKey, requestBody)`  
  - URL: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...`
- **스트리밍**: `callGeminiAPIStream(...)`  
  - URL: `.../models/{model}:streamGenerateContent?alt=sse&key=...`
- **모델**:
  - 일반 운세(데일리/연간/종합/궁합): `gemini-3-flash-preview` (폴백 `gemini-2.5-flash`)
  - 자유 상담 첫 질문: `gemini-3.1-pro-preview`, 후속: `gemini-3-flash-preview`
- **503/과부하**: `is503OrOverloaded()`로 감지 시 `callGeminiAPIWithFallback()`에서 폴백 모델로 재시도

### 4.5 스트리밍·저장

- **createFortuneSSEStream**: Gemini 스트림을 SSE `ReadableStream`으로 변환, 청크마다 `data: {"text":"..."}` 형태로 전송. 스트림 종료 시 `fortune_results` insert 후 `data: [DONE]` 및 `share_id` 등 전송.
- **프론트**: `getFortuneStream.js`에서 `response.body.getReader()`로 읽고, `onChunk(text)` / `onDone(payload)` 호출. `FortuneProcess.jsx`의 `FortuneResultStreaming` 및 각 페이지의 `streamingInterpretation` 상태로 타이핑처럼 표시.

### 4.6 캐시·복구

- **서버**: 생성된 운세는 `fortune_results`에만 저장. 별도 운세 캐시 테이블은 사용하지 않음.
- **클라이언트**:
  - `fortuneService.js` — `restoreFortuneIfExists(profileId, fortuneType)`: `fortune_history` + `fortune_results`에서 오늘/최신 1건 조회해 이미 있으면 복구
  - `YearlyFortune.jsx` — 데일리: `getTodayFortuneFromStorage` / `saveTodayFortuneToStorage` (localStorage 키 `daily_fortune_${profileId}`)
- **제한**: `useProfiles.js`의 `checkFortuneAvailability(profileId, fortuneType)` — daily는 오늘 1회, lifetime은 1회, yearly는 생일 기준 1년 1회 등

---

## 5. 점성학 차트 계산 상세

모든 천체 위치·각도 계산은 **astronomy-engine** (npm `astronomy-engine@2.1.19`)을 사용하며, 하우스 시스템은 **Whole Sign** 한 가지만 사용합니다. Swiss Ephemeris는 사용하지 않습니다.

### 5.1 Birth / Natal Chart

| 파일 | 역할 |
|------|------|
| `src/utils/astroCalculator.js` | 레거시: 7행성(Sun~Saturn) + 상승점, Part of Fortune, Whole Sign 하우스 |
| `supabase/functions/get-fortune/utils/astrologyCalculator.ts` | **Natal Chart** 메인: 10행성(Sun~Pluto) + 상승점, MC, Part of Fortune(낮/밤 공식), Whole Sign 하우스, 역행·속도. `calculateChart()`가 진입점 |

### 5.2 행성·별자리·하우스

- **astrologyCalculator.ts**
  - `getPlanetLongitude()` (GeoVector → Ecliptic), `getSignFromLongitude()` (황경 → 별자리·도수)
  - `getWholeSignHouse()` (황경 + 상승점 → 1–12 하우스)
  - `calculateAscendant()` (GMST/LST 기반), `calculateFortuna(..., isDayChart)` (낮/밤 포르투나)
  - `getPlanetRetrogradeAndSpeed()`, `getPlanetLongitudeAndSpeed()`
- **neo4jContext.ts**: 차트 기반 위계(Dignity)·섹트(Sect)·헤이즈(Hayz) 컨텍스트, 질문 카테고리별 룰러 선별
- **dignityCalculator.ts**: 에센셜 디그니티(Rules/Exaltation/Detriment/Fall), `isDayChartFromSunHouse()`, `checkHayz()`, `buildPlanetContext()`

### 5.3 Aspect (각도)

- **astrologyCalculator.ts**
  - `calculateAngleDifference()`, **Natal–Transit Aspect** `calculateAspects(natalChart, transitChart)`, **Transit–Transit** `calculateTransitToTransitAspects()`, **연주–Transit** `calculateLordOfYearTransitAspects()`
  - ASPECT_TYPES: Conjunction(6°), Opposition(6°), Square(6°), Trine(4°), Sextile(4°). 데일리용 orb: 접근 4°, 분리 2°, 감응점 타격 2°
- **predictiveScanner.ts**: 연주 행성과 앵글(1,4,7,10) 유효각, 외행성 역행/순행 전환 시 네이탈과의 각도 설명
- **synastryCalculator.ts**: 궁합 **메이저 애스펙트** `calculateMajorAspect(lon1, lon2, 5)` — Conjunction/Sextile/Square/Trine/Opposition, Orb 5°
- **chartFormatter.ts**: 3외행성(Uranus/Neptune/Pluto)과 네이탈·연주 행성 간 Opposition 등 프롬프트용 포맷

### 5.4 Solar Return · Profection · Transit

- **astrologyCalculator.ts**
  - **Solar Return 시각**: `calculateSolarReturnDateTime()` (SearchSunLongitude로 태양 복귀 시점), **활성 연도** `getActiveSolarReturnYear()`
  - **Annual Profection**: `calculateProfection()` (나이 → 프로펙션 하우스/사인/Lord of the Year), `calculateProfectionTimeline()`
  - **Solar Return Overlay**: `getSolarReturnOverlays()` — SR 행성들이 Natal 차트의 몇 하우스에 오는지
- **index.ts**: Natal, Transit(현재 시점/데일리 06:00·18:00 KST), Solar Return, Overlay를 타입별로 조합해 사용

### 5.5 Primary Direction · Progression · Firdaria

- **astrologyCalculator.ts**
  - **Primary Directions** (Placidus/Naibod): `toRightAscension`, `toDeclination`, `toObliqueAscension` 등으로 사경(OA) 계산
  - **Secondary Progression**: `calculateSecondaryProgression()` (1일=1년), Progressed Moon vs Natal/Progressed 행성 각도, `calculateProgressedEventsTimeline()`
  - **Firdaria**: `calculateFirdaria()` — Day/Night 차트별 주기, Major/Sub Lord
  - 연주가 프로펙션 앵글(1,4,7,10) 진입: `getLordOfYearProfectionAngleEntry()`, 연주 트랜짓 상태: `getLordOfYearTransitStatus()`

### 5.6 궁합(Synastry) · 고정별(Fixed Star)

- **synastryCalculator.ts**
  - 두 차트 비교, `getHouseInPartnerChart()` (행성 별자리 → 상대 차트 Whole Sign 하우스), `getHouseInPartnerChartByPOF()`, 룰러·감응점·Venus–Mars/토성 흉각·Detriment/Fall 갈등 등
- **advancedAstrology.ts**
  - **고정별** 황경 데이터(Aldebaran, Regulus, Antares, Fomalhaut, Spica 등), 행성–항성 회합(세차 보정), `getFixedStarConjunctionWithPlanet()`, `getFixedStarConjunctionWithTimeLord()` 등

### 5.7 데일리 전용 (고전 점성술)

- **calculateLordAspectsWithPhase**: 연주 행성의 트랜짓 각도, 접근(Applying)/분리(Separating)
- **calculateDailyAngleStrikes**: 4대 감응점(Sun, Moon, Asc, PoF)을 트랜짓이 타격한 경우
- **getDailyReceptionRejectionMeta** (neo4jContext): 리셉션/리젝션 메타 태그
- **predictiveScanner**: `formatShortTermEventsForPrompt` — 단기 이벤트 요약

### 5.8 기타

- **get_reading.py**: Neo4j에서 행성·별자리·하우스 조합으로 위계/섹트/헤이즈 컨텍스트 조회 (점성술 분석 문단 생성)
- **init_data.py**: Planets, Signs, Houses Neo4j 초기 데이터
- **types.ts**: `ChartData`, `PlanetPosition`, `Aspect`, `ProfectionData`, `SolarReturnOverlay`, `FirdariaResult`, `ProgressionResult`, 데일리용 `DailyAspectWithPhase`, `DailyAngleStrike`, `DailyFlowSummary` 등 타입 정의

---

## 6. 요약 다이어그램

```
[사용자] 운세 요청 (데일리/1년/종합/궁합/자유상담)
  → [프론트] YearlyFortune / Compatibility / Consultation
  → invokeGetFortuneStream() (getFortuneStream.js)
  → POST /functions/v1/get-fortune (Bearer token)

[get-fortune Edge Function]
  → serve() → req.json() → fortuneType 분기
  → CONSULTATION: 차트/Neo4j 등 계산 → callGeminiAPIStream() → createFortuneSSEStream() → Response(sseStream)
  → 그 외: 차트/트랜짓/솔라리턴/프로펙션/궁합 등 계산 (astrologyCalculator, synastry, predictiveScanner, advancedAstrology 등)
       → getInterpretation(..., streamOptions)
          → 스트리밍: callGeminiAPIStream() → createFortuneSSEStream() → return { stream } → Response(stream)
          → 비스트리밍: callGeminiAPIWithFallback() → parseGeminiResponse() → fortune_results 저장 → JSON
  → LIFETIME: generateLifetimeFortune() 내부에서 4회 병렬 Gemini 호출 후 필요 시 SSE로 한 번에 전송

[Gemini]
  → generateContent (비스트리밍) / streamGenerateContent?alt=sse (스트리밍)
  → 모델: gemini-3-flash-preview (폴백 gemini-2.5-flash), 자유상담 첫 질문 gemini-3.1-pro-preview

[응답]
  → 스트리밍: SSE → 스트림 종료 시 fortune_results insert → [DONE] + share_id
  → 비스트리밍: fortune_results 저장 후 JSON { share_id, interpretation }
  → 프론트: onChunk / onDone으로 UI 갱신
```

이 문서는 위 구조를 기준으로 작성되었으며, 코드 변경 시 해당 섹션만 갱신하시면 됩니다.
