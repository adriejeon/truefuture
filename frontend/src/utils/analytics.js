/**
 * GA4 purchase 이벤트 전송 (GTM dataLayer)
 * - 결제 완료 시점에만 호출. Fire-and-forget, 서비스 로직에 영향 없음.
 * - AdBlock 등으로 dataLayer가 없어도 에러 없이 무시.
 */
export function trackPurchase(payload) {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "purchase",
      transaction_id: payload.transaction_id,
      value: Number(payload.value),
      currency: payload.currency || "KRW",
      items: Array.isArray(payload.items) ? payload.items : [],
    });
  } catch (_) {
    // 광고 차단 등으로 GTM 미로드 시에도 화면/플로우에 영향 없음
  }
}
