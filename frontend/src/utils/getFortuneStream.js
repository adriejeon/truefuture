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
  /** 청크가 패킷 단위로 쪼개져 올 수 있으므로, 완전한 이벤트만 파싱하기 위해 누적하는 버퍼 */
  let buffer = "";
  let fullText = "";

  /**
   * SSE 한 건(완전히 끝맺음된 메시지)만 파싱. "data: " 제거 후 JSON.parse.
   * 불완전한 payload는 JSON.parse 시 SyntaxError가 나므로 catch에서 무시.
   */
  function processOneEvent(rawEvent) {
    const trimmed = rawEvent.trim();
    if (!trimmed || !trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]" || !payload) return false;
    try {
      const data = JSON.parse(payload);
      if (data?.done === true) {
        onDone({
          shareId: data.share_id ?? null,
          fullText,
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
      if (e?.message && e.message !== "Unexpected end of JSON input") {
        onError?.(e);
        throw e;
      }
    }
    return false;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 규격: 이벤트 구분자는 \n\n. 완전히 끝맺음된 덩어리만 분리한다.
      const parts = buffer.split("\n\n");
      // 마지막 조각은 \n\n으로 끝나지 않았을 수 있으므로 버퍼에 되돌린다.
      buffer = parts.pop() ?? "";

      for (const part of parts) {
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
    onDone({ shareId: null, fullText });
  } finally {
    try {
      reader.releaseLock?.();
    } catch (_) {}
  }
}
