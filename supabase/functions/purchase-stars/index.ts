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

    // amount가 없는 경우 (모바일 리다이렉트 등) PortOne API로 결제 정보 조회
    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("⚠️ amount가 없어서 PortOne API로 결제 정보 조회 시작");
      
      const portoneApiKey = Deno.env.get("PORTONE_API_KEY");
      const portoneApiSecret = Deno.env.get("PORTONE_API_SECRET");

      console.log("PortOne API 키 확인:", {
        hasApiKey: !!portoneApiKey,
        hasApiSecret: !!portoneApiSecret,
      });

      if (!portoneApiKey || !portoneApiSecret) {
        console.error("❌ PortOne API 키가 설정되지 않았습니다.");
        return new Response(
          JSON.stringify({
            success: false,
            error: "서버 설정 오류: PortOne API 키가 필요합니다. 관리자에게 문의하세요.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 1. imp_uid가 없어도 merchant_uid가 있으면 진행 허용
      if (!imp_uid && !merchant_uid) {
        console.error("❌ imp_uid와 merchant_uid 모두 없음");
        return new Response(
          JSON.stringify({
            success: false,
            error: "결제 정보 조회를 위해 imp_uid 또는 merchant_uid가 필요합니다.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // imp_uid 형식: imp_ 접두사(아임포트) 또는 UUID(txId, 모바일 리다이렉트) 허용
      const isUuid = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (
        imp_uid &&
        !imp_uid.startsWith("imp_") &&
        !isUuid(imp_uid)
      ) {
        console.error("❌ 잘못된 imp_uid 형식:", imp_uid);
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
        // 2. imp_uid가 있으면 해당 ID로 조회, 없으면 merchant_uid로 조회. txId(UUID)는 모바일 리다이렉트용
        const useMerchantUid = !imp_uid && merchant_uid;
        const impUidIsTxId = imp_uid && isUuid(imp_uid);
        const paymentId = imp_uid || merchant_uid;
        
        console.log(`🔍 아임포트(V1) API로 결제 정보 조회 시작`);
        console.log(`   - imp_uid: ${imp_uid || "없음"}${impUidIsTxId ? " (txId)" : ""}`);
        console.log(`   - merchant_uid: ${merchant_uid || "없음"}`);
        console.log(`   - 조회 방식: ${useMerchantUid ? "merchant_uid (find)" : "imp_uid/ID (일반)"}`);
        
        // V1 API: 인증 토큰 발급
        console.log("1️⃣ 아임포트 인증 토큰 발급 중...");
        const tokenResponse = await fetch("https://api.iamport.kr/users/getToken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imp_key: portoneApiKey,
            imp_secret: portoneApiSecret,
          }),
        });

        console.log("인증 응답 상태:", tokenResponse.status);

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("인증 실패 응답:", errorText);
          throw new Error(`아임포트 인증 실패 (${tokenResponse.status})`);
        }

        const tokenData = await tokenResponse.json();
        console.log("인증 응답 데이터:", JSON.stringify(tokenData, null, 2));

        // V1 API 응답: code가 0이어야 성공
        if (tokenData.code !== 0) {
          console.error("인증 실패:", tokenData.message || "알 수 없는 오류");
          throw new Error(`아임포트 인증 실패: ${tokenData.message || "알 수 없는 오류"}`);
        }

        const accessToken = tokenData.response?.access_token;
        if (!accessToken) {
          console.error("토큰이 응답에 없음:", tokenData);
          throw new Error("인증 토큰을 받을 수 없습니다.");
        }

        console.log("✅ 인증 성공, 토큰 발급됨");

        // 3. V1 API: 결제 정보 조회 (imp_uid 또는 merchant_uid). txId(UUID)로 404면 merchant_uid로 재시도
        let paymentEndpoint = useMerchantUid
          ? `https://api.iamport.kr/payments/find/${merchant_uid}`
          : `https://api.iamport.kr/payments/${imp_uid}`;
        
        console.log(`2️⃣ 결제 정보 조회 중: ${paymentEndpoint}`);
        let paymentResponse = await fetch(
          paymentEndpoint,
          {
            method: "GET",
            headers: {
              Authorization: accessToken,
            },
          }
        );

        console.log("결제 조회 응답 상태:", paymentResponse.status);

        const responseText = await paymentResponse.text();
        let paymentData: { code?: number; message?: string; response?: unknown } = {};
        try {
          paymentData = JSON.parse(responseText);
        } catch {
          paymentData = {};
        }

        // txId(UUID)로 조회 시 404/존재하지 않는 결제 → merchant_uid로 재시도
        if (
          (!paymentResponse.ok || (paymentData.code !== 0 && responseText.includes("존재하지 않는"))) &&
          impUidIsTxId &&
          merchant_uid
        ) {
          const fallbackEndpoint = `https://api.iamport.kr/payments/find/${merchant_uid}`;
          console.log(`⚠️ txId로 조회 실패, merchant_uid로 재시도: ${fallbackEndpoint}`);
          paymentResponse = await fetch(
            fallbackEndpoint,
            {
              method: "GET",
              headers: { Authorization: accessToken },
            }
          );
          const fallbackText = await paymentResponse.text();
          try {
            paymentData = JSON.parse(fallbackText);
          } catch {
            paymentData = {};
          }
        }

        if (!paymentResponse.ok) {
          console.error("결제 조회 실패 응답:", responseText);
          throw new Error(`결제 정보 조회 실패 (${paymentResponse.status})`);
        }

        // V1 API 응답: code가 0이어야 성공
        if (paymentData.code !== 0) {
          console.error("결제 조회 실패:", paymentData.message || "알 수 없는 오류");
          throw new Error(`결제 정보 조회 실패: ${paymentData.message || "알 수 없는 오류"}`);
        }

        // merchant_uid로 조회한 경우 response가 배열일 수 있음
        let payment = paymentData.response;
        
        // 배열인 경우 첫 번째 항목 사용
        if (Array.isArray(payment)) {
          if (payment.length === 0) {
            console.error("결제 정보가 응답에 없음 (빈 배열):", paymentData);
            throw new Error("결제 정보를 찾을 수 없습니다.");
          }
          payment = payment[0];
          console.log(`✅ merchant_uid로 조회: ${payment.length}개 중 첫 번째 항목 사용`);
        }
        
        if (!payment) {
          console.error("결제 정보가 응답에 없음:", paymentData);
          throw new Error("결제 정보를 찾을 수 없습니다.");
        }

        // 결제 상태 확인
        console.log("3️⃣ 결제 상태 확인:", payment.status);
        if (payment.status !== "paid") {
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

        // merchant_uid로 조회한 경우 응답에서 imp_uid 추출
        if (useMerchantUid && payment.imp_uid) {
          imp_uid = payment.imp_uid;
          console.log(`✅ merchant_uid로 조회하여 imp_uid 획득: ${imp_uid}`);
        }

        // 결제 금액 추출 (V1: response.amount)
        amount = payment.amount;
        console.log("4️⃣ 결제 금액 추출:", amount);
        
        if (!amount || amount <= 0) {
          console.error("유효하지 않은 금액:", payment.amount);
          throw new Error("유효한 결제 금액을 찾을 수 없습니다.");
        }

        console.log(`✅ 결제 금액 확인 완료: ${amount}원`);
      } catch (error) {
        console.error("❌ PortOne API 조회 실패:", error);
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

    // 5. 거래 내역 기록 (유효기간 설정: 결제일로부터 1년)
    console.log("5️⃣ 거래 내역 기록 중...");
    const totalStars = packageInfo.paid + packageInfo.bonus;
    const purchaseDate = new Date();
    const expiresAt = new Date(purchaseDate);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const transactionData = {
      user_id,
      amount: totalStars,
      type: "CHARGE",
      description: `패키지 구매: ${packageInfo.name}`,
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
      message: "충전 완료",
      data: {
        paid_stars: packageInfo.paid,
        bonus_stars: packageInfo.bonus,
        total_stars: totalStars,
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
