// Supabase Edge Function - 진짜미래 결제: 별 충전 처리 (포트원 결제 완료 후 호출)
//
// 응답 계약 (프론트/앱과 공유):
//   - 정상 지급           : 200 { success:true, ... }
//   - 이미 처리된 결제     : 200 { success:true, already_processed:true, ... }
//   - 결제 미완료          : 400 { success:false, code:"NOT_PAID", status, error }
//   - 금액/통화 불일치      : 400 { success:false, code:"AMOUNT_MISMATCH", cancelled, error }
//                            (이미 승인된 결제는 PortOne 자동 취소를 시도한다)
//   - PortOne 결제 없음     : 404 { success:false, code:"PAYMENT_NOT_FOUND", error }
//   - PortOne 조회 불가     : 502 { success:false, code:"PORTONE_UNAVAILABLE", error }
//   - 인증 실패            : 401 { success:false, code:"UNAUTHORIZED" }
//   - JWT/body 사용자 불일치 : 403 { success:false, code:"USER_MISMATCH" }
//
// ⚠️ 배포 순서: 이 함수는 add_wallet_stars RPC(20260906_add_wallet_stars.sql)와
//    CHARGE 부분 UNIQUE 인덱스(20260905_star_transactions_charge_unique.sql)를 사용한다.
//    마이그레이션을 먼저 적용한 뒤 배포할 것. (RPC 미존재 시에는 구방식으로 자동 폴백)

declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// KRW 패키지 정의 (가격 → 이름, 망원경/나침반/탐사선)
// paid = 망원경, bonus = 나침반, probe = 탐사선(종합운세 1회권)
const PACKAGES: Record<
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

// USD 패키지 정의 (달러 금액 키)
// ⚠️ ticket_3($2.99)와 probe_1($2.99)이 동일 금액이므로
//    PACKAGES_USD_BY_ID를 primary 조회에 사용하고 금액은 검증용으로 활용
const PACKAGES_USD: Record<
  number,
  { name: string; paid: number; bonus: number; probe: number }
> = {
  2.99: { name: "망원경 3개 (Ticket_3)", paid: 3, bonus: 1, probe: 0 },
  4.99: { name: "망원경 5개 (Ticket_5)", paid: 5, bonus: 3, probe: 0 },
  3.99: { name: "나침반 14개 (Daily_14)", paid: 0, bonus: 14, probe: 0 },
};

// USD 패키지 정의 (package_id 키) — 동일 금액 충돌 해소용, 최종 조회 기준
const PACKAGES_USD_BY_ID: Record<
  string,
  { name: string; priceUsd: number; paid: number; bonus: number; probe: number }
> = {
  ticket_3: { name: "망원경 3개 (Ticket_3)", priceUsd: 2.99, paid: 3, bonus: 1, probe: 0 },
  ticket_5: { name: "망원경 5개 (Ticket_5)", priceUsd: 4.99, paid: 5, bonus: 3, probe: 0 },
  daily_14: { name: "나침반 14개 (Daily_14)", priceUsd: 3.99, paid: 0, bonus: 14, probe: 0 },
  probe_1:  { name: "탐사선 종합운세 1회권 (Grand_Fortune)", priceUsd: 2.99, paid: 0, bonus: 0, probe: 1 },
};

/** 우리가 발급하는 merchant_uid 형식 (frontend Purchase.jsx: `order_${Date.now()}_${uid8}`) */
function isOurMerchantUid(id: string): boolean {
  return id.startsWith("order_");
}

/**
 * 이미 승인된 결제를 PortOne V2 로 자동 취소한다 (금액 불일치 등 지급 불가 상황).
 * premium-report/index.ts 의 자동 취소 블록과 동일한 방식.
 */
async function cancelPortOnePayment(
  portoneApiSecret: string,
  paymentId: string,
  reason: string,
): Promise<boolean> {
  try {
    const cancelRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `PortOne ${portoneApiSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      },
    );
    if (!cancelRes.ok) {
      console.error(
        "❌ 자동 취소 실패:",
        cancelRes.status,
        (await cancelRes.text()).substring(0, 200),
      );
      return false;
    }
    return true;
  } catch (cancelErr) {
    console.error("❌ 자동 취소 예외:", cancelErr);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return json(500, {
        success: false,
        code: "SERVER_MISCONFIGURED",
        error: "서버 설정 오류: Supabase 환경 변수가 필요합니다.",
      });
    }

    // Admin 클라이언트 (Service Role Key로 RLS 우회) — 인증 검사와 DB 처리 모두에 사용
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // [보안] JWT 인증 필수. anon 키만 보낸 경우 getUser가 사용자 해석에 실패하므로 401.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let authenticatedUserId: string | null = null;
    if (token) {
      const { data: { user: jwtUser } } = await supabaseAdmin.auth.getUser(token);
      authenticatedUserId = jwtUser?.id ?? null;
    }
    if (!authenticatedUserId) {
      console.error("❌ 인증 실패: JWT에서 사용자를 확인할 수 없습니다.");
      return json(401, {
        success: false,
        code: "UNAUTHORIZED",
        error: "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.",
      });
    }

    const body = await req.json().catch(() => ({}));
    let { imp_uid, merchant_uid, amount, currency, package_id } = body;
    const bodyUserId = body.user_id;
    currency = (currency || "KRW").toUpperCase();

    if (!bodyUserId || typeof bodyUserId !== "string" || bodyUserId.trim() === "") {
      console.error("❌ user_id 누락");
      return json(400, {
        success: false,
        code: "MISSING_USER_ID",
        error: "user_id는 필수입니다.",
      });
    }

    // [보안] JWT user_id와 body.user_id 불일치 시 거부
    if (authenticatedUserId !== bodyUserId) {
      console.error(`❌ user_id 불일치: JWT=${authenticatedUserId}, body=${bodyUserId}`);
      return json(403, {
        success: false,
        code: "USER_MISMATCH",
        error: "인증된 사용자 정보가 일치하지 않습니다.",
      });
    }
    const user_id: string = authenticatedUserId;

    const merchantUid = typeof merchant_uid === "string" ? merchant_uid.trim() : "";
    const impUid = typeof imp_uid === "string" ? imp_uid.trim() : "";

    if (!impUid && !merchantUid) {
      console.error("❌ imp_uid와 merchant_uid 모두 없음");
      return json(400, {
        success: false,
        code: "MISSING_PAYMENT_ID",
        error:
          "결제 정보 조회를 위해 결제 ID(txId 또는 imp_uid) 또는 merchant_uid가 필요합니다.",
      });
    }

    const isUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (
      impUid &&
      !impUid.startsWith("imp_") &&
      !impUid.startsWith("order_") &&
      !isUuid(impUid)
    ) {
      console.error("❌ 잘못된 결제 ID 형식:", impUid);
      return json(400, {
        success: false,
        code: "INVALID_PAYMENT_ID",
        error: "잘못된 결제 정보 형식입니다.",
      });
    }

    // 원장에 남기는 키 (기존 동작 유지: merchant_uid 우선)
    const ledgerKey = merchantUid || impUid;
    // 중복 확인 시에는 두 후보 모두 조회 (구버전이 imp_uid 로 기록했을 가능성 대비)
    const dedupeKeys = [...new Set([merchantUid, impUid].filter(Boolean))];

    /** 이미 지급된 결제면 기존 지급 정보를 담은 200 응답을 만든다. 없으면 null. */
    const buildAlreadyProcessed = async (): Promise<Response | null> => {
      const { data: existingTx, error: checkError } = await supabaseAdmin
        .from("star_transactions")
        .select("id, user_id, amount, paid_amount, bonus_amount, probe_amount, description")
        .in("related_item_id", dedupeKeys)
        .eq("type", "CHARGE")
        .limit(1)
        .maybeSingle();

      if (checkError) {
        console.error("중복 결제 확인 중 오류:", checkError);
        return null;
      }
      if (!existingTx) return null;

      const { data: wallet } = await supabaseAdmin
        .from("user_wallets")
        .select("paid_stars, bonus_stars, probe_stars")
        .eq("user_id", user_id)
        .maybeSingle();

      return json(200, {
        success: true,
        already_processed: true,
        message: "이미 처리된 결제입니다. 별은 이미 충전되었습니다.",
        data: {
          paid_stars: (existingTx as any).paid_amount ?? 0,
          bonus_stars: (existingTx as any).bonus_amount ?? 0,
          probe_stars: (existingTx as any).probe_amount ?? 0,
          total_stars: (existingTx as any).amount ?? 0,
          new_balance: {
            paid_stars: (wallet as any)?.paid_stars ?? 0,
            bonus_stars: (wallet as any)?.bonus_stars ?? 0,
            probe_stars: (wallet as any)?.probe_stars ?? 0,
          },
        },
      });
    };

    // 1. 중복 결제 방지: PortOne 조회/취소 전에 먼저 확인 (이미 지급된 건을 취소하지 않도록)
    const early = await buildAlreadyProcessed();
    if (early) return early;

    // 2. [보안] 항상 PortOne V2 API로 실제 결제 금액을 검증
    //    (프론트에서 보낸 amount를 신뢰하지 않고 서버 사이드 검증)
    const portoneApiSecret = Deno.env.get("PORTONE_API_SECRET");
    if (!portoneApiSecret) {
      console.error("❌ PortOne V2 API Secret이 설정되지 않았습니다.");
      return json(500, {
        success: false,
        code: "SERVER_MISCONFIGURED",
        error:
          "서버 설정 오류: PortOne V2 API Secret이 필요합니다. 관리자에게 문의하세요.",
      });
    }

    // 조회 ID 우선순위: 우리가 만든 merchant_uid(order_…) → imp_uid → merchant_uid.
    // 모바일 리다이렉트 복귀 시 구버전 클라이언트가 PortOne 거래번호(txId)를 imp_uid 로
    // 보내는데 그 값으로 조회하면 404 가 난다 → 404 면 다음 후보로 재시도한다.
    const lookupIds = [
      ...new Set(
        [isOurMerchantUid(merchantUid) ? merchantUid : "", impUid, merchantUid].filter(
          Boolean,
        ),
      ),
    ];

    let payment: any = null;
    let paymentId = lookupIds[0];
    let allNotFound = true;
    let lastLookupError = "";

    try {
      for (const candidate of lookupIds) {
        const paymentResponse = await fetch(
          `https://api.portone.io/payments/${encodeURIComponent(candidate)}`,
          { method: "GET", headers: { Authorization: `PortOne ${portoneApiSecret}` } },
        );
        if (paymentResponse.ok) {
          payment = await paymentResponse.json();
          paymentId = candidate;
          break;
        }
        const errorText = await paymentResponse.text();
        lastLookupError = `결제 정보 조회 실패 (${paymentResponse.status}): ${errorText.substring(0, 200)}`;
        console.error("결제 조회 실패 응답:", lastLookupError);
        if (paymentResponse.status !== 404) {
          allNotFound = false;
          break;
        }
        console.warn(`⚠️ PortOne 결제 조회 404 (id=${candidate}) — 다음 후보 ID로 재시도`);
      }
    } catch (error) {
      console.error("❌ PortOne V2 API 호출 예외:", error);
      return json(502, {
        success: false,
        code: "PORTONE_UNAVAILABLE",
        error: "결제 정보 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    if (!payment) {
      if (allNotFound) {
        return json(404, {
          success: false,
          code: "PAYMENT_NOT_FOUND",
          error: "결제 정보를 찾을 수 없습니다. 결제가 되었다면 고객센터로 문의해 주세요.",
        });
      }
      return json(502, {
        success: false,
        code: "PORTONE_UNAVAILABLE",
        error: `결제 정보 확인에 실패했습니다. ${lastLookupError}`,
      });
    }

    if (payment.status !== "PAID") {
      console.error(`결제 미완료 상태: ${payment.status}`);
      return json(400, {
        success: false,
        code: "NOT_PAID",
        status: payment.status,
        error: `결제가 완료되지 않았습니다. (상태: ${payment.status})`,
      });
    }

    if (payment.id) paymentId = payment.id;

    // [보안] PortOne API 응답의 실제 결제 금액을 사용 (프론트 전송값 무시)
    const verifiedAmount = payment.amount?.total;
    if (!verifiedAmount || verifiedAmount <= 0) {
      console.error("유효하지 않은 금액:", payment.amount);
      const cancelled = await cancelPortOnePayment(
        portoneApiSecret,
        paymentId,
        "결제 금액 확인 불가 자동 취소 (진짜미래 운세권)",
      );
      return json(400, {
        success: false,
        code: "AMOUNT_MISMATCH",
        cancelled,
        error: cancelled
          ? "결제 금액을 확인할 수 없어 결제를 자동 취소했습니다. 다시 시도해 주세요."
          : "유효한 결제 금액을 찾을 수 없습니다. 결제가 되었다면 고객센터로 문의해 주세요.",
      });
    }

    // PortOne API 응답 통화를 최종 기준으로 사용
    currency = (payment.amount?.currency || currency).toUpperCase();

    // USD는 센트 단위로 반환되므로 달러로 역변환
    if (currency === "USD" && Number.isInteger(verifiedAmount) && verifiedAmount >= 100) {
      amount = verifiedAmount / 100;
    } else {
      amount = verifiedAmount;
    }

    // [보안] 프론트에서 보낸 amount와 실제 결제 금액이 다르면 경고 로그
    const clientAmount = body.amount;
    if (clientAmount && typeof clientAmount === "number" && clientAmount > 0) {
      if (Math.abs(amount - clientAmount) > 0.01) {
        console.warn(`⚠️ 금액 불일치 감지: 클라이언트=${clientAmount}, 실제=${amount} (${currency})`);
      }
    }

    // 3. 패키지 검증 (통화에 따라 KRW / USD 조회 분기)
    let packageInfo: { name: string; paid: number; bonus: number; probe: number } | undefined;
    let priceMismatch = false;

    if (currency === "USD") {
      if (package_id && PACKAGES_USD_BY_ID[package_id]) {
        // package_id 기반 조회 (ticket_3/probe_1 $2.99 충돌 해소)
        const candidate = PACKAGES_USD_BY_ID[package_id];
        if (Math.abs(candidate.priceUsd - amount) > 0.01) {
          console.error(
            `❌ USD 금액 불일치: package_id=${package_id}, 기대=${candidate.priceUsd}, 실제=${amount}`,
          );
          priceMismatch = true;
        } else {
          packageInfo = candidate;
        }
      } else {
        // fallback: 금액 키로 조회 (package_id 미전달 시)
        packageInfo = PACKAGES_USD[amount];
      }
    } else {
      packageInfo = PACKAGES[amount];
    }

    if (!packageInfo || priceMismatch) {
      const unit = currency === "USD" ? "$" : "₩";
      console.error(`❌ 유효하지 않은 금액: ${unit}${amount} (currency: ${currency})`);
      console.error(
        "사용 가능한 패키지:",
        currency === "USD" ? Object.keys(PACKAGES_USD_BY_ID) : Object.keys(PACKAGES),
      );
      // 이미 승인된 결제이므로 고객 보호를 위해 자동 취소
      const cancelled = await cancelPortOnePayment(
        portoneApiSecret,
        paymentId,
        "상품 가격 불일치 자동 취소 (진짜미래 운세권)",
      );
      return json(400, {
        success: false,
        code: "AMOUNT_MISMATCH",
        cancelled,
        error: cancelled
          ? "결제 금액이 현재 상품 가격과 달라 결제를 자동 취소했습니다. 페이지를 새로고침한 뒤 다시 결제해 주세요."
          : `유효하지 않은 결제 금액입니다. (${unit}${amount}) 결제가 되었다면 고객센터로 문의해 주세요.`,
      });
    }

    // 4. 지급 — 원장(star_transactions) 먼저 기록해 멱등성을 확보하고, 그 다음 지갑을 원자 증가.
    //    (CHARGE 부분 UNIQUE 인덱스가 있으므로 동시 요청은 23505 로 걸러진다)
    const totalTickets = packageInfo.paid + packageInfo.bonus + packageInfo.probe;
    const purchaseDate = new Date();
    const expiresAt = new Date(purchaseDate);
    expiresAt.setDate(expiresAt.getDate() + 90);

    const transactionData = {
      user_id,
      amount: totalTickets,
      type: "CHARGE",
      description: `운세권 구매: ${packageInfo.name}`,
      related_item_id: ledgerKey || null,
      paid_amount: packageInfo.paid,
      bonus_amount: packageInfo.bonus,
      probe_amount: packageInfo.probe,
      expires_at: expiresAt.toISOString(),
      is_expired: false,
    };

    const { data: insertedTx, error: txError } = await supabaseAdmin
      .from("star_transactions")
      .insert(transactionData)
      .select("id")
      .single();

    if (txError) {
      // UNIQUE 위반 = 동시 요청/재진입 → 이미 처리된 결제
      if (String((txError as any).code) === "23505") {
        const dup = await buildAlreadyProcessed();
        if (dup) return dup;
        return json(200, {
          success: true,
          already_processed: true,
          message: "이미 처리된 결제입니다. 별은 이미 충전되었습니다.",
        });
      }
      console.error("❌ 거래 내역 기록 실패:", txError);
      return json(500, {
        success: false,
        code: "LEDGER_WRITE_FAILED",
        error: "거래 내역 저장에 실패했습니다.",
      });
    }

    // 5. 지갑 원자 증가 (RPC). 실패 시 방금 넣은 원장 행을 삭제해 보상한다.
    let newBalance = { paid_stars: 0, bonus_stars: 0, probe_stars: 0 };
    const { data: walletResult, error: walletRpcError } = await supabaseAdmin.rpc(
      "add_wallet_stars",
      {
        p_user_id: user_id,
        p_paid: packageInfo.paid,
        p_bonus: packageInfo.bonus,
        p_probe: packageInfo.probe,
      },
    );

    if (walletRpcError) {
      // RPC 미배포(마이그레이션 전) 상황 폴백: 기존 read-modify-write 방식
      const rpcMissing =
        String((walletRpcError as any).code) === "PGRST202" ||
        String((walletRpcError as any).code) === "42883" ||
        /add_wallet_stars/.test(String((walletRpcError as any).message ?? ""));

      let fallbackOk = false;
      if (rpcMissing) {
        console.warn("⚠️ add_wallet_stars RPC 미존재 — 구방식(upsert)으로 폴백합니다. 마이그레이션을 적용하세요.");
        const { data: wallet } = await supabaseAdmin
          .from("user_wallets")
          .select("paid_stars, bonus_stars, probe_stars")
          .eq("user_id", user_id)
          .maybeSingle();
        const nextPaid = ((wallet as any)?.paid_stars ?? 0) + packageInfo.paid;
        const nextBonus = ((wallet as any)?.bonus_stars ?? 0) + packageInfo.bonus;
        const nextProbe = ((wallet as any)?.probe_stars ?? 0) + packageInfo.probe;
        const { error: upsertError } = await supabaseAdmin
          .from("user_wallets")
          .upsert(
            {
              user_id,
              paid_stars: nextPaid,
              bonus_stars: nextBonus,
              probe_stars: nextProbe,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        if (!upsertError) {
          fallbackOk = true;
          newBalance = {
            paid_stars: nextPaid,
            bonus_stars: nextBonus,
            probe_stars: nextProbe,
          };
        } else {
          console.error("❌ 지갑 업데이트 폴백 실패:", upsertError);
        }
      }

      if (!fallbackOk) {
        console.error("❌ 지갑 증가 실패 — 원장 행 보상 삭제:", walletRpcError);
        const { error: compensateError } = await supabaseAdmin
          .from("star_transactions")
          .delete()
          .eq("id", (insertedTx as any).id);
        if (compensateError) {
          console.error(
            "🚨 보상 삭제 실패 — 원장에 지급 기록만 남았습니다. 수동 확인 필요:",
            { transactionId: (insertedTx as any).id, compensateError },
          );
        }
        return json(500, {
          success: false,
          code: "WALLET_UPDATE_FAILED",
          error: "별 충전 처리에 실패했습니다. 결제가 되었다면 고객센터로 문의해 주세요.",
        });
      }
    } else {
      newBalance = {
        paid_stars: (walletResult as any)?.paid_stars ?? 0,
        bonus_stars: (walletResult as any)?.bonus_stars ?? 0,
        probe_stars: (walletResult as any)?.probe_stars ?? 0,
      };
    }

    // 6. 친구 추천 이벤트: 이번 결제자가 피추천인이고 생애 첫 결제면 추천인에게 망원경 1개 지급
    const { data: referralResult, error: referralError } = await supabaseAdmin.rpc(
      "grant_referral_reward_if_first_purchase",
      { p_referee_id: user_id },
    );
    if (!referralError && (referralResult as any)?.success) {
      console.log("✅ 추천 보상 지급 완료:", (referralResult as any).referrer_id);
    }

    return json(200, {
      success: true,
      message: "운세권 구매 완료",
      data: {
        paid_stars: packageInfo.paid,
        bonus_stars: packageInfo.bonus,
        probe_stars: packageInfo.probe,
        total_stars: totalTickets,
        new_balance: newBalance,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("❌ [purchase-stars] 예외:", error);
    return json(500, { success: false, code: "INTERNAL_ERROR", error: message });
  }
});
