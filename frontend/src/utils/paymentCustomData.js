// 결제 customData 에 자유 텍스트를 실을 때 쓰는 인코딩
//
// PortOne 은 customData 를 KG이니시스 merchantData 로 그대로 넘기는데, 이니시스는 merchantData 에
// 한글을 허용하지 않는다 ("[V023] merchantData 한글 사용 불가"). 그래서 한글이 들어갈 수 있는 값은
// UTF-8 → base64url (A-Z a-z 0-9 - _ 만) 로 바꿔 싣는다.
// 서버 복원: supabase/functions/_shared/customData.ts (decodeCustomQuestion)

/** UTF-8 텍스트를 base64url 문자열로 바꾼다 (패딩 없음). 빈 값이면 "" */
export function encodeTextForCustomData(text) {
  const value = String(text ?? "");
  if (!value) return "";
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
