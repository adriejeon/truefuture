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

// 패키지 정의 (가격 → 이름, 일반 운세권, 데일리 운세권)
// paid = 일반 운세권(Standard Ticket), bonus = 데일리 운세권(Daily Ticket)
const PACKAGES: Record<
  number,
  { name: string; paid: number; bonus: number }
> = {
  990: { name: "망원경 1개 (Ticket_1)", paid: 1, bonus: 0 },
  2900: { name: "망원경 3개 (Ticket_3)", paid: 3, bonus: 1 },
  4950: { name: "망원경 5개 (Ticket_5)", paid: 5, bonus: 3 },
  1900: { name: "나침반 7개 (Daily_7)", paid: 0, bonus: 7 },
  3500: { name: "나침반 14개 (Daily_14)", paid: 0, bonus: 14 },
  1990: { name: "종합 운세 (Grand_Fortune)", paid: 1, bonus: 0 },
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

    console.log("=== purchase-stars 함수 시작 ===");
    console.log("요청 본문:", { imp_uid, merchant_uid, amount, user_id });

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

    // amount가 없는 경우 (모바일 리다이렉트 등) PortOne V2 API로 결제 정보 조회
    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("⚠️ amount가 없어서 PortOne V2 API로 결제 정보 조회 시작");
      
      const portoneApiSecret = Deno.env.get("PORTONE_API_SECRET");

      console.log("PortOne V2 API Secret 확인:", {
        hasApiSecret: !!portoneApiSecret,
      });

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

      // 1. imp_uid(또는 txId)가 없어도 merchant_uid가 있으면 진행 허용
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

      // imp_uid(txId) 형식: imp_ 접두사, order_ 접두사(PortOne V2 paymentId), 또는 UUID 허용
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
        // 2. PortOne V2 API로 결제 정보 조회 (txId 우선, 없으면 merchant_uid는 V2에서 직접 조회 불가이므로 에러)
        const paymentId = imp_uid || merchant_uid;
        
        console.log(`🔍 PortOne V2 API로 결제 정보 조회 시작`);
        console.log(`   - 결제 ID: ${paymentId}`);
        console.log(`   - imp_uid: ${imp_uid || "없음"}`);
        console.log(`   - merchant_uid: ${merchant_uid || "없음"}`);
        
        // V2 API: 결제 정보 조회 (Authorization: PortOne {API_SECRET})
        const paymentEndpoint = `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`;
        
        console.log(`1️⃣ 결제 정보 조회 중: ${paymentEndpoint}`);
        const paymentResponse = await fetch(paymentEndpoint, {
          method: "GET",
          headers: {
            Authorization: `PortOne ${portoneApiSecret}`,
          },
        });

        console.log("결제 조회 응답 상태:", paymentResponse.status);

        if (!paymentResponse.ok) {
          const errorText = await paymentResponse.text();
          console.error("결제 조회 실패 응답:", errorText);
          throw new Error(`결제 정보 조회 실패 (${paymentResponse.status}): ${errorText}`);
        }

        const payment = await paymentResponse.json();
        console.log("📦 PortOne V2 결제 정보:", JSON.stringify(payment, null, 2));

        // 결제 상태 확인 (V2: status가 "PAID"이어야 함)
        console.log("2️⃣ 결제 상태 확인:", payment.status);
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

        // V2에서 imp_uid가 없었다면 응답의 id를 사용
        if (!imp_uid && payment.id) {
          imp_uid = payment.id;
          console.log(`✅ 응답에서 결제 ID 획득: ${imp_uid}`);
        }

        // 결제 금액 추출 (V2: amount.total)
        amount = payment.amount?.total;
        console.log("3️⃣ 결제 금액 추출:", amount);
        
        if (!amount || amount <= 0) {
          console.error("유효하지 않은 금액:", payment.amount);
          throw new Error("유효한 결제 금액을 찾을 수 없습니다.");
        }

        console.log(`✅ 결제 금액 확인 완료: ${amount}원`);
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
    } else {
      console.log(`✅ amount가 제공됨: ${amount}원`);
    }

    // Admin 클라이언트 생성 (Service Role Key로 RLS 우회)
    console.log("🔧 Supabase Admin 클라이언트 생성");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. 중복 결제 방지: 이미 처리된 결제인지 확인
    const paymentId = imp_uid || merchant_uid;
    console.log(`1️⃣ 중복 결제 확인: ${paymentId}`);
    
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
        console.log(`⚠️ 이미 처리된 결제: ${paymentId}`, existingTx);
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
      console.log("✅ 중복 결제 아님");
    }

    // 2. 패키지 검증
    console.log(`2️⃣ 패키지 검증: ${amount}원`);
    const packageInfo = PACKAGES[amount];
    
    if (!packageInfo) {
      console.error(`❌ 유효하지 않은 금액: ${amount}원`);
      console.error("사용 가능한 패키지:", Object.keys(PACKAGES));
      return new Response(
        JSON.stringify({
          success: false,
          error: `유효하지 않은 결제 금액입니다. (${amount}원)`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    console.log("✅ 패키지 확인:", packageInfo);

    // 3. 현재 지갑 조회
    console.log(`3️⃣ 사용자 지갑 조회: ${user_id}`);
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("user_wallets")
      .select("paid_stars, bonus_stars")
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
    const newPaid = currentPaid + packageInfo.paid;
    const newBonus = currentBonus + packageInfo.bonus;
    
    console.log("현재 잔액:", { currentPaid, currentBonus });
    console.log("충전 후 잔액:", { newPaid, newBonus });

    // 4. 지갑 업데이트 (Upsert: 없으면 생성, 있으면 갱신)
    console.log("4️⃣ 지갑 업데이트 중...");
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
    
    console.log("✅ 지갑 업데이트 완료");

    // 5. 거래 내역 기록 (유효기간 설정: 결제일로부터 30일)
    console.log("5️⃣ 거래 내역 기록 중...");
    const totalTickets = packageInfo.paid + packageInfo.bonus;
    const purchaseDate = new Date();
    const expiresAt = new Date(purchaseDate);
    expiresAt.setDate(expiresAt.getDate() + 30);

    const transactionData = {
      user_id,
      amount: totalTickets,
      type: "CHARGE",
      description: `운세권 구매: ${packageInfo.name}`,
      related_item_id: merchant_uid ?? imp_uid ?? null,
      paid_amount: packageInfo.paid,
      bonus_amount: packageInfo.bonus,
      expires_at: expiresAt.toISOString(),
      is_expired: false,
    };
    
    console.log("거래 내역 데이터:", transactionData);

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
    
    console.log("✅ 거래 내역 기록 완료");

    const successResponse = {
      success: true,
      message: "운세권 구매 완료",
      data: {
        paid_stars: packageInfo.paid,
        bonus_stars: packageInfo.bonus,
        total_stars: totalTickets,
        new_balance: { paid_stars: newPaid, bonus_stars: newBonus },
      },
    };
    
    console.log("=== 처리 완료 ===");
    console.log("응답 데이터:", successResponse);

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
