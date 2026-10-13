// 결제 customData 에 실리는 자유 텍스트(리포트 질문 등) 복원
//
// PortOne 은 customData 를 KG이니시스 merchantData 로 그대로 넘기는데, 이니시스는 merchantData 에
// 한글을 허용하지 않는다 ("[V023] merchantData 한글 사용 불가"). 그래서 클라이언트는 질문을
// UTF-8 → base64url (ASCII 만) 로 인코딩해 `qe` 에 싣는다 (frontend/src/utils/paymentCustomData.js).
// 예전 결제(평문 `q`)도 그대로 복원할 수 있게 둘 다 받는다.

/** base64url 문자열을 UTF-8 텍스트로 되돌린다. 손상된 값이면 "" */
export function decodeBase64UrlText(encoded: string): string {
  if (typeof encoded !== "string" || !encoded) return "";
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "";
  }
}

/** customData 에서 질문을 복원한다 (`qe` 인코딩 값 우선, 없으면 구버전 평문 `q`). 없으면 "" */
export function decodeCustomQuestion(custom: unknown): string {
  if (!custom || typeof custom !== "object") return "";
  const c = custom as { qe?: unknown; q?: unknown };
  if (typeof c.qe === "string" && c.qe.trim()) {
    const decoded = decodeBase64UrlText(c.qe.trim());
    if (decoded.trim()) return decoded.trim();
  }
  if (typeof c.q === "string") return c.q.trim();
  return "";
}
