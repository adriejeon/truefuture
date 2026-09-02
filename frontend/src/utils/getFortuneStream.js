import i18n from "../i18n";

/**
 * get-fortune 엣지 함수를 fetch + SSE 스트리밍으로 호출합니다.
 * Authorization 헤더에 세션 토큰을 넣고, response.body.getReader()로 청크를 읽어
 * onChunk / onDone 콜백으로 전달합니다. 차감·환불은 서버(get-fortune)에서 처리합니다.
 *
 * 타임아웃은 "전체 시간" 대신 유휴(idle) 기준이다.
 *  - 첫 바이트까지 최대 FIRST_BYTE_TIMEOUT_MS
 *  - 이후에는 마지막 수신 이후 IDLE_TIMEOUT_MS 무응답이면 중단
 * 서버가 보내는 `: ping` 하트비트도 reader.read() 를 깨우므로 유휴 타이머가 리셋된다.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase 클라이언트
 * @param {object} requestBody - POST body (fortuneType, birthDate, cost, description 등)
 * @param {{ onChunk: (text: string) => void, onDone: (payload) => void, onError?: (err: Error) => void, signal?: AbortSignal }} callbacks
 * @returns {Promise<void>}
 */
const FIRST_BYTE_TIMEOUT_MS = 180000; // 첫 응답(헤더/첫 청크) 대기 한도
const IDLE_TIMEOUT_MS = 90000; // 마지막 수신 이후 무응답 한도

export async function invokeGetFortuneStream(supabase, requestBody, callbacks) {
  const { onChunk, onDone, onError, signal } = callbacks;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    const err = new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");
    onError?.(err);
    throw err;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    const err = new Error(i18n.t("errors.login_required"));
    err.code = "UNAUTHORIZED";
    onError?.(err);
    throw err;
  }

  const url = `${supabaseUrl}/functions/v1/get-fortune`;
  const controller = new AbortController();

  // ── 유휴 타임아웃 ──
  let timeoutId = null;
  const armTimeout = (ms) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (_) {}
    }, ms);
  };
  const clearIdleTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
  };
  armTimeout(FIRST_BYTE_TIMEOUT_MS);

  // ── 호출자 중단 신호 연결 ──
  let detachSignal = () => {};
  if (signal) {
    if (signal.aborted) {
      try {
        controller.abort();
      } catch (_) {}
    } else {
      const onAbort = () => {
        try {
          controller.abort();
        } catch (_) {}
      };
      signal.addEventListener("abort", onAbort, { once: true });
      detachSignal = () => signal.removeEventListener("abort", onAbort);
    }
  }

  // ── Screen Wake Lock (생성 중 화면 꺼짐/탭 정지 방지) ──
  let wakeLock = null;
  let wakeLockFinished = false;
  const requestWakeLock = async () => {
    if (wakeLockFinished) return;
    try {
      if (typeof navigator !== "undefined" && navigator.wakeLock?.request) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (_) {
      // 미지원/거부 브라우저는 무시
    }
  };
  const handleVisibilityChange = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible" && !wakeLockFinished) {
      requestWakeLock();
    }
  };
  const releaseWakeLock = () => {
    wakeLockFinished = true;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    try {
      wakeLock?.release?.();
    } catch (_) {}
    wakeLock = null;
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  requestWakeLock();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    // 헤더 수신 = 첫 응답. 본문 첫 청크까지 다시 여유를 준다.
    armTimeout(FIRST_BYTE_TIMEOUT_MS);

    const contentType = response.headers.get("Content-Type") || "";

    if (!response.ok) {
      const text = await response.text();
      let message = response.statusText;
      let body = null;
      try {
        body = JSON.parse(text);
        if (body?.error) message = body.error;
      } catch (_) {}
      const err = new Error(message || `서버 오류 (${response.status})`);
      err.status = response.status;
      err.body = body;
      throw err;
    }

    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (data?.error) {
        throw new Error(data.error);
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
      throw new Error("스트림을 읽을 수 없습니다.");
    }

    const decoder = new TextDecoder();
    /** 청크가 패킷 단위로 쪼개져 올 수 있으므로, 완전한 라인만 파싱하기 위해 누적하는 버퍼 */
    let buffer = "";
    let fullText = "";

    /**
     * SSE 한 건(완전히 끝맺음된 메시지)만 파싱. "data: " 제거 후 JSON.parse.
     * 불완전한 payload는 JSON.parse 시 SyntaxError가 나므로 catch에서 무시.
     * data: [DONE] 순수 문자열은 JSON이 아니므로 JSON.parse 시도하지 않고 건너뛰고 다음 청크를 계속 읽는다.
     * `: ping` 등 data: 로 시작하지 않는 주석 줄은 그대로 무시된다.
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
            throw new Error(data.error);
          }
          if (typeof data?.text === "string" && data.text) {
            fullText += data.text;
            onChunk(data.text);
          }
        } catch (e) {
          // 잘린 JSON(불완전 청크)만 무시하고, 그 외 예외는 그대로 올린다.
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
      return false;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        // 하트비트를 포함해 무엇이든 수신하면 유휴 타이머 리셋
        armTimeout(IDLE_TIMEOUT_MS);
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
      // done 이벤트 없이 연결이 끊긴 경우 — 결과가 저장됐다는 보장이 없으므로 성공 처리하지 않는다.
      const err = new Error(i18n.t("errors.stream_interrupted"));
      err.code = "STREAM_INTERRUPTED";
      err.partialText = fullText;
      throw err;
    } finally {
      try {
        reader.releaseLock?.();
      } catch (_) {}
    }
  } catch (err) {
    onError?.(err);
    throw err;
  } finally {
    clearIdleTimeout();
    detachSignal();
    releaseWakeLock();
  }
}
