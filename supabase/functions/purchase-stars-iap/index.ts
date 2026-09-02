// Supabase Edge Function - 진짜미래 모바일 앱 IAP 검증 (Apple App Store / Google Play)
//
// 호출 시점: Flutter 앱에서 in_app_purchase 가 구매 완료 이벤트를 받은 직후.
// 검증 흐름:
//   1. JWT 로 사용자 인증
//   2. 스토어(Apple/Google) 에 영수증 검증 요청
//   3. 검증 통과 시 product_id → 별 매핑으로 지갑 충전 및 트랜잭션 기록
//   4. 추천인 보상 RPC 호출
//
// 필요한 환경 변수 (Supabase functions secrets):
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//   - APPLE_SHARED_SECRET                    : App Store Connect → Apps → App-Specific Shared Secret
//   - GOOGLE_SERVICE_ACCOUNT_JSON            : Google Cloud Service Account 의 JSON 키 전체 문자열
//   - GOOGLE_PACKAGE_NAME                    : Android applicationId (kr.truefuture.app)
//
// ⚠️ 배포 순서: add_wallet_stars RPC(20260906_add_wallet_stars.sql)와
//    CHARGE 부분 UNIQUE 인덱스(20260905_star_transactions_charge_unique.sql)를 사용한다.
//    마이그레이션을 먼저 적용한 뒤 배포할 것. (RPC 미존재 시에는 구방식으로 자동 폴백)

declare global {
  const Deno: {
    env: { get(key: string): string | undefined };
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ───────────────────────────────────────────────────────────────────────────
// 상수
// ───────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Pkg {
  name: string;
  paid: number;
  bonus: number;
  probe: number;
}

// product_id → 지급량. Flutter 측 IapCatalog 와 1:1 대응.
const IAP_PACKAGES: Record<string, Pkg> = {
  tf_ticket_1: { name: "망원경 1개 (IAP)", paid: 1, bonus: 0, probe: 0 },
  tf_ticket_3: { name: "망원경 3개 (IAP)", paid: 3, bonus: 1, probe: 0 },
  tf_ticket_5: { name: "망원경 5개 (IAP)", paid: 5, bonus: 3, probe: 0 },
  tf_compass_7: { name: "나침반 7개 (IAP)", paid: 0, bonus: 7, probe: 0 },
  tf_compass_14: { name: "나침반 14개 (IAP)", paid: 0, bonus: 14, probe: 0 },
  tf_probe_1: { name: "탐사선 1대 (IAP)", paid: 0, bonus: 0, probe: 1 },
};

const STARS_EXPIRY_DAYS = 365; // 정책: 1년 만료

// ───────────────────────────────────────────────────────────────────────────
// Apple App Store 영수증 검증
// ───────────────────────────────────────────────────────────────────────────

interface AppleVerifyResult {
  ok: boolean;
  productId?: string;
  transactionId?: string;
  error?: string;
}

async function verifyAppleReceipt(
  receiptBase64: string,
  expectedProductId: string,
  expectedTransactionId: string,
): Promise<AppleVerifyResult> {
  const sharedSecret = Deno.env.get("APPLE_SHARED_SECRET");
  if (!sharedSecret) {
    return { ok: false, error: "APPLE_SHARED_SECRET not configured" };
  }

  const tryEndpoint = async (
    url: string,
  ): Promise<{ status: number; receipt?: any; latest?: any[] }> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "receipt-data": receiptBase64,
        password: sharedSecret,
        "exclude-old-transactions": false,
      }),
    });
    const json = await res.json();
    return {
      status: json.status,
      receipt: json.receipt,
      latest: json.latest_receipt_info ?? json.receipt?.in_app ?? [],
    };
  };

  // Apple 권장: production 에 먼저 보내고, 21007(sandbox) 응답이면 sandbox 재시도
  let result = await tryEndpoint("https://buy.itunes.apple.com/verifyReceipt");
  if (result.status === 21007) {
    result = await tryEndpoint("https://sandbox.itunes.apple.com/verifyReceipt");
  }

  if (result.status !== 0) {
    return { ok: false, error: `apple status=${result.status}` };
  }

  // in_app 배열에서 transaction_id 일치하는 항목 찾기
  const txns: any[] = result.latest ?? [];
  const matched = txns.find(
    (t) =>
      t.transaction_id === expectedTransactionId ||
      t.original_transaction_id === expectedTransactionId,
  );

  if (!matched) {
    return {
      ok: false,
      error: `transaction not found in receipt (expected=${expectedTransactionId})`,
    };
  }

  if (matched.product_id !== expectedProductId) {
    return {
      ok: false,
      error: `product mismatch: receipt=${matched.product_id} expected=${expectedProductId}`,
    };
  }

  return {
    ok: true,
    productId: matched.product_id,
    transactionId: matched.transaction_id,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Google Play Developer API 영수증 검증
// ───────────────────────────────────────────────────────────────────────────

interface GoogleSvcAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

async function googleAccessToken(svc: GoogleSvcAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: svc.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: svc.token_uri ?? "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj: any) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${enc(header)}.${enc(claim)}`;

  // PEM → CryptoKey
  const pem = svc.private_key.replace(/\\n/g, "\n");
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsigned}.${sig}`;

  const res = await fetch(svc.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`google token exchange failed: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

interface GoogleVerifyResult {
  ok: boolean;
  /** Google Play 주문 번호. 소비성 상품 재구매 시마다 새로 발급된다 */
  orderId?: string;
  error?: string;
}

async function verifyGooglePurchase(
  productId: string,
  purchaseToken: string,
): Promise<GoogleVerifyResult> {
  const svcRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  const packageName = Deno.env.get("GOOGLE_PACKAGE_NAME");
  if (!svcRaw || !packageName) {
    return {
      ok: false,
      error: "GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_PACKAGE_NAME not configured",
    };
  }

  let svc: GoogleSvcAccount;
  try {
    svc = JSON.parse(svcRaw);
  } catch {
    return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON parse error" };
  }

  const token = await googleAccessToken(svc);
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/products/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: `google api ${res.status}: ${txt}` };
  }
  const data = await res.json();

  // purchaseState: 0=PURCHASED, 1=CANCELED, 2=PENDING
  if (data.purchaseState !== 0) {
    return { ok: false, error: `purchaseState=${data.purchaseState}` };
  }
  return {
    ok: true,
    orderId: typeof data.orderId === "string" && data.orderId ? data.orderId : undefined,
  };
}

/** purchaseToken 의 SHA-256 앞 32자 (orderId 가 없을 때의 대체 식별자) */
async function sha256Hex32(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 32);
}

// ───────────────────────────────────────────────────────────────────────────
// 메인 핸들러
// ───────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json(500, { success: false, error: "supabase env missing" });
    }

    // 1. JWT 인증
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { success: false, error: "missing Authorization" });
    }
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: jwtUser } } = await supabaseAuth.auth.getUser(token);
    if (!jwtUser) {
      return json(401, { success: false, error: "invalid token" });
    }

    // 2. 요청 본문
    const body = await req.json().catch(() => ({}));
    const {
      user_id,
      platform, // 'ios' | 'android'
      product_id,
      purchase_id, // = transaction_id on iOS / orderId on Android
      transaction_id, // iOS: 동일, Android: 동일
      receipt, // iOS: base64 receipt, Android: purchaseToken
      signature, // Android: billingClientPurchase.signature (참고용)
    } = body;

    if (jwtUser.id !== user_id) {
      return json(403, { success: false, error: "user_id mismatch" });
    }
    if (!platform || !product_id || !receipt || !purchase_id) {
      return json(400, {
        success: false,
        error: "missing fields: platform/product_id/purchase_id/receipt",
      });
    }

    const pkg = IAP_PACKAGES[product_id];
    if (!pkg) {
      return json(400, {
        success: false,
        error: `unknown product_id: ${product_id}`,
      });
    }

    // 3. 영수증 검증 — 중복 판정 키는 클라이언트 값이 아니라 스토어 검증 응답에서 얻는다
    //    (클라이언트가 보낸 purchase_id 는 위변조 가능하고, 플랫폼/버전마다 값이 달라진다)
    let storeTxnId = "";
    if (platform === "ios") {
      const r = await verifyAppleReceipt(
        receipt,
        product_id,
        transaction_id ?? purchase_id,
      );
      if (!r.ok) {
        return json(400, { success: false, error: `apple: ${r.error}` });
      }
      storeTxnId = r.transactionId ?? "";
    } else if (platform === "android") {
      const r = await verifyGooglePurchase(product_id, receipt);
      if (!r.ok) {
        return json(400, { success: false, error: `google: ${r.error}` });
      }
      // orderId 가 없으면(구독 승격 등 일부 케이스) purchaseToken 해시로 대체
      storeTxnId = r.orderId ?? `tok_${await sha256Hex32(String(receipt))}`;
    } else {
      return json(400, { success: false, error: `unknown platform: ${platform}` });
    }

    // 4. Admin 클라이언트로 DB 처리
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // 중복 처리 방지: 새 키(스토어 식별자)로 먼저 조회하고, 없으면 구 키(클라이언트 purchase_id)로도 조회.
    // 기록은 항상 새 키로 남긴다.
    const relatedId = `iap_${platform}_${storeTxnId || purchase_id}`;
    const legacyRelatedId = `iap_${platform}_${purchase_id}`;
    const dedupeKeys = [...new Set([relatedId, legacyRelatedId])];

    const { data: dup } = await admin
      .from("star_transactions")
      .select("id")
      .in("related_item_id", dedupeKeys)
      .eq("type", "CHARGE")
      .limit(1)
      .maybeSingle();
    if (dup) {
      return json(200, {
        success: true,
        already_processed: true,
        message: "이미 처리된 결제",
      });
    }

    // 5. 지급 — 원장(star_transactions) 먼저 기록해 멱등성을 확보한 뒤 지갑을 원자 증가시킨다.
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + STARS_EXPIRY_DAYS);
    const total = pkg.paid + pkg.bonus + pkg.probe;

    const { data: insertedTx, error: txErr } = await admin
      .from("star_transactions")
      .insert({
        user_id,
        amount: total,
        type: "CHARGE",
        description: `IAP 구매: ${pkg.name}`,
        related_item_id: relatedId,
        paid_amount: pkg.paid,
        bonus_amount: pkg.bonus,
        probe_amount: pkg.probe,
        expires_at: expiresAt.toISOString(),
        is_expired: false,
      })
      .select("id")
      .single();

    if (txErr) {
      // UNIQUE 위반 = 동시 요청/재전송 → 이미 처리된 결제
      if (String((txErr as any).code) === "23505") {
        return json(200, {
          success: true,
          already_processed: true,
          message: "이미 처리된 결제",
        });
      }
      console.error("tx insert failed", txErr);
      return json(500, { success: false, error: "transaction log failed" });
    }

    // 6. 지갑 원자 증가 (실패 시 방금 넣은 원장 행을 삭제해 보상)
    let newPaid = 0;
    let newBonus = 0;
    let newProbe = 0;
    const { data: walletResult, error: walletRpcErr } = await admin.rpc("add_wallet_stars", {
      p_user_id: user_id,
      p_paid: pkg.paid,
      p_bonus: pkg.bonus,
      p_probe: pkg.probe,
    });

    if (walletRpcErr) {
      const rpcMissing =
        String((walletRpcErr as any).code) === "PGRST202" ||
        String((walletRpcErr as any).code) === "42883" ||
        /add_wallet_stars/.test(String((walletRpcErr as any).message ?? ""));

      let fallbackOk = false;
      if (rpcMissing) {
        console.warn("add_wallet_stars RPC missing — falling back to upsert. apply migrations.");
        const { data: wallet } = await admin
          .from("user_wallets")
          .select("paid_stars, bonus_stars, probe_stars")
          .eq("user_id", user_id)
          .maybeSingle();
        newPaid = ((wallet as any)?.paid_stars ?? 0) + pkg.paid;
        newBonus = ((wallet as any)?.bonus_stars ?? 0) + pkg.bonus;
        newProbe = ((wallet as any)?.probe_stars ?? 0) + pkg.probe;
        const { error: upsertErr } = await admin
          .from("user_wallets")
          .upsert(
            {
              user_id,
              paid_stars: newPaid,
              bonus_stars: newBonus,
              probe_stars: newProbe,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        fallbackOk = !upsertErr;
        if (upsertErr) console.error("wallet upsert fallback failed", upsertErr);
      }

      if (!fallbackOk) {
        console.error("wallet update failed — compensating ledger row", walletRpcErr);
        const { error: compErr } = await admin
          .from("star_transactions")
          .delete()
          .eq("id", (insertedTx as any).id);
        if (compErr) {
          console.error("compensation delete failed — manual check needed", {
            transactionId: (insertedTx as any).id,
            compErr,
          });
        }
        return json(500, { success: false, error: "wallet update failed" });
      }
    } else {
      newPaid = (walletResult as any)?.paid_stars ?? 0;
      newBonus = (walletResult as any)?.bonus_stars ?? 0;
      newProbe = (walletResult as any)?.probe_stars ?? 0;
    }

    // 7. 추천인 보상
    try {
      await admin.rpc("grant_referral_reward_if_first_purchase", {
        p_referee_id: user_id,
      });
    } catch (e) {
      console.warn("referral RPC failed (non-fatal)", e);
    }

    return json(200, {
      success: true,
      data: {
        paid_stars: pkg.paid,
        bonus_stars: pkg.bonus,
        probe_stars: pkg.probe,
        total,
        new_balance: {
          paid_stars: newPaid,
          bonus_stars: newBonus,
          probe_stars: newProbe,
        },
      },
    });
  } catch (e) {
    console.error("[purchase-stars-iap] exception", e);
    const msg = e instanceof Error ? e.message : "unknown";
    return json(500, { success: false, error: msg });
  }
});
