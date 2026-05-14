/**
 * 인앱 브라우저 감지 및 외부 브라우저로 리다이렉트하는 유틸리티
 *
 * 인앱 브라우저(카카오톡, 네이버, Threads 등)에서는 다음이 제한됩니다:
 * - 결제(PG 카드결제는 OS 보안 정책상 인앱 webview에서 외부 앱 호출 불가)
 * - 카카오/구글 OAuth 로그인
 * - 일부 인앱은 third-party 쿠키/storage 차단으로 세션 자체가 안 만들어짐
 */

/**
 * 현재 브라우저가 인앱 브라우저인지 확인
 * @returns {{ isInApp: boolean, appName: string | null, appKey: string | null }}
 */
export const detectInAppBrowser = () => {
  if (typeof navigator === "undefined") {
    return { isInApp: false, appName: null, appKey: null };
  }

  const userAgent = navigator.userAgent || navigator.vendor || window.opera || "";
  const ua = userAgent.toLowerCase();

  // 카카오톡
  if (ua.includes("kakaotalk")) {
    return { isInApp: true, appName: "KakaoTalk", appKey: "kakaotalk" };
  }

  // 네이버 (네이버 앱 / 네이버 인앱 브라우저)
  if (ua.includes("naver")) {
    return { isInApp: true, appName: "Naver", appKey: "naver" };
  }

  // Threads (iOS UA: Barcelona / Android UA: Barcelona/Threads)
  if (ua.includes("barcelona") || ua.includes("threads")) {
    return { isInApp: true, appName: "Threads", appKey: "threads" };
  }

  // 인스타그램
  if (ua.includes("instagram")) {
    return { isInApp: true, appName: "Instagram", appKey: "instagram" };
  }

  // 페이스북 (Facebook in-app browser는 FBAN/FBAV 태그를 UA에 추가)
  if (ua.includes("fban") || ua.includes("fbav")) {
    return { isInApp: true, appName: "Facebook", appKey: "facebook" };
  }

  // 라인
  if (ua.includes(" line/") || ua.includes("line/")) {
    return { isInApp: true, appName: "Line", appKey: "line" };
  }

  // 웨이보
  if (ua.includes("weibo")) {
    return { isInApp: true, appName: "Weibo", appKey: "weibo" };
  }

  // 다음 앱
  if (ua.includes("daumapps")) {
    return { isInApp: true, appName: "Daum", appKey: "daum" };
  }

  return { isInApp: false, appName: null, appKey: null };
};

/**
 * OS 플랫폼 감지 (iOS / Android / other)
 * @returns {"ios" | "android" | "other"}
 */
export const getPlatform = () => {
  if (typeof navigator === "undefined") return "other";
  const ua = (navigator.userAgent || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
};

/**
 * 외부 브라우저로 열기 시도.
 *
 * - KakaoTalk: 카카오톡 자체 스킴(`kakaotalk://web/openExternal`)으로 외부 브라우저 호출.
 *   Android에서는 비교적 안정적, iOS에서는 OS가 무시할 수 있으므로 사용자 수동 안내 필요.
 * - Naver: 네이버 앱 스킴으로 외부 브라우저 호출.
 * - Android 일반: `intent://` 스킴으로 Chrome 직접 호출 시도.
 * - 그 외 (iOS의 Threads/Instagram/Facebook 등): URL scheme이 동작하지 않으므로
 *   사용자가 직접 우측 상단 메뉴에서 "Safari로 열기"를 선택해야 함 → false 반환.
 *
 * @param {string} appKey - detectInAppBrowser가 반환한 appKey
 * @param {string} [url] - 열고자 하는 URL (기본: 현재 페이지)
 * @returns {boolean} 리다이렉트 시도를 수행했는지 여부 (성공 보장은 아님)
 */
export const redirectToExternalBrowser = (appKey, url) => {
  const targetUrl = url || window.location.href;
  const platform = getPlatform();

  try {
    if (appKey === "kakaotalk") {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`;
      return true;
    }

    if (appKey === "naver") {
      window.location.href = `naversearchapp://web?url=${encodeURIComponent(targetUrl)}&version=6`;
      return true;
    }

    // Android의 다른 인앱들은 intent 스킴으로 Chrome 호출 시도
    if (platform === "android") {
      const cleanUrl = targetUrl.replace(/^https?:\/\//, "");
      window.location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
      return true;
    }

    // iOS의 Threads/Instagram/Facebook 등은 URL scheme으로 외부 호출이 불가 → 수동 안내
    return false;
  } catch (error) {
    console.error("외부 브라우저 리다이렉트 실패:", error);
    return false;
  }
};

/**
 * 클립보드에 URL 복사 (모달 fallback 액션용)
 * @param {string} [url] - 복사할 URL (기본: 현재 페이지)
 * @returns {Promise<boolean>}
 */
export const copyCurrentUrl = async (url) => {
  const targetUrl = url || window.location.href;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(targetUrl);
      return true;
    }
    // fallback: 임시 textarea
    const textarea = document.createElement("textarea");
    textarea.value = targetUrl;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch (error) {
    console.error("URL 복사 실패:", error);
    return false;
  }
};
