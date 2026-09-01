import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Max-Age": "86400",
};

// [보안] 수신자는 서버에서 고정한다. 요청 바디의 to는 신뢰하지 않는다.
// (바디로 받으면 공개된 anon 키만으로 임의 주소에 메일을 보낼 수 있다.)
const RECIPIENT = "jupiteradrie@gmail.com";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatKorea(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// related_item_id 접두사로 결제 채널을 판정한다.
//   웹  : purchase-stars     → PortOne merchant_uid / imp_uid
//   IAP : purchase-stars-iap → `iap_{platform}_{purchase_id}`
function resolvePaymentChannel(relatedItemId: unknown) {
  const id = (relatedItemId ?? "").toString();
  if (id.startsWith("iap_ios_")) {
    return { label: "Apple App Store 인앱결제", store: "apple" as const };
  }
  if (id.startsWith("iap_android_")) {
    return { label: "Google Play 인앱결제", store: "google" as const };
  }
  if (id) {
    return { label: "웹 결제 (PortOne / KG이니시스)", store: null };
  }
  return { label: "확인 불가 (거래 식별자 없음)", store: null };
}

const DIVIDER = "━".repeat(40);

serve(async (req) => {
  // CORS preflight 처리
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { subject, type, content, replyTo, userEmail, message, transactionId, reportId } = body;

    // ── 요청자 인증 ──
    // 클라이언트가 보낸 userId/userEmail은 위조 가능하므로 JWT에서 직접 추출한다.
    const jwt = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    let authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null =
      null;

    if (jwt) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          global: { headers: { Authorization: `Bearer ${jwt}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      // anon 키만 실려온 경우 getUser()는 실패한다 → authUser는 null로 남는다.
      const { data } = await userClient.auth.getUser();
      authUser = data?.user ?? null;
    }

    const authName =
      (authUser?.user_metadata?.full_name as string | undefined) ||
      authUser?.email ||
      "알 수 없음";

    // 회신 주소: 사용자가 입력한 값을 쓰되, 없으면 계정 이메일로 폴백
    const replyEmailRaw = (replyTo ?? userEmail ?? content?.userEmail ?? authUser?.email ?? "")
      .toString()
      .trim();
    const replyEmailForResend =
      replyEmailRaw && isValidEmail(replyEmailRaw) ? replyEmailRaw : undefined;

    let emailBody = "";
    let emailSubject = "";

    if (type === "contact") {
      // 문의하기는 비로그인 상태에서도 허용한다.
      const inquiryMessage =
        (typeof message === "string" && message.trim()) || content?.message || "";

      emailSubject = subject || `[문의하기] ${replyEmailRaw || "익명"}`;
      emailBody = `
문의하기 요청이 접수되었습니다.

${DIVIDER}
[문의 정보]
${DIVIDER}

사용자 ID: ${authUser?.id ?? "비로그인"}
이름: ${authUser ? authName : content?.userName ?? "알 수 없음"}
이메일: ${authUser?.email ?? content?.userEmail ?? replyEmailRaw ?? "알 수 없음"}
회신 이메일: ${replyEmailRaw || "미입력"}
제목: ${content?.subject ?? ""}

${DIVIDER}
[문의 내용]
${DIVIDER}

${inquiryMessage}

${DIVIDER}
요청 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
${DIVIDER}
      `.trim();
    } else if (type === "refund") {
      // ── 환불 문의 ──
      // 결제 정보는 클라이언트 입력을 받지 않는다. transactionId만 받아
      // 서버가 DB에서 직접 조회하고, 소유자까지 검증한다.
      if (!authUser) {
        return json(401, {
          success: false,
          error: "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.",
        });
      }

      if (!transactionId && !reportId) {
        return json(400, { success: false, error: "환불할 결제 건을 선택해 주세요." });
      }

      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      // ── 프리미엄 상세 리포트 환불 문의 (premium_reports, 웹 PortOne 결제 전용) ──
      if (reportId) {
        const { data: report, error: reportError } = await admin
          .from("premium_reports")
          .select(
            "id, user_id, created_at, status, sections_done, sections_total, merchant_uid, payment_id, amount, currency, question"
          )
          .eq("id", reportId)
          .maybeSingle();

        if (reportError) {
          console.error("❌ 리포트 결제 건 조회 실패:", reportError);
          return json(500, { success: false, error: "결제 정보를 불러오지 못했습니다." });
        }
        if (!report) {
          return json(404, { success: false, error: "해당 결제 건을 찾을 수 없습니다." });
        }
        if (report.user_id !== authUser.id) {
          console.warn(`⚠️ 타인 리포트 환불 시도: user=${authUser.id}, report=${report.id}`);
          return json(403, { success: false, error: "본인의 결제 건만 환불 요청할 수 있습니다." });
        }

        const statusLabel =
          report.status === "DONE"
            ? "생성 완료 (열람 가능)"
            : report.status === "FAILED"
              ? "생성 실패"
              : `생성 중 (${report.sections_done}/${report.sections_total})`;

        emailSubject = `[환불 문의 - 프리미엄 리포트] ${authUser.email ?? authUser.id}`;
        emailBody = `
환불 문의 요청이 접수되었습니다. (프리미엄 상세 리포트)

${DIVIDER}
[고객 정보]
${DIVIDER}

사용자 ID: ${authUser.id}
이름: ${authName}
계정 이메일: ${authUser.email ?? "알 수 없음"}
회신 이메일: ${replyEmailRaw || "미입력"}

${DIVIDER}
[결제 정보]
${DIVIDER}

결제 수단: 웹 결제 (PortOne / KG이니시스)
상품명: 프리미엄 상세 리포트
결제 금액: ${report.amount?.toLocaleString?.() ?? report.amount} ${report.currency ?? "KRW"}
결제 일시(KST): ${formatKorea(report.created_at)}
결제 일시(UTC): ${report.created_at}
PG 거래 ID: ${report.merchant_uid ?? report.payment_id ?? "없음"}
리포트 ID: ${report.id}
리포트 상태: ${statusLabel}

${DIVIDER}
[환불 사유]
${DIVIDER}

${content?.refundReason || "사유 미입력"}

${DIVIDER}
요청 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
${DIVIDER}
        `.trim();

        // 리포트 환불 문의는 여기서 이메일 본문 구성이 끝났으므로
        // 아래 star_transactions 조회를 건너뛰고 바로 전송 단계로 진행한다.
        const RESEND_API_KEY_REPORT = Deno.env.get("RESEND_API_KEY");
        if (!RESEND_API_KEY_REPORT) {
          console.warn("⚠️ RESEND_API_KEY가 설정되지 않았습니다. 이메일 전송을 건너뜁니다.");
          return json(200, {
            success: true,
            message: "이메일 전송 기능이 설정되지 않았습니다. (개발 모드)",
          });
        }
        const reportResendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY_REPORT}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "onboarding@resend.dev",
            to: [RECIPIENT],
            subject: emailSubject,
            text: emailBody,
            ...(replyEmailForResend ? { reply_to: replyEmailForResend } : {}),
          }),
        });
        if (!reportResendResponse.ok) {
          const errorData = await reportResendResponse.text();
          console.error("Resend API 오류:", errorData);
          throw new Error(`이메일 전송 실패: ${reportResendResponse.status}`);
        }
        const reportResult = await reportResendResponse.json();
        return json(200, {
          success: true,
          message: "이메일이 성공적으로 전송되었습니다.",
          data: reportResult,
        });
      }

      const { data: tx, error: txError } = await admin
        .from("star_transactions")
        .select(
          "id, user_id, type, created_at, description, related_item_id, amount, paid_amount, bonus_amount, probe_amount, expires_at, is_expired"
        )
        .eq("id", transactionId)
        .eq("type", "CHARGE")
        .maybeSingle();

      if (txError) {
        console.error("❌ 결제 건 조회 실패:", txError);
        return json(500, { success: false, error: "결제 정보를 불러오지 못했습니다." });
      }

      if (!tx) {
        return json(404, { success: false, error: "해당 결제 건을 찾을 수 없습니다." });
      }

      // [보안] 남의 거래 ID를 넣어 문의를 위조하는 것을 막는다.
      if (tx.user_id !== authUser.id) {
        console.warn(`⚠️ 타인 거래 환불 시도: user=${authUser.id}, tx=${tx.id}`);
        return json(403, { success: false, error: "본인의 결제 건만 환불 요청할 수 있습니다." });
      }

      const channel = resolvePaymentChannel(tx.related_item_id);

      // 인앱결제는 애플/구글이 환불 주체다. 우리 쪽에서 처리할 수 없으므로 접수하지 않는다.
      if (channel.store) {
        return json(400, {
          success: false,
          error: "인앱결제 건은 앱 스토어를 통해 환불해야 합니다.",
          store: channel.store,
        });
      }

      const consumedNote = tx.is_expired ? "만료됨" : "유효";

      emailSubject = `[환불 문의] ${authUser.email ?? authUser.id}`;
      emailBody = `
환불 문의 요청이 접수되었습니다.

${DIVIDER}
[고객 정보]
${DIVIDER}

사용자 ID: ${authUser.id}
이름: ${authName}
계정 이메일: ${authUser.email ?? "알 수 없음"}
회신 이메일: ${replyEmailRaw || "미입력"}

${DIVIDER}
[결제 정보]
${DIVIDER}

결제 수단: ${channel.label}
상품명: ${tx.description ?? "알 수 없음"}
결제 일시(KST): ${formatKorea(tx.created_at)}
결제 일시(UTC): ${tx.created_at}
PG 거래 ID: ${tx.related_item_id ?? "없음"}
내부 거래 ID: ${tx.id}

지급 운세권: 총 ${tx.amount ?? 0}개 (망원경 ${tx.paid_amount ?? 0} / 나침반 ${
        tx.bonus_amount ?? 0
      } / 탐사선 ${tx.probe_amount ?? 0})
소멸 예정: ${tx.expires_at ? formatKorea(tx.expires_at) : "무제한(기존 정책)"}
상태: ${consumedNote}

※ 결제 금액은 PG 거래 ID로 PortOne / KG이니시스 관리자에서 조회하세요.

${DIVIDER}
[환불 사유]
${DIVIDER}

${content?.refundReason || "사유 미입력"}

${DIVIDER}
요청 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
${DIVIDER}
      `.trim();
    } else {
      return json(400, { success: false, error: `알 수 없는 요청 유형입니다: ${type}` });
    }

    // Resend API를 사용하여 이메일 전송
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY가 설정되지 않았습니다. 이메일 전송을 건너뜁니다.");
      // 개발 환경에서는 성공으로 처리하되 실제 전송은 하지 않음
      return json(200, {
        success: true,
        message: "이메일 전송 기능이 설정되지 않았습니다. (개발 모드)",
      });
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev", // Resend 테스트 도메인 (인증된 도메인으로 변경 필요)
        to: [RECIPIENT],
        subject: emailSubject,
        text: emailBody,
        ...(replyEmailForResend ? { reply_to: replyEmailForResend } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error("Resend API 오류:", errorData);
      throw new Error(`이메일 전송 실패: ${resendResponse.status}`);
    }

    const result = await resendResponse.json();

    return json(200, {
      success: true,
      message: "이메일이 성공적으로 전송되었습니다.",
      data: result,
    });
  } catch (error) {
    console.error("❌ 이메일 전송 오류:", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "이메일 전송 중 오류가 발생했습니다.",
    });
  }
});
