// Supabase Edge Function - 진짜미래 결제: 별 충전 처리 (포트원 결제 완료 후 호출)

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "서버 설정 오류: Supabase 환경 변수가 필요합니다.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // [보안] JWT에서 인증된 user_id 추출 — body.user_id를 무조건 신뢰하지 않음
    const authHeader = req.headers.get("Authorization");
    let authenticatedUserId: string | null = null;
    if (authHeader) {
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: jwtUser } } = await supabaseAuth.auth.getUser(token);
      authenticatedUserId = jwtUser?.id ?? null;
    }

    const body = await req.json().catch(() => ({}));
    let { imp_uid, merchant_uid, amount, user_id, currency, package_id } = body;
    currency = (currency || "KRW").toUpperCase();

    if (!user_id || typeof user_id !== "string" || user_id.trim() === "") {
      console.error("❌ user_id 누락");
      return new Response(
        JSON.stringify({ success: false, error: "user_id는 필수입니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // [보안] JWT user_id와 body.user_id 불일치 시 거부
    if (authenticatedUserId && authenticatedUserId !== user_id) {
      console.error(`❌ user_id 불일치: JWT=${authenticatedUserId}, body=${user_id}`);
      return new Response(
        JSON.stringify({ success: false, error: "인증된 사용자 정보가 일치하지 않습니다." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // [보안] 항상 PortOne V2 API로 실제 결제 금액을 검증
    // (프론트에서 보낸 amount를 신뢰하지 않고 서버 사이드 검증)
    {
      const portoneApiSecret = Deno.env.get("PORTONE_API_SECRET");

      if (!portoneApiSecret) {
        console.error("❌ PortOne V2 API Secret이 설정되지 않았습니다.");
        return new Response(
          JSON.stringify({
            success: false,
            error: "서버 설정 오류: PortOne V2 API Secret이 필요합니다. 관리자에게 문의하세요.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!imp_uid && !merchant_uid) {
        console.error("❌ imp_uid와 merchant_uid 모두 없음");
        return new Response(
          JSON.stringify({
            success: false,
            error: "결제 정보 조회를 위해 결제 ID(txId 또는 imp_uid) 또는 merchant_uid가 필요합니다.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const isUuid = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (
        imp_uid &&
        !imp_uid.startsWith("imp_") &&
        !imp_uid.startsWith("order_") &&
        !isUuid(imp_uid)
      ) {
        console.error("❌ 잘못된 결제 ID 형식:", imp_uid);
        return new Response(
          JSON.stringify({
            success: false,
            error: "잘못된 결제 정보 형식입니다.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        const verifyPaymentId = imp_uid || merchant_uid;
        const paymentEndpoint = `https://api.portone.io/payments/${encodeURIComponent(verifyPaymentId)}`;

        const paymentResponse = await fetch(paymentEndpoint, {
          method: "GET",
          headers: {
            Authorization: `PortOne ${portoneApiSecret}`,
          },
        });

        if (!paymentResponse.ok) {
          const errorText = await paymentResponse.text();
          console.error("결제 조회 실패 응답:", errorText);
          throw new Error(`결제 정보 조회 실패 (${paymentResponse.status}): ${errorText}`);
        }

        const payment = await paymentResponse.json();

        if (payment.status !== "PAID") {
          console.error(`결제 미완료 상태: ${payment.status}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `결제가 완료되지 않았습니다. (상태: ${payment.status})`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        if (!imp_uid && payment.id) {
          imp_uid = payment.id;
        }

        // [보안] PortOne API 응답의 실제 결제 금액을 사용 (프론트 전송값 무시)
        const verifiedAmount = payment.amount?.total;

        if (!verifiedAmount || verifiedAmount <= 0) {
          console.error("유효하지 않은 금액:", payment.amount);
          throw new Error("유효한 결제 금액을 찾을 수 없습니다.");
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
          const expectedAmount = currency === "USD" ? clientAmount : clientAmount;
          if (Math.abs(amount - expectedAmount) > 0.01) {
            console.warn(`⚠️ 금액 불일치 감지: 클라이언트=${clientAmount}, 실제=${amount} (${currency})`);
          }
        }
      } catch (error) {
        console.error("❌ PortOne V2 API 조회 실패:", error);
        console.error("에러 상세:", error instanceof Error ? error.stack : error);
        return new Response(
          JSON.stringify({
            success: false,
            error: `결제 정보 확인에 실패했습니다. ${
              error instanceof Error ? error.message : "알 수 없는 오류"
            }`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Admin 클라이언트 생성 (Service Role Key로 RLS 우회)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. 중복 결제 방지: 이미 처리된 결제인지 확인
    const paymentId = imp_uid || merchant_uid;

    if (paymentId) {
      const { data: existingTx, error: checkError } = await supabaseAdmin
        .from("star_transactions")
        .select("id")
        .eq("related_item_id", paymentId)
        .maybeSingle();

      if (checkError) {
        console.error("중복 결제 확인 중 오류:", checkError);
      }

      if (existingTx) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "이미 처리된 결제입니다. 별은 이미 충전되었습니다.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // 2. 패키지 검증 (통화에 따라 KRW / USD 조회 분기)
    let packageInfo: { name: string; paid: number; bonus: number; probe: number } | undefined;

    if (currency === "USD") {
      if (package_id && PACKAGES_USD_BY_ID[package_id]) {
        // package_id 기반 조회 (ticket_3/probe_1 $2.99 충돌 해소)
        const candidate = PACKAGES_USD_BY_ID[package_id];
        if (Math.abs(candidate.priceUsd - amount) > 0.01) {
          console.error(`❌ USD 금액 불일치: package_id=${package_id}, 기대=${candidate.priceUsd}, 실제=${amount}`);
          return new Response(
            JSON.stringify({ success: false, error: "결제 금액이 패키지 가격과 일치하지 않습니다." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        packageInfo = candidate;
      } else {
        // fallback: 금액 키로 조회 (package_id 미전달 시)
        packageInfo = PACKAGES_USD[amount];
      }
    } else {
      packageInfo = PACKAGES[amount];
    }

    if (!packageInfo) {
      const unit = currency === "USD" ? "$" : "₩";
      console.error(`❌ 유효하지 않은 금액: ${unit}${amount} (currency: ${currency})`);
      console.error("사용 가능한 패키지:", currency === "USD" ? Object.keys(PACKAGES_USD_BY_ID) : Object.keys(PACKAGES));
      return new Response(
        JSON.stringify({
          success: false,
          error: `유효하지 않은 결제 금액입니다. (${unit}${amount})`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. 현재 지갑 조회
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("user_wallets")
      .select("paid_stars, bonus_stars, probe_stars")
      .eq("user_id", user_id)
      .maybeSingle();

    if (walletError) {
      console.error("❌ 지갑 조회 실패:", walletError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "지갑 조회에 실패했습니다.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const currentPaid = wallet?.paid_stars ?? 0;
    const currentBonus = wallet?.bonus_stars ?? 0;
    const currentProbe = wallet?.probe_stars ?? 0;
    const newPaid = currentPaid + packageInfo.paid;
    const newBonus = currentBonus + packageInfo.bonus;
    const newProbe = currentProbe + packageInfo.probe;

    // 4. 지갑 업데이트 (Upsert: 없으면 생성, 있으면 갱신)
    const { error: updateError } = await supabaseAdmin
      .from("user_wallets")
      .upsert(
        {
          user_id,
          paid_stars: newPaid,
          bonus_stars: newBonus,
          probe_stars: newProbe,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (updateError) {
      console.error("❌ 지갑 업데이트 실패:", updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "별 충전 처리에 실패했습니다.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. 거래 내역 기록 (유효기간 설정: 결제일로부터 90일/3개월)
    const totalTickets = packageInfo.paid + packageInfo.bonus + packageInfo.probe;
    const purchaseDate = new Date();
    const expiresAt = new Date(purchaseDate);
    expiresAt.setDate(expiresAt.getDate() + 90);

    const transactionData = {
      user_id,
      amount: totalTickets,
      type: "CHARGE",
      description: `운세권 구매: ${packageInfo.name}`,
      related_item_id: merchant_uid ?? imp_uid ?? null,
      paid_amount: packageInfo.paid,
      bonus_amount: packageInfo.bonus,
      probe_amount: packageInfo.probe,
      expires_at: expiresAt.toISOString(),
      is_expired: false,
    };

    const { error: txError } = await supabaseAdmin
      .from("star_transactions")
      .insert(transactionData);

    if (txError) {
      console.error("❌ 거래 내역 기록 실패:", txError);
      // 지갑은 이미 업데이트됨 → 로그만 남기고 성공으로 응답하거나, 운영 정책에 따라 롤백 가능
      return new Response(
        JSON.stringify({
          success: false,
          error: "거래 내역 저장에 실패했습니다.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6. 친구 추천 이벤트: 이번 결제자가 피추천인이고 생애 첫 결제면 추천인에게 망원경 1개 지급
    const { data: referralResult, error: referralError } = await supabaseAdmin.rpc(
      "grant_referral_reward_if_first_purchase",
      { p_referee_id: user_id }
    );
    if (!referralError && referralResult?.success) {
      console.log("✅ 추천 보상 지급 완료:", referralResult.referrer_id);
    }

    const successResponse = {
      success: true,
      message: "운세권 구매 완료",
      data: {
        paid_stars: packageInfo.paid,
        bonus_stars: packageInfo.bonus,
        probe_stars: packageInfo.probe,
        total_stars: totalTickets,
        new_balance: { paid_stars: newPaid, bonus_stars: newBonus, probe_stars: newProbe },
      },
    };

    return new Response(
      JSON.stringify(successResponse),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("❌ [purchase-stars] 예외:", error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
