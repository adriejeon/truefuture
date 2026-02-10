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

// 패키지 정의 (가격 → 이름, 유료별, 보너스별)
const PACKAGES: Record<
  number,
  { name: string; paid: number; bonus: number }
> = {
  1100: { name: "유성 (Meteor)", paid: 10, bonus: 0 },
  3300: { name: "혜성 (Comet)", paid: 30, bonus: 1 },
  5500: { name: "행성 (Planet)", paid: 50, bonus: 3 },
  11000: { name: "은하수 (Galaxy)", paid: 100, bonus: 15 },
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

    const body = await req.json().catch(() => ({}));
    let { imp_uid, merchant_uid, amount, user_id } = body;

    if (!user_id || typeof user_id !== "string" || user_id.trim() === "") {
      return new Response(
        JSON.stringify({ success: false, error: "user_id는 필수입니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // amount가 없는 경우 (모바일 리다이렉트 등) PortOne API로 결제 정보 조회
    if (!amount || typeof amount !== "number" || amount <= 0) {
      const portoneApiKey = Deno.env.get("PORTONE_API_KEY");
      const portoneApiSecret = Deno.env.get("PORTONE_API_SECRET");

      if (!portoneApiKey || !portoneApiSecret) {
        console.error("❌ PortOne API 키가 설정되지 않았습니다.");
        return new Response(
          JSON.stringify({
            success: false,
            error: "서버 설정 오류: PortOne API 키가 필요합니다.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!imp_uid && !merchant_uid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "결제 ID(imp_uid 또는 merchant_uid)가 필요합니다.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        // PortOne API로 결제 정보 조회
        console.log(`🔍 PortOne API로 결제 정보 조회: ${imp_uid || merchant_uid}`);
        
        // V2 API: 인증 토큰 발급
        const tokenResponse = await fetch("https://api.portone.io/login/api-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: portoneApiKey,
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error("PortOne 인증 실패");
        }

        const { accessToken } = await tokenResponse.json();

        // V2 API: 결제 정보 조회
        const paymentId = imp_uid || merchant_uid;
        const paymentResponse = await fetch(
          `https://api.portone.io/payments/${paymentId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!paymentResponse.ok) {
          throw new Error("결제 정보 조회 실패");
        }

        const paymentData = await paymentResponse.json();
        console.log("📦 PortOne 결제 정보:", paymentData);

        // 결제 상태 확인
        if (paymentData.status !== "PAID") {
          return new Response(
            JSON.stringify({
              success: false,
              error: `결제가 완료되지 않았습니다. (상태: ${paymentData.status})`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // 결제 금액 추출
        amount = paymentData.amount?.total;
        
        if (!amount || amount <= 0) {
          throw new Error("유효한 결제 금액을 찾을 수 없습니다.");
        }

        console.log(`✅ 결제 금액 확인: ${amount}원`);
      } catch (error) {
        console.error("❌ PortOne API 조회 실패:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "결제 정보 확인에 실패했습니다.",
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
      const { data: existingTx } = await supabaseAdmin
        .from("star_transactions")
        .select("id")
        .eq("related_item_id", paymentId)
        .maybeSingle();

      if (existingTx) {
        console.log(`⚠️ 이미 처리된 결제: ${paymentId}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: "이미 처리된 결제입니다.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // 2. 패키지 검증
    const packageInfo = PACKAGES[amount];
    if (!packageInfo) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "유효하지 않은 결제 금액입니다.",
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
      .select("paid_stars, bonus_stars")
      .eq("user_id", user_id)
      .maybeSingle();

    if (walletError) {
      console.error("❌ [purchase-stars] 지갑 조회 실패:", walletError);
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
    const newPaid = currentPaid + packageInfo.paid;
    const newBonus = currentBonus + packageInfo.bonus;

    // 4. 지갑 업데이트 (Upsert: 없으면 생성, 있으면 갱신)
    const { error: updateError } = await supabaseAdmin
      .from("user_wallets")
      .upsert(
        {
          user_id,
          paid_stars: newPaid,
          bonus_stars: newBonus,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (updateError) {
      console.error("❌ [purchase-stars] 지갑 업데이트 실패:", updateError);
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

    // 5. 거래 내역 기록 (유효기간 설정: 결제일로부터 1년)
    const totalStars = packageInfo.paid + packageInfo.bonus;
    const purchaseDate = new Date();
    const expiresAt = new Date(purchaseDate);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const { error: txError } = await supabaseAdmin
      .from("star_transactions")
      .insert({
        user_id,
        amount: totalStars,
        type: "CHARGE",
        description: `패키지 구매: ${packageInfo.name}`,
        related_item_id: merchant_uid ?? imp_uid ?? null,
        paid_amount: packageInfo.paid,
        bonus_amount: packageInfo.bonus,
        expires_at: expiresAt.toISOString(),
        is_expired: false,
      });

    if (txError) {
      console.error("❌ [purchase-stars] 거래 내역 기록 실패:", txError);
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

    return new Response(
      JSON.stringify({
        success: true,
        message: "충전 완료",
        data: {
          paid_stars: packageInfo.paid,
          bonus_stars: packageInfo.bonus,
          total_stars: totalStars,
          new_balance: { paid_stars: newPaid, bonus_stars: newBonus },
        },
      }),
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
