import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { to, subject, type, content } = await req.json();

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ success: false, error: "to와 subject는 필수입니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 이메일 본문 생성
    let emailBody = "";
    
    if (type === "contact") {
      // 문의하기 이메일
      emailBody = `
문의하기 요청이 접수되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[문의 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이름: ${content.userName}
이메일: ${content.userEmail}
제목: ${content.subject}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[문의 내용]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${content.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
요청 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
    } else if (type === "refund") {
      // 환불 문의 이메일
      emailBody = `
환불 문의 요청이 접수되었습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[고객 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이름: ${content.userName}
이메일: ${content.userEmail}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[결제 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

결제 수단: ${content.paymentMethod}
결제 금액: ${content.paymentAmount}
결제 일자: ${content.paymentDate}
거래 ID: ${content.transactionId || "미입력"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[환불 사유]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${content.refundReason || "사유 미입력"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
요청 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
    }

    // Resend API를 사용하여 이메일 전송
    // 환경 변수에서 Resend API 키 가져오기
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    if (!RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY가 설정되지 않았습니다. 이메일 전송을 건너뜁니다.");
      // 개발 환경에서는 성공으로 처리하되 실제 전송은 하지 않음
      return new Response(
        JSON.stringify({
          success: true,
          message: "이메일 전송 기능이 설정되지 않았습니다. (개발 모드)",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev", // Resend 테스트 도메인 (인증된 도메인으로 변경 필요)
        to: [to],
        subject: subject,
        text: emailBody,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error("Resend API 오류:", errorData);
      throw new Error(`이메일 전송 실패: ${resendResponse.status}`);
    }

    const result = await resendResponse.json();
    console.log("✅ 이메일 전송 성공:", result);

    return new Response(
      JSON.stringify({
        success: true,
        message: "이메일이 성공적으로 전송되었습니다.",
        data: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ 이메일 전송 오류:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "이메일 전송 중 오류가 발생했습니다.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
