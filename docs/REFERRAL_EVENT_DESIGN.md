# 친구 추천 이벤트 – 최종 설계 및 구현 가이드

## 기획 요약

- **추천인(A)** 의 초대 링크로 **피추천인(B)** 가입 → A–B 매핑만 생성, 이 시점에는 보상 없음.
- **B가 생애 최초 결제**(망원경/나침반 쿠폰 구매)를 성공한 순간, **A에게 망원경(paid) 1개** 즉시 지급.
- B가 2회차 이후 결제해도 A에게는 추가 지급 없음 (B 1명당 1회만).
- A는 C, D 등 **무제한** 초대 가능, 각 피추천인의 **첫 결제 시마다** A에게 망원경 1개씩 지급.
- **탈퇴 후 재가입 유저**는 추천 관계 자체에 넣지 않음 (매핑 INSERT 시점에 `deleted_users_hash` 검증).

---

## 1. DB 스키마 (referrals 포함)

### 1.1 `referral_codes`

| 컬럼       | 타입         | 설명                          |
|------------|--------------|-------------------------------|
| id         | UUID PK      | 기본 키                       |
| user_id    | UUID UNIQUE  | FK → auth.users, 유저당 1개   |
| code       | TEXT UNIQUE  | 공유용 초대 코드 (8~12자 등)  |
| created_at | TIMESTAMPTZ  | 생성 시각                     |

### 1.2 `referrals`

| 컬럼              | 타입         | 설명 |
|-------------------|--------------|------|
| id                | UUID PK      | 기본 키 |
| referrer_id       | UUID NOT NULL| FK → auth.users, 추천인 |
| referee_id        | UUID NOT NULL UNIQUE | FK → auth.users, 피추천인 (1인 1회만) |
| referral_code     | TEXT         | 가입 시 사용한 초대 코드 (감사/디버깅용) |
| created_at        | TIMESTAMPTZ  | 매핑 생성 시각 |
| **reward_granted_at** | TIMESTAMPTZ **NULL** | **NULL = 미지급, 값 있음 = 추천인에게 망원경 1개 지급 완료 시각** |

- `reward_granted_at` 하나로 “이 피추천인에 대해 이미 보상 지급했는지” 판단.
- `referee_id` UNIQUE로 한 유저는 한 번만 피추천인으로 등록되며, 보상도 1회만 지급.

---

## 2. 결제 완료 플로우에서의 삽입 위치 (코드 흐름)

결제 성공 후 DB를 갱�하는 것은 **Supabase Edge Function `purchase-stars`** 한 곳입니다.  
(웹훅/리다이렉트 등은 최종적으로 이 함수를 호출하기 위한 수단입니다.)

### 2.1 기존 `purchase-stars` 흐름

```
1. body에서 imp_uid, merchant_uid, amount, user_id 파싱
2. (amount 없으면) PortOne V2 API로 결제 조회 → amount 확보
3. supabaseAdmin 생성 (Service Role)
4. 중복 결제 방지: star_transactions에 related_item_id가 이미 있으면 400 반환
5. 패키지 검증: PACKAGES[amount] 존재 여부
6. user_wallets 조회 (현재 잔액)
7. user_wallets upsert (paid/bonus/probe 증가)
8. star_transactions INSERT (CHARGE, 운세권 구매 설명, 90일 만료)
9. 성공 응답 반환
```

### 2.2 추가한 단계 (보상 지급)

**8번 `star_transactions` INSERT가 성공한 직후, 9번 응답 반환 전에** 다음을 수행합니다.

- **6단계(신규)**: RPC `grant_referral_reward_if_first_purchase(p_referee_id := user_id)` 호출.
  - `user_id` = 이번 결제한 유저 = 피추천인 후보.
  - RPC 내부에서:
    1. 해당 유저의 `운세권 구매` CHARGE 건수가 **정확히 1건**인지 확인 (방금 넣은 것만 있으면 “첫 결제”).
    2. `referrals`에서 `referee_id = user_id` 이고 `reward_granted_at IS NULL` 인 행을 **FOR UPDATE**로 1건 조회.
    3. 없으면 이미 보상 지급됐거나 추천 관계 없음 → 종료.
    4. 있으면 해당 행의 `reward_granted_at = NOW()` 로 업데이트한 뒤, `referrer_id`에게 `refund_stars(..., 1, '친구 추천 이벤트 보상 (피추천인 첫 결제)', 'PAID')` 호출.

이렇게 하면:

- **가입 시점**이 아니라 **결제 완료 시점**에서만 보상이 지급되고,
- “첫 결제”는 `star_transactions`에 방금 INSERT한 뒤 건수로 판단하므로, 한 번의 요청 안에서 일관되게 처리됩니다.

### 2.3 코드 상 위치 (요약)

| 파일 | 위치 | 내용 |
|------|------|------|
| `supabase/functions/purchase-stars/index.ts` | `star_transactions` INSERT 성공 직후 | `supabaseAdmin.rpc("grant_referral_reward_if_first_purchase", { p_referee_id: user_id })` 호출. 실패해도 결제 성공 응답은 유지 (로그만 남기고 진행). |

---

## 3. 어뷰징 방지: `deleted_users_hash` 검증 시점

- **검증 시점**: **B가 최초 가입하여 A와 매핑되는 단계**, 즉 `referrals` 테이블에 INSERT하는 **추천 등록 시점**에서만 수행합니다.
- **구현 위치**: DB RPC `register_referral(p_referee_id, p_referral_code)` 내부.
  - `compute_identity_hash(p_referee_id)`로 해시 계산.
  - `deleted_users_hash`에서 `identity_hash` 일치 및 `deleted_at >= NOW() - INTERVAL '1 year'` 조건으로 조회.
  - **존재하면** 탈퇴 후 재가입 유저로 간주 → `referrals`에 INSERT하지 않고, `success: false` 및 “재가입 유저는 추천 대상에서 제외됩니다.” 메시지 반환.
- **결제 시점**에서는 `deleted_users_hash`를 다시 보지 않습니다. 이미 “추천 관계로 묶이지 않은” 유저는 `referrals`에 없으므로, 결제해도 추천 보상이 발생하지 않습니다.

---

## 4. 필요한 Supabase SQL 및 백엔드 수정 요약

### 4.1 SQL (마이그레이션)

- **파일**: `supabase/migrations/20260313_referral_tables_and_rpcs.sql`
- **내용**:
  - `referral_codes` 테이블 생성 (user_id UNIQUE, code UNIQUE).
  - `referrals` 테이블 생성 (referrer_id, referee_id UNIQUE, referral_code, created_at, **reward_granted_at**).
  - RPC `register_referral(p_referee_id UUID, p_referral_code TEXT)`  
    - 코드로 추천인 조회, 자기 자신 체크, **탈퇴 재가입 여부 `deleted_users_hash`로 검증**, INSERT(ON CONFLICT DO NOTHING).
  - RPC `grant_referral_reward_if_first_purchase(p_referee_id UUID)`  
    - “운세권 구매” CHARGE 건수 = 1 확인, 미지급 `referrals` 1건 FOR UPDATE 후 `reward_granted_at` 갱신, `refund_stars(..., 'PAID')` 호출.

### 4.2 Edge Function 수정

- **파일**: `supabase/functions/purchase-stars/index.ts`
- **수정**: `star_transactions` INSERT 성공 직후, 성공 응답 반환 전에  
  `grant_referral_reward_if_first_purchase(user_id)` RPC 호출 추가.  
  보상 실패 시에도 결제 성공 응답은 그대로 반환하고, 로그만 출력.

### 4.3 추천 등록 호출 (프론트/백)

- **가입 직후(또는 Auth 콜백)** 에, 초대 코드가 있으면  
  `register_referral(referee_id = 현재 유저 id, p_referral_code = URL 등에서 넘긴 코드)` 를 호출하도록 구현.
- 호출 주체: Supabase Edge Function 하나를 두고, 프론트가 인증된 사용자로 해당 함수를 호출하거나,  
  RPC를 클라이언트에서 직접 호출할 수 있으면 `supabase.rpc('register_referral', { p_referee_id: user.id, p_referral_code: code })` 로 처리 가능.  
  (RLS로 `register_referral`은 보통 서비스 역할로만 호출하도록 하고, 등록용 Edge Function에서 `supabaseAdmin.rpc('register_referral', ...)` 호출하는 방식 권장.)

---

## 5. 데이터 흐름 요약

1. **A**: 내 초대 코드 조회/생성 (`referral_codes`) → 링크 공유 (예: `/login?ref=CODE`).
2. **B**: 링크로 접속 후 가입 (OAuth/이메일).  
   가입 완료 후 `register_referral(B의 user_id, CODE)` 호출.  
   - B가 1년 이내 탈퇴 재가입이면 → INSERT 차단, A–B 매핑 없음.  
   - 아니면 → `referrals`에 (A, B, CODE) INSERT, `reward_granted_at` = NULL.
3. **B**: 첫 결제 진행 → `purchase-stars`에서 지갑·거래 내역 처리 후 `grant_referral_reward_if_first_purchase(B의 user_id)` 호출.  
   - B의 “운세권 구매” CHARGE가 1건이고, B에 대한 미지급 추천 행이 있으면 → 해당 행의 `reward_granted_at` 갱신 + A에게 망원경 1개 지급.
4. **B**가 두 번째 결제 시: CHARGE 건수 ≥ 2이므로 RPC가 “첫 결제 아님”으로 처리하고, 보상은 지급되지 않음.

이 설계로 “가입 시 3명 달성 보상”은 제거되고, “피추천인 생애 최초 결제 시 추천인에게 망원경 1개 1회 한정 지급”만 동작하며, 탈퇴 재가입 유저는 매핑 단계에서만 차단됩니다.
