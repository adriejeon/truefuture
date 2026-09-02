/**
 * Supabase Edge Function 호출 오류를 사용자에게 보여줄 수 있는 형태로 해석하는 공용 유틸.
 *
 * functions-js 가 던지는 FunctionsHttpError 는 `error.context` 에 원본 Response 를 담고 있어
 * 본문(JSON)을 읽어야 서버가 내려준 code/error 를 알 수 있다. 본문을 읽지 못하면
 * "Edge Function returned a non-2xx status code" 같은 내부 문구만 남으므로,
 * 반드시 이 유틸을 거쳐 사용자 문구로 변환한다.
 */

/** 서버 응답 code → i18n 키 매핑 (구버전 서버는 code 를 안 줄 수 있음) */
const CODE_MESSAGE_KEYS = {
  NOT_PAID: "errors.not_paid",
  AMOUNT_MISMATCH: "errors.amount_mismatch",
  PAYMENT_NOT_FOUND: "errors.payment_not_found",
  PORTONE_UNAVAILABLE: "errors.portone_unavailable",
  UNAUTHORIZED: "errors.login_required",
  USER_MISMATCH: "errors.user_mismatch",
  PROFILE_NOT_FOUND: "errors.profile_not_found",
  PROFILE_INCOMPLETE: "errors.profile_incomplete",
};

/** HTTP status → i18n 키 매핑 (code 도 서버 문구도 없을 때의 최후 폴백) */
function statusMessageKey(status) {
  if (status === 401 || status === 403) return "errors.login_required";
  if (status === 404) return "errors.payment_not_found";
  if (status === 409) return "errors.processing";
  if (status === 429) return "errors.temporary";
  if (typeof status === "number" && status >= 500) return "errors.temporary";
  if (status == null) return "errors.network";
  return "errors.generic";
}

/** 네트워크 단절로 fetch 자체가 실패한 경우인지 */
function isNetworkError(err) {
  if (!err) return false;
  if (err.name === "TypeError") return true;
  const msg = String(err.message || "");
  return /failed to fetch|load failed|network ?error|networkerror/i.test(msg);
}

/** 사용자가/타이머가 요청을 끊은 경우인지 */
function isAbortError(err) {
  if (!err) return false;
  return err.name === "AbortError" || /aborted/i.test(String(err.message || ""));
}

/**
 * supabase.functions.invoke 의 error(또는 임의의 예외)에서 서버 응답을 최대한 복원한다.
 *
 * @param {unknown} error
 * @returns {Promise<{status: number|null, code: string|null, message: string, locked: boolean, details: object|null, raw: unknown}>}
 */
export async function parseFnError(error) {
  let status = null;
  let code = null;
  let message = "";
  let details = null;

  try {
    status = error?.context?.status ?? error?.status ?? null;
  } catch (_) {
    status = null;
  }

  // FunctionsHttpError.context 는 Response — 본문을 한 번만 읽을 수 있으므로 json() 우선, 실패 시 text()
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      details = await ctx.json();
    } catch (_) {
      details = null;
      try {
        const text = typeof ctx.text === "function" ? await ctx.text() : "";
        if (text) {
          try {
            details = JSON.parse(text);
          } catch (_) {
            message = text.slice(0, 300);
          }
        }
      } catch (_) {}
    }
  }

  if (details && typeof details === "object") {
    code = details.code ?? null;
    if (typeof details.error === "string" && details.error) message = details.error;
    if (!message && typeof details.message === "string") message = details.message;
    if (details.locked) status = status ?? 409;
  }

  if (!message) {
    // 내부 문구("Edge Function returned a non-2xx status code")는 사용자에게 노출하지 않는다
    const raw = String(error?.message || "");
    if (raw && !/non-2xx status code|FunctionsHttpError|FunctionsFetchError/i.test(raw)) {
      message = raw;
    }
  }

  if (status == null && isNetworkError(error)) status = null;

  return {
    status,
    code,
    message,
    locked: status === 409 || details?.locked === true,
    details,
    raw: error,
  };
}

/**
 * parseFnError 결과를 사용자에게 보여줄 문구로 변환.
 * code 매핑 → 서버 한국어 문구 → status 폴백 순으로 고른다.
 *
 * @param {{status: number|null, code: string|null, message: string}} parsed
 * @param {(key: string) => string} t
 */
export function describeFnError(parsed, t) {
  const translate = typeof t === "function" ? t : (k) => k;
  const codeKey = parsed?.code ? CODE_MESSAGE_KEYS[parsed.code] : null;
  if (codeKey) return translate(codeKey);
  if (parsed?.message) return parsed.message;
  return translate(statusMessageKey(parsed?.status ?? null));
}

/**
 * 임의의 예외를 사용자 문구로 변환.
 * - TypeError(Failed to fetch / Load failed) → 네트워크 문구
 * - AbortError → 응답 지연 문구
 * - 서버가 내려준 한국어 문구(SSE error 이벤트 등) → 그대로
 * - 그 외/내부 문구 → 일반 문구(fallbackKey)
 *
 * @param {unknown} err
 * @param {(key: string) => string} t
 * @param {string} [fallbackKey]
 */
export function toUserFacingError(err, t, fallbackKey = "errors.generic") {
  const translate = typeof t === "function" ? t : (k) => k;
  if (!err) return translate(fallbackKey);

  if (isAbortError(err)) return translate("errors.timeout");
  if (isNetworkError(err)) return translate("errors.network");

  // getFortuneStream 이 붙여주는 코드
  if (err.code === "STREAM_INTERRUPTED") return translate("errors.stream_interrupted");
  if (err.code === "TIMEOUT") return translate("errors.timeout");

  const message = String(err.message || "").trim();
  if (!message) return translate(fallbackKey);

  // 내부/라이브러리 문구는 노출하지 않는다
  if (
    /non-2xx status code|FunctionsHttpError|FunctionsFetchError|^\[object |undefined is not|is not a function|Unexpected token/i.test(
      message
    )
  ) {
    return translate(fallbackKey);
  }
  return message;
}

/**
 * "이미 처리된 결제"인지 판정.
 * 신버전 서버: 200 + { already_processed: true } / code "ALREADY_PROCESSED"
 * 구버전 서버: 400 + { error: "이미 처리된 결제입니다. …" }
 *
 * @param {string|null|undefined} code
 * @param {string|null|undefined} message
 */
export function isAlreadyProcessedResponse(code, message) {
  if (code === "ALREADY_PROCESSED") return true;
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  return text.includes("이미 처리된 결제") || text.includes("already processed");
}

export { isNetworkError, isAbortError };
