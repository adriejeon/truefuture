# LLM 비교 테스트 (GPT vs Gemini)

같은 차트·질문·상담 지침·목표 분량으로 공급자별 결과를 만들고, 자동 지표와 블라인드 평가표를 뽑는다.

## 0. 준비 (1회)

1. **DB 마이그레이션**: `supabase/migrations/20261013_llm_generation_logs.sql` 적용
   (`supabase db push` 또는 대시보드 SQL Editor 에 붙여넣기)
2. **함수 배포**: `supabase functions deploy get-fortune premium-report`
3. **시크릿**: `OPENAI_API_KEY` (등록 완료). 운영 기본값은 `LLM_DEFAULT_PROVIDER` 미설정 = gemini
4. **테스트 계정**: `admin_users` 에 테스트 계정이 있어야 `llmProvider` 가 적용된다 (없으면 조용히 운영 기본값)

## 1. 변형(variant)

| llmProvider | 가벼운 호출 (데일리·궁합·후속 상담) | 심층 호출 (종합운·첫 상담·리포트 본문) |
|---|---|---|
| `openai` | gpt-6-luna, effort low → 실패 시 gemini-3.8-flash | gpt-6.1-sol, effort medium → 실패 시 gemini-3.1-pro-preview |
| `gemini` | 현재 운영 (gemini-3.5-flash) | 현재 운영 (gemini-3.1-pro-preview) |
| `gemini-3.8` | gemini-3.8-flash | gemini-3.1-pro-preview |

테스트 모드에서는 세 변형 모두 같은 `[데이터 근거 원칙]` 문구를 시스템 지침 끝에 붙인다 (운영 Gemini 프롬프트는 그대로).

## 2. 스크립트로 일괄 비교 (권장)

```bash
cp scripts/llm-compare/cases.example.json scripts/llm-compare/cases.json   # 케이스 편집 (git 제외 파일)
export TF_TEST_EMAIL=... TF_TEST_PASSWORD=...                               # admin_users 계정
deno run --allow-net --allow-env --allow-read --allow-write \
  scripts/llm-compare/compare.ts --variants openai,gemini
```

- 처음에는 `--only consult-career` 처럼 케이스 1~2개로 시작하고 늘려 간다.
- 리포트 케이스는 `profileId` 를 테스트 계정 **본인 프로필 ID** 로 바꿔야 한다. 섹션당 수 분이 걸린다.
- 3.5-flash 와 3.8-flash 도 함께 보려면 `--variants openai,gemini,gemini-3.8`.
- 결제 차감 없음 (`cost: 0`), `profileId` 미전송이라 데일리 1회 제한·히스토리에 영향 없음.
  단, `fortune_results` 에는 테스트 계정 소유로 결과 행이 저장된다.

결과: `scripts/llm-compare/out/<시각>/`

| 파일 | 내용 |
|---|---|
| `report.md` | 요약표(실제 생성 모델·폴백 여부·시간·토큰·비용·자동 지표) + 블라인드 원고 A/B |
| `rubric.csv` | 사람이 채우는 1–5점 평가표 (자연스러움·상담 문체·반복·구체성·차트 일치·근거 없는 단정) |
| `key.json` | 블라인드 라벨 ↔ 모델 대응 (평가 후에 열기) |
| `results.json` | 원본 응답 전체 |

자동 지표는 보조용이다 — 중복 문장 비율, 반복 3-gram 비율, 단정 표현 수, 사건 단정 후보 문장, 질문 키워드 반영률,
출생 차트와 다른 "행성-사인" 언급(트랜짓 언급은 오탐 가능), 존댓말 비율, 리포트 형식 검증 결과.

**⚠️ 폴백 표시**: 요청한 공급자가 실패해 다른 모델이 만든 원고는 요약표·블라인드 모두 `⚠️ 폴백` 으로 표시된다.
GPT 품질 비교에서는 제외할 것.

## 3. 실제 화면에서 확인

관리자 계정으로 로그인한 브라우저 콘솔에서:

```js
localStorage.setItem("tf_llm_provider", "openai")   // 또는 "gemini", "gemini-3.8"
localStorage.removeItem("tf_llm_provider")          // 해제
```

이후 웹에서 생성하는 운세·상담·리포트 요청에 적용된다. 스트림 `done` 이벤트(개발자 도구 Network → EventStream)에
`llm` 필드로 실제 생성 모델·폴백 사유·토큰·비용이 실린다 (관리자에게만). 실제 결제 흐름을 그대로 타므로 재화가 차감된다.

## 4. 기록 조회 (SQL Editor)

```sql
-- 기능·변형별 요약 (테스트)
select feature, variant, final_provider, final_model, fell_back, fallback_reason,
       count(*) n, round(avg(latency_ms)) avg_ms, round(avg(ttft_ms)) avg_ttft_ms,
       sum(total_cost_usd) cost_usd
from llm_generation_logs
where is_test and created_at > now() - interval '7 days'
group by 1,2,3,4,5,6 order by 1,2;

-- 시도별 토큰 (최초 오류 호출 + 폴백 포함)
select created_at, feature, part, variant, outcome, a->>'provider' provider, a->>'model' model,
       a->>'outcome' attempt_outcome, a->>'errorKind' error_kind,
       (a->'usage'->>'inputTokens')::int input, (a->'usage'->>'cachedInputTokens')::int cached,
       (a->'usage'->>'outputTokens')::int output, (a->'usage'->>'reasoningTokens')::int reasoning,
       (a->>'costUsd')::numeric cost_usd, a->>'priceSource' price_source
from llm_generation_logs, jsonb_array_elements(attempts) a
order by created_at desc limit 100;
```

## 5. 운영 전환

테스트 결과를 보고 결정한 뒤 `LLM_DEFAULT_PROVIDER=openai` 시크릿만 설정하면 전체 사용자가 GPT(+Gemini 폴백)로 바뀐다.
되돌릴 때는 시크릿을 지우면 된다. 코드 배포는 필요 없다.

## 폴백 규칙 요약

- 폴백 조건: 타임아웃 · API 오류(429/5xx 는 1회 재시도 후) · 빈 응답 · 본문 없이 출력 한도 소진 · 필수 형식 검증 실패
- 안전상 거절(refusal / content_filter / Gemini SAFETY)은 폴백하지 않고 기존 차단 흐름으로 반환
- 폴백은 최대 1회, 폴백 Gemini 는 다른 모델로 다시 바뀌지 않는다
- 스트리밍: 본문을 한 글자라도 보낸 뒤에는 폴백하지 않는다 (섞임 방지) — 그 뒤 오류는 기존 오류·환불 흐름.
  본문을 보낸 뒤 출력 한도에 걸리면 기존 Gemini 와 같이 잘린 채 저장하고 `truncated_saved` 로 기록
- 리포트: OpenAI 타임아웃 140초. 30초 안에 실패하면 같은 요청에서 Gemini Pro 로, 그 이후면 다음 generate 요청에서 Gemini Pro 로 생성
- 리포트는 첫 생성 때 정한 변형이 끝까지 유지된다 (단, 운영 기본값 Gemini 로 시작한 리포트는 고정 기록이 없으므로, 생성 도중 `LLM_DEFAULT_PROVIDER` 를 바꾸면 남은 섹션부터 바뀐다)
