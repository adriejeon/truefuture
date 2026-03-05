/**
 * get-fortune 엣지 함수를 fetch + SSE 스트리밍으로 호출합니다.
 * Authorization 헤더에 세션 토큰을 넣고, response.body.getReader()로 청크를 읽어
 * onChunk / onDone 콜백으로 전달합니다.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase 클라이언트
 * @param {object} requestBody - POST body (fortuneType, birthDate, lat, lng 등)
 * @param {{ onChunk: (text: string) => void, onDone: (payload: { shareId?: string | null, fullText?: string, interpretation?: string, fullData?: any, debug?: object }) => void, onError?: (err: Error) => void }} callbacks
 * @returns {Promise<void>}
 */
export async function invokeGetFortuneStream(supabase, requestBody, callbacks) {
  const { onChunk, onDone, onError } = callbacks;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    const err = new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");
    onError?.(err);
    throw err;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    const err = new Error("로그인이 필요합니다.");
    onError?.(err);
    throw err;
  }

  const url = `${supabaseUrl}/functions/v1/get-fortune`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(requestBody),
  });

  const contentType = response.headers.get("Content-Type") || "";

  if (!response.ok) {
    const text = await response.text();
    let message = response.statusText;
    try {
      const json = JSON.parse(text);
      if (json?.error) message = json.error;
    } catch (_) {}
    const err = new Error(message || `서버 오류 (${response.status})`);
    onError?.(err);
    throw err;
  }

  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (data?.error) {
      const err = new Error(data.error);
      onError?.(err);
      throw err;
    }
    onDone({
      shareId: data.share_id ?? null,
      interpretation: data.interpretation,
      fullData: data,
    });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const err = new Error("스트림을 읽을 수 없습니다.");
    onError?.(err);
    throw err;
  }

  const decoder = new TextDecoder();
  /** 청크가 패킷 단위로 쪼개져 올 수 있으므로, 완전한 라인만 파싱하기 위해 누적하는 버퍼 */
  let buffer = "";
  let fullText = "";

  /**
   * SSE 한 건(완전히 끝맺음된 메시지)만 파싱. "data: " 제거 후 JSON.parse.
   * 불완전한 payload는 JSON.parse 시 SyntaxError가 나므로 catch에서 무시.
   * data: [DONE] 순수 문자열은 JSON이 아니므로 JSON.parse 시도하지 않고 건너뛰고 다음 청크를 계속 읽는다.
   * 한 이벤트에 data: [DONE]\ndata: {"done":true,...} 처럼 여러 줄이 올 수 있으므로 줄 단위로 처리한다.
   */
  function processOneEvent(rawEvent) {
    const trimmed = rawEvent.trim();
    if (!trimmed) return false;

    const lines = trimmed.split("\n");
    for (const line of lines) {
      const lineTrimmed = line.trim();
      if (!lineTrimmed.startsWith("data:")) continue;
      const payload = lineTrimmed.slice(5).trim();
      // [DONE]은 스트림 종료 신호일 뿐이며, 그 다음에 {"done":true,"share_id":"..."}가 올 수 있으므로 파싱만 건너뛰고 스트림 읽기는 계속한다.
      if (!payload || payload === "[DONE]") continue;

      try {
        const data = JSON.parse(payload);
        if (data?.done === true) {
          onDone({
            shareId: data.share_id ?? null,
            fullText,
            fullData: fullText ? { interpretation: fullText } : undefined,
            debug: data.debug ?? undefined,
          });
          return true;
        }
        if (data?.error) {
          onError?.(new Error(data.error));
          throw new Error(data.error);
        }
        if (typeof data?.text === "string" && data.text) {
          fullText += data.text;
          onChunk(data.text);
        }
      } catch (e) {
        // [DONE] 문자열이 어차피 JSON이 아니므로 파싱 실패 시 무시하고 다음 줄/청크 계속 읽기
        if (payload.trim() === "[DONE]") continue;
        if (e?.message && e.message !== "Unexpected end of JSON input") {
          onError?.(e);
          throw e;
        }
      }
    }
    return false;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 줄바꿈 기준으로 분리. 마지막 요소는 불완전한 청크일 수 있으므로 버퍼에 되돌린다.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const part of lines) {
        if (processOneEvent(part)) {
          try {
            reader.releaseLock?.();
          } catch (_) {}
          return;
        }
      }
    }

    // 스트림 종료 후 버퍼에 남은 불완전/완전 이벤트 1건 처리 (파싱 실패 시 무시)
    if (buffer.trim()) {
      if (processOneEvent(buffer)) return;
    }
    onDone({ shareId: null, fullText, fullData: fullText ? { interpretation: fullText } : undefined });
  } finally {
    try {
      reader.releaseLock?.();
    } catch (_) {}
  }
}
