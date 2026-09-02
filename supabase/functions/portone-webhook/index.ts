// Supabase Edge Function - PortOne V2 웹훅 수신 (결제 완료 서버 알림)
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//   웹/앱 클라이언트가 결제 직후 purchase-stars / premium-report(purchase) 를
//   호출하지 못하는 경우(브라우저 종료, 리다이렉트 실패, 네트워크 끊김)에도
//   결제만 승인되고 지급은 누락되는 사고를 막는 안전망이다.
//   기존 클라이언트 호출 흐름은 그대로 두고, 이 함수는 "빠진 건만" 채운다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 활성화 절차 (이 코드만 배포해서는 동작하지 않는다)
//   1) 함수 배포
//        supabase functions deploy portone-webhook
//   2) PortOne 콘솔 → 결제 연동 → 웹훅 관리에서 아래 URL 을 등록하고,
//      "결제 완료(Transaction.Paid)" 이벤트를 구독한다.
//        https://mxcdrqdcadnccpuntdxw.supabase.co/functions/v1/portone-webhook
//   3) 콘솔이 발급한 웹훅 시크릿(whsec_… 형식)을 함수 시크릿으로 등록한다.
//        supabase secrets set PORTONE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
//      (PORTONE_API_SECRET 은 purchase-stars 와 동일한 값을 이미 사용 중)
//   4) 콘솔의 "테스트 발송" 으로 200 응답을 확인한다.
//   ※ PORTONE_WEBHOOK_SECRET 이 없으면 이 함수는 모든 요청을 503 으로 거절한다.
//      (검증 없이 지급하는 것보다 아무것도 하지 않는 편이 안전하다)
//
// ─────────────────────────────────────────────────────────────────────────────
// 서명 검증: Standard Webhooks 규격
//   헤더  : webhook-id, webhook-timestamp, webhook-signature
//   서명값: base64(HMAC-SHA256(key, `${id}.${timestamp}.${rawBody}`))
//   헤더의 webhook-signature 는 "v1,<sig> v1,<sig2>" 처럼 공백으로 구분된 목록이며
//   그중 하나와 일치하면 통과한다. timestamp 는 현재 시각 ±5분 이내여야 한다.
//
// ─────────────────────────────────────────────────────────────────────────────
// customData 규약 (결제 요청 시 클라이언트가 심는다)
//   리포트 : {"k":"report","u":"<user_id>","p":"<profile_id>","q":"<question>"}
//   운세권 : {"k":"stars","u":"<user_id>","pkg":"<package_id>"}
//   customData 가 없거나 k 를 모르면 200 으로 ACK 만 하고 로그를 남긴다
//   (4xx/5xx 로 응답하면 PortOne 이 재시도를 반복한다).
//
// ⚠️ 배포 순서: add_wallet_stars RPC(20260906_add_wallet_stars.sql)와
//    CHARGE 부분 UNIQUE 인덱스(20260905_star_transactions_charge_unique.sql)에 의존한다.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ───────────────────────────────────────────────────────────────────────────
// 상품 정의 — purchase-stars / premium-report 와 동일한 값을 복사해 둔다.
// (엣지 함수 간 공유 모듈을 두면 배포 단위가 얽히므로 의도적으로 복제한다.
//  둘 중 하나를 바꾸면 반드시 여기도 함께 고칠 것)
// ───────────────────────────────────────────────────────────────────────────

const PACKAGES_KRW: Record<
  number,
  { name: string; paid: number; bonus: number; probe: number }
> = {
  1000: { name: "망원경 1개 (Ticket_1)", paid: 1, bonus: 0, probe: 0 },
  2900: { name: "망원경 3개 (Ticket_3)", paid: 3, bonus: 1, probe: 0 },
  4950: { name: "망원경 5개 (Ticket_5)", paid: 5, bonus: 3, probe: 0 },
  1900: { name: "나침반 7개 (Daily_7)", paid: 0, bonus: 7, probe: 0 },
  3500: { name: "나침반 14개 (Daily_14)", paid: 0, bonus: 14, probe: 0 },
  2990: { name: "탐사선 종합운세 1회권 (Grand_Fortune)", paid: 0, bonus: 0, probe: 1 },
};

const PACKAGES_USD_BY_ID: Record<
  string,
  { name: string; priceUsd: number; paid: number; bonus: number; probe: number }
> = {
  ticket_3: { name: "망원경 3개 (Ticket_3)", priceUsd: 2.99, paid: 3, bonus: 1, probe: 0 },
  ticket_5: { name: "망원경 5개 (Ticket_5)", priceUsd: 4.99, paid: 5, bonus: 3, probe: 0 },
  daily_14: { name: "나침반 14개 (Daily_14)", priceUsd: 3.99, paid: 0, bonus: 14, probe: 0 },
  probe_1: { name: "탐사선 종합운세 1회권 (Grand_Fortune)", priceUsd: 2.99, paid: 0, bonus: 0, probe: 1 },
};

// 프리미엄 리포트 (premium-report/index.ts 와 동일)
const REPORT_PRICE_KRW = 18000;
const ACCEPTED_PRICES_KRW = [18000, 15000];
const REPORT_SECTIONS_TOTAL = 3;
const QUESTION_MAX_LENGTH = 500;

const STARS_EXPIRY_DAYS = 90; // purchase-stars 와 동일 (결제일 + 90일)
const SIGNATURE_TOLERANCE_SEC = 5 * 60;

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 서명 검증
// ───────────────────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 타이밍 공격 완화를 위한 상수 시간 비교 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhookSignature(
  secret: string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string,
  rawBody: string,
): Promise<{ ok: boolean; reason?: string }> {
  const tsSec = Number(webhookTimestamp);
  if (!Number.isFinite(tsSec)) {
    return { ok: false, reason: "invalid timestamp" };
  }
  const skew = Math.abs(Math.floor(Date.now() / 1000) - tsSec);
  if (skew > SIGNATURE_TOLERANCE_SEC) {
    return { ok: false, reason: `timestamp skew ${skew}s` };
  }

  // whsec_ 접두를 떼고 base64 디코드한 값이 실제 HMAC 키
  const rawKey = secret.startsWith("whsec_") ? secret.substring("whsec_".length) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(rawKey);
  } catch (_) {
    return { ok: false, reason: "secret is not valid base64" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const macBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signed),
  );
  const expected = bytesToBase64(new Uint8Array(macBuf));

  // "v1,<sig> v1,<sig2>" 중 하나와 일치하면 통과
  const candidates = webhookSignature
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(",");
      return idx === -1 ? part : part.substring(idx + 1);
    });

  for (const c of candidates) {
    if (timingSafeEqual(c, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}

// ───────────────────────────────────────────────────────────────────────────
// 지급 처리
// ───────────────────────────────────────────────────────────────────────────

/** 원장 먼저 → 지갑 원자 증가. 이미 지급된 결제면 아무것도 하지 않는다. */
async function grantStars(
  admin: any,
  userId: string,
  paymentId: string,
  pkg: { name: string; paid: number; bonus: number; probe: number },
): Promise<{ granted: boolean; error?: string }> {
  const total = pkg.paid + pkg.bonus + pkg.probe;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + STARS_EXPIRY_DAYS);

  const { data: insertedTx, error: txErr } = await admin
    .from("star_transactions")
    .insert({
      user_id: userId,
      amount: total,
      type: "CHARGE",
      description: `운세권 구매: ${pkg.name}`,
      related_item_id: paymentId,
      paid_amount: pkg.paid,
      bonus_amount: pkg.bonus,
      probe_amount: pkg.probe,
      expires_at: expiresAt.toISOString(),
      is_expired: false,
    })
    .select("id")
    .single();

  if (txErr) {
    if (String(txErr.code) === "23505") {
      // 클라이언트 호출이 먼저 처리함 → 정상
      return { granted: false };
    }
    return { granted: false, error: `ledger insert failed: ${txErr.message}` };
  }

  const { error: walletErr } = await admin.rpc("add_wallet_stars", {
    p_user_id: userId,
    p_paid: pkg.paid,
    p_bonus: pkg.bonus,
    p_probe: pkg.probe,
  });

  if (walletErr) {
    console.error("❌ [webhook] 지갑 증가 실패 — 원장 보상 삭제:", walletErr);
    const { error: compErr } = await admin
      .from("star_transactions")
      .delete()
      .eq("id", insertedTx.id);
    if (compErr) {
      console.error("🚨 [webhook] 보상 삭제 실패 — 수동 확인 필요:", {
        transactionId: insertedTx.id,
        compErr,
      });
    }
    return { granted: false, error: `wallet update failed: ${walletErr.message}` };
  }

  // 친구 추천 보상 (실패해도 지급은 유효)
  try {
    await admin.rpc("grant_referral_reward_if_first_purchase", { p_referee_id: userId });
  } catch (e) {
    console.warn("⚠️ [webhook] 추천 보상 RPC 실패 (무시):", e);
  }

  return { granted: true };
}

/** customData 의 k === "stars" 처리 */
async function handleStarsPayment(
  admin: any,
  payment: any,
  paymentId: string,
  custom: { u?: string; pkg?: string },
): Promise<Response> {
  const userId = typeof custom.u === "string" ? custom.u.trim() : "";
  if (!userId) {
    console.warn("⚠️ [webhook] stars: customData 에 user_id(u) 없음 — ACK만 수행");
    return json(200, { ok: true, skipped: "missing user id" });
  }

  // 이미 지급된 결제면 조기 종료 (일반 경로: 클라이언트가 먼저 처리)
  const { data: existing } = await admin
    .from("star_transactions")
    .select("id")
    .eq("related_item_id", paymentId)
    .eq("type", "CHARGE")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return json(200, { ok: true, already_processed: true });
  }

  // 사용자 존재 확인
  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !userRes?.user) {
    console.error("❌ [webhook] stars: 존재하지 않는 사용자", userId, userErr);
    return json(200, { ok: true, skipped: "unknown user" });
  }

  // 금액·통화 검증 (purchase-stars 와 동일 규칙)
  const currency = String(payment.amount?.currency ?? "KRW").toUpperCase();
  const rawTotal = payment.amount?.total;
  if (!rawTotal || rawTotal <= 0) {
    console.error("❌ [webhook] stars: 금액 확인 불가", payment.amount);
    return json(200, { ok: true, skipped: "invalid amount" });
  }

  let pkg: { name: string; paid: number; bonus: number; probe: number } | undefined;
  if (currency === "USD") {
    const amountUsd =
      Number.isInteger(rawTotal) && rawTotal >= 100 ? rawTotal / 100 : rawTotal;
    const byId = custom.pkg ? PACKAGES_USD_BY_ID[custom.pkg] : undefined;
    if (byId && Math.abs(byId.priceUsd - amountUsd) <= 0.01) {
      pkg = byId;
    }
  } else {
    pkg = PACKAGES_KRW[rawTotal];
  }

  if (!pkg) {
    // 웹훅에서는 자동 취소를 하지 않는다(클라이언트 경로가 이미 취소했을 수 있음).
    // 지급만 보류하고 로그로 남긴다.
    console.error("❌ [webhook] stars: 알 수 없는 결제 금액 — 지급 보류", {
      paymentId,
      currency,
      total: rawTotal,
      pkgId: custom.pkg ?? null,
    });
    return json(200, { ok: true, skipped: "unknown package" });
  }

  const result = await grantStars(admin, userId, paymentId, pkg);
  if (result.error) {
    console.error("❌ [webhook] stars 지급 실패:", result.error);
    return json(500, { ok: false, error: result.error });
  }

  console.log(
    JSON.stringify({
      logType: "PORTONE_WEBHOOK_STARS",
      paymentId,
      userId,
      granted: result.granted,
      pkg: pkg.name,
    }),
  );
  return json(200, { ok: true, granted: result.granted });
}

/** customData 의 k === "report" 처리 */
async function handleReportPayment(
  admin: any,
  payment: any,
  paymentId: string,
  custom: { u?: string; p?: string; q?: string },
): Promise<Response> {
  const userId = typeof custom.u === "string" ? custom.u.trim() : "";
  const profileId = typeof custom.p === "string" ? custom.p.trim() : "";
  if (!userId || !profileId) {
    console.warn("⚠️ [webhook] report: customData 에 u/p 없음 — ACK만 수행");
    return json(200, { ok: true, skipped: "missing user/profile id" });
  }

  const { data: existing } = await admin
    .from("premium_reports")
    .select("id")
    .eq("merchant_uid", paymentId)
    .maybeSingle();
  if (existing) {
    return json(200, { ok: true, already_processed: true, reportId: existing.id });
  }

  // 금액·통화 검증 (premium-report handlePurchase 와 동일 규칙)
  const currency = String(payment.amount?.currency ?? "KRW").toUpperCase();
  const total = payment.amount?.total;
  if (currency !== "KRW" || !ACCEPTED_PRICES_KRW.includes(total)) {
    console.error("❌ [webhook] report: 금액 불일치 — 생성 보류", {
      paymentId,
      currency,
      total,
    });
    return json(200, { ok: true, skipped: "amount mismatch" });
  }

  // 프로필 조회 (service role — 소유자 검증 포함)
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, name, birth_date, birth_time, gender, city_name, lat, lng, timezone")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    console.error("❌ [webhook] report: 프로필 없음/소유자 불일치", { profileId, userId });
    return json(200, { ok: true, skipped: "profile not found" });
  }
  if (!profile.birth_date || profile.lat == null || profile.lng == null) {
    console.error("❌ [webhook] report: 출생 정보 부족", { profileId });
    return json(200, { ok: true, skipped: "profile incomplete" });
  }

  let question = typeof custom.q === "string" ? custom.q.trim() : "";
  if (question.length > QUESTION_MAX_LENGTH) {
    question = question.substring(0, QUESTION_MAX_LENGTH);
  }
  question = question.replace(/"""/g, '"');

  const snapshot = {
    name: profile.name,
    birth_date: String(profile.birth_date).substring(0, 19),
    birth_time: profile.birth_time,
    gender: profile.gender,
    city_name: profile.city_name,
    lat: profile.lat,
    lng: profile.lng,
    timezone: profile.timezone,
  };

  const { data: inserted, error: insertError } = await admin
    .from("premium_reports")
    .insert({
      user_id: userId,
      profile_id: profile.id,
      profile_snapshot: snapshot,
      question: question || null,
      status: "PAID",
      sections_total: REPORT_SECTIONS_TOTAL,
      sections_done: 0,
      content: "",
      merchant_uid: paymentId,
      payment_id: payment.id ?? paymentId,
      amount: total ?? REPORT_PRICE_KRW,
      currency: "KRW",
    })
    .select("id")
    .single();

  if (insertError) {
    if (String(insertError.code) === "23505") {
      // 클라이언트 경로가 먼저 만든 경우
      return json(200, { ok: true, already_processed: true });
    }
    console.error("❌ [webhook] report: premium_reports insert 실패:", insertError);
    return json(500, { ok: false, error: "report insert failed" });
  }

  console.log(
    JSON.stringify({
      logType: "PORTONE_WEBHOOK_REPORT",
      paymentId,
      userId,
      reportId: inserted.id,
    }),
  );
  return json(200, { ok: true, reportId: inserted.id });
}

// ───────────────────────────────────────────────────────────────────────────
// 메인 핸들러
// ───────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const webhookSecret = Deno.env.get("PORTONE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error(
        "❌ [webhook] PORTONE_WEBHOOK_SECRET 미설정 — 검증 불가로 요청을 거절합니다. " +
          "supabase secrets set PORTONE_WEBHOOK_SECRET=whsec_… 후 재배포하세요.",
      );
      return json(503, { ok: false, error: "webhook secret not configured" });
    }

    const rawBody = await req.text();
    const webhookId = req.headers.get("webhook-id") ?? "";
    const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
    const webhookSignature = req.headers.get("webhook-signature") ?? "";

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      console.error("❌ [webhook] 서명 헤더 누락");
      return json(401, { ok: false, error: "missing signature headers" });
    }

    const verdict = await verifyWebhookSignature(
      webhookSecret,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      rawBody,
    );
    if (!verdict.ok) {
      console.error("❌ [webhook] 서명 검증 실패:", verdict.reason);
      return json(401, { ok: false, error: "invalid signature" });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch (_) {
      console.error("❌ [webhook] JSON 파싱 실패");
      return json(200, { ok: true, skipped: "unparseable body" });
    }

    // 결제 완료 이벤트만 처리 (취소/실패 등은 ACK 만)
    if (event?.type !== "Transaction.Paid") {
      return json(200, { ok: true, skipped: `unhandled type: ${event?.type}` });
    }

    const paymentId = String(event?.data?.paymentId ?? "").trim();
    if (!paymentId) {
      console.warn("⚠️ [webhook] paymentId 없음");
      return json(200, { ok: true, skipped: "missing paymentId" });
    }

    const portoneApiSecret = Deno.env.get("PORTONE_API_SECRET");
    if (!portoneApiSecret) {
      console.error("❌ [webhook] PORTONE_API_SECRET 미설정");
      return json(503, { ok: false, error: "portone api secret not configured" });
    }

    // 웹훅 본문을 믿지 않고 PortOne API 로 실제 결제를 재조회한다
    const paymentRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      { method: "GET", headers: { Authorization: `PortOne ${portoneApiSecret}` } },
    );
    if (!paymentRes.ok) {
      const text = (await paymentRes.text()).substring(0, 200);
      if (paymentRes.status === 404) {
        console.error("❌ [webhook] 결제 조회 404:", paymentId);
        return json(200, { ok: true, skipped: "payment not found" });
      }
      // 일시 장애 → 5xx 로 응답해 PortOne 재시도를 유도
      console.error(`❌ [webhook] 결제 조회 실패 (${paymentRes.status}):`, text);
      return json(502, { ok: false, error: "portone lookup failed" });
    }

    const payment = await paymentRes.json();
    if (payment.status !== "PAID") {
      console.warn(`⚠️ [webhook] 결제 상태가 PAID 아님: ${payment.status}`);
      return json(200, { ok: true, skipped: `status ${payment.status}` });
    }

    let custom: any = null;
    try {
      const raw = payment.customData;
      if (typeof raw === "string" && raw.trim()) custom = JSON.parse(raw);
      else if (raw && typeof raw === "object") custom = raw;
      // 클라이언트가 문자열을 넘겨 이중 인코딩된 경우 방어
      if (typeof custom === "string") custom = JSON.parse(custom);
    } catch (e) {
      console.warn("⚠️ [webhook] customData 파싱 실패:", e);
    }

    if (!custom || typeof custom.k !== "string") {
      // 재시도 폭주 방지를 위해 200 으로 ACK 하고 로그만 남긴다
      console.warn("⚠️ [webhook] customData 없음/알 수 없음 — ACK만 수행:", paymentId);
      return json(200, { ok: true, skipped: "no customData" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ [webhook] Supabase 환경 변수 미설정");
      return json(503, { ok: false, error: "supabase env missing" });
    }
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    if (custom.k === "report") {
      return await handleReportPayment(admin, payment, paymentId, custom);
    }
    if (custom.k === "stars") {
      return await handleStarsPayment(admin, payment, paymentId, custom);
    }

    console.warn(`⚠️ [webhook] 알 수 없는 customData.k: ${custom.k} — ACK만 수행`);
    return json(200, { ok: true, skipped: `unknown kind: ${custom.k}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("❌ [portone-webhook] 예외:", e);
    // 5xx 를 주면 PortOne 이 재시도한다 (멱등 처리가 되어 있으므로 안전)
    return json(500, { ok: false, error: msg });
  }
});
