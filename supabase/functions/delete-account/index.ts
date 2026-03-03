import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authorization 헤더에서 JWT 토큰 추출
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "인증 정보가 없습니다." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Authorization 헤더에서 "Bearer " 제거하여 순수 JWT 토큰 추출
    const token = authHeader.replace("Bearer ", "");

    // Supabase 환경 변수 가져오기
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // PROJECT_ANON_KEY를 우선 사용하고, 없으면 SUPABASE_ANON_KEY 사용
    const supabaseAnonKey = Deno.env.get("PROJECT_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // 디버깅: 로드된 환경 변수 확인 (키는 앞 5글자만 표시)
    const maskedAnonKey = supabaseAnonKey 
      ? `${supabaseAnonKey.substring(0, 5)}...` 
      : "없음";
    console.log("🔍 환경 변수 확인:", {
      supabaseUrl,
      supabaseAnonKey: maskedAnonKey,
    });

    // 사용자 인증 클라이언트 초기화 (JWT 토큰 검증용)
    // ANON_KEY를 사용하고 Authorization 헤더를 전달하여 사용자 정보 가져오기
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // 실제 유저 정보 검증 (토큰을 명시적으로 전달)
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      console.error("❌ 유저 토큰 검증 실패:", authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "인증에 실패했습니다.",
          details: authError?.message || "Invalid user token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const user_id = user.id;
    console.log("✅ 유저 인증 성공:", user_id);
    console.log("🗑️ 회원 탈퇴 시작:", user_id);

    // Supabase Admin 클라이언트 생성 (DB 삭제용)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 0. 재가입 어뷰징 방지: identity_hash 계산 후 deleted_users_hash에 저장 (계정 삭제 전)
    const { data: identityHash, error: hashError } = await supabaseAdmin.rpc(
      "compute_identity_hash",
      { p_user_id: user_id }
    );
    if (hashError) {
      console.error("❌ identity_hash 계산 실패:", hashError);
      throw new Error("탈퇴 처리 중 식별 정보 저장에 실패했습니다.");
    }
    if (identityHash && typeof identityHash === "string") {
      const { error: insertHashError } = await supabaseAdmin
        .from("deleted_users_hash")
        .upsert(
          { identity_hash: identityHash, deleted_at: new Date().toISOString() },
          { onConflict: "identity_hash" }
        );
      if (insertHashError) {
        console.error("❌ deleted_users_hash INSERT 실패:", insertHashError);
        throw new Error("탈퇴 이력 저장에 실패했습니다.");
      }
      console.log("✅ 탈퇴 식별 해시 저장 완료");
    }

    // 1. user_wallets에서 데이터 삭제
    const { error: walletError } = await supabaseAdmin
      .from("user_wallets")
      .delete()
      .eq("user_id", user_id);

    if (walletError) {
      console.error("❌ user_wallets 삭제 실패:", walletError);
      throw new Error("지갑 데이터 삭제 실패");
    }

    // 2. star_transactions에서 데이터 삭제
    const { error: transactionError } = await supabaseAdmin
      .from("star_transactions")
      .delete()
      .eq("user_id", user_id);

    if (transactionError) {
      console.error("❌ star_transactions 삭제 실패:", transactionError);
      throw new Error("거래 내역 삭제 실패");
    }

    // 3. auth.users에서 사용자 삭제 (Service Role Key 필요)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteError) {
      console.error("❌ 사용자 삭제 실패:", deleteError);
      throw new Error("사용자 계정 삭제 실패");
    }

    console.log("✅ 회원 탈퇴 완료:", user_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "회원 탈퇴가 완료되었습니다.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ 회원 탈퇴 오류:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "회원 탈퇴 처리 중 오류가 발생했습니다.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
