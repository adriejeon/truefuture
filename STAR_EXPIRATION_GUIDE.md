# 별 유효기간 시스템 가이드

## 개요

2026년 2월 14일부터 구매한 별은 **결제일로부터 1년**간 유효합니다.
이 문서는 별 유효기간 시스템의 구현 내역과 관리 방법을 설명합니다.

## 주요 변경사항

### 1. 데이터베이스 변경

#### star_transactions 테이블 필드 추가
- `paid_amount`: 충전된 유료 별 개수
- `bonus_amount`: 충전된 보너스 별 개수
- `expires_at`: 유효기간 만료일 (결제일 + 1년)
- `is_expired`: 만료 여부 플래그

### 2. 이용약관 업데이트

**버전 1.1** (2026-02-14부터 시행)
- 제8조: 별의 유효기간을 5년에서 **1년**으로 변경
- 2026-02-14 이전 구매 건은 기존 정책(5년) 적용
- 2026-02-14 이후 구매 건부터 신규 정책(1년) 적용

### 3. 구현된 기능

#### 별 구매 시
- `purchase-stars` 함수에서 자동으로 `expires_at` 설정 (구매일 + 1년)
- `paid_amount`, `bonus_amount` 자동 기록

#### 별 조회 시
- `get_valid_stars()` RPC 함수로 유효한 별만 조회
- 프론트엔드에서 만료되지 않은 별만 표시

#### 구매 내역 페이지
- 각 구매 건의 유효기간 표시
- 만료 상태 시각적 표시 (유효/곧 만료/만료됨)
- 유료/보너스 별 구분 표시

## 관리 작업

### 만료 별 체크 배치 작업

정기적으로 만료된 별을 체크하여 `is_expired` 플래그를 업데이트해야 합니다.

#### Supabase Cron Job 설정 방법

1. Supabase Dashboard → Database → Cron Jobs 이동
2. 새 Cron Job 생성:

```sql
-- 매일 자정에 만료된 별 체크
SELECT cron.schedule(
  'check-expired-stars-daily',
  '0 0 * * *',  -- 매일 00:00 UTC
  'SELECT check_expired_stars();'
);
```

또는 더 자주 실행:

```sql
-- 6시간마다 체크
SELECT cron.schedule(
  'check-expired-stars-6h',
  '0 */6 * * *',  -- 6시간마다
  'SELECT check_expired_stars();'
);
```

#### 수동 실행

필요 시 SQL 에디터에서 직접 실행 가능:

```sql
SELECT check_expired_stars();
```

### 만료된 별 조회

관리자가 만료된 별 내역을 확인하려면:

```sql
-- 만료된 구매 건 조회
SELECT 
  user_id,
  description,
  amount,
  paid_amount,
  bonus_amount,
  created_at as purchased_at,
  expires_at,
  is_expired
FROM star_transactions
WHERE type = 'CHARGE'
  AND expires_at IS NOT NULL
  AND (expires_at < NOW() OR is_expired = true)
ORDER BY expires_at DESC;
```

### 사용자별 만료 예정 별 조회

30일 이내 만료 예정인 별 조회:

```sql
SELECT 
  user_id,
  SUM(amount) as expiring_stars,
  expires_at
FROM star_transactions
WHERE type = 'CHARGE'
  AND is_expired = false
  AND expires_at IS NOT NULL
  AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
GROUP BY user_id, expires_at
ORDER BY expires_at;
```

## 마이그레이션 적용

개발/스테이징 환경:
```bash
cd supabase
npx supabase db reset  # 전체 DB 리셋 (개발 환경만!)
```

프로덕션 환경:
```bash
cd supabase
npx supabase db push  # 새 마이그레이션만 적용
```

또는 Supabase Dashboard에서:
1. Database → Migrations 이동
2. 새 마이그레이션 파일 확인:
   - `20260210_add_star_expiration.sql`
   - `20260210_update_terms_star_expiration.sql`
3. "Run migration" 클릭

## 기존 데이터 처리

마이그레이션은 자동으로 기존 데이터를 처리합니다:

1. **2026-02-14 이전 구매**: `expires_at = NULL` (무제한)
2. **2026-02-14 이후 구매**: `expires_at = created_at + 1년`
3. `paid_amount`, `bonus_amount`는 `description`에서 패키지 정보 파싱하여 설정

## 사용자 알림 (향후 구현 권장)

만료 예정 사용자에게 알림을 보내는 기능 추가를 권장합니다:

### 이메일 알림
- 만료 7일 전: 알림 발송
- 만료 1일 전: 최종 알림 발송

### 앱 내 알림
- 로그인 시 만료 예정 별이 있으면 배너 표시
- 구매 페이지에 만료 예정 정보 표시

## 문제 해결

### get_valid_stars RPC 오류 시

프론트엔드가 자동으로 user_wallets 조회로 폴백합니다.
하지만 RPC 함수가 정상 작동하지 않으면 마이그레이션을 확인하세요:

```sql
-- RPC 함수 존재 확인
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'get_valid_stars';

-- 존재하지 않으면 마이그레이션 재실행
```

### 별 잔액 불일치 시

user_wallets와 star_transactions 간 불일치가 발생하면:

```sql
-- 사용자별 실제 잔액 재계산
SELECT 
  user_id,
  (SELECT COALESCE(SUM(amount), 0) 
   FROM star_transactions t1 
   WHERE t1.user_id = w.user_id AND type = 'CHARGE'
     AND (expires_at IS NULL OR expires_at > NOW())
  ) as should_be_paid,
  (SELECT COALESCE(SUM(ABS(amount)), 0)
   FROM star_transactions t2
   WHERE t2.user_id = w.user_id AND type = 'CONSUME'
  ) as total_consumed,
  w.paid_stars as current_paid,
  w.bonus_stars as current_bonus
FROM user_wallets w;
```

## 참고 파일

- 마이그레이션: `supabase/migrations/20260210_*.sql`
- 구매 함수: `supabase/functions/purchase-stars/index.ts`
- 프론트엔드 유틸: `frontend/src/utils/starConsumption.js`
- 구매 페이지: `frontend/src/pages/Purchase.jsx`
- 구매 내역: `frontend/src/pages/PurchaseHistory.jsx`
- 이용약관: `supabase/migrations/20260209_create_terms_tables.sql`
