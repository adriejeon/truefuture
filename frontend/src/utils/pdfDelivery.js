/**
 * 브라우저에서 생성한 PDF Blob 을 사용자 기기에 전달(저장/공유)하는 유틸리티.
 *
 * 저장 방식은 환경마다 동작 여부가 다르다:
 * - 데스크톱 브라우저: `<a download>` + blob URL 로 곧바로 다운로드.
 * - iOS Safari / 홈 화면 PWA(standalone) / iOS 인앱(WKWebView):
 *   `<a download>` 는 standalone·인앱에서 무반응. 대신 Web Share API(파일 공유)로
 *   OS 공유 시트를 열어 "파일에 저장" 등으로 저장한다.
 * - Android Chrome / Samsung Internet(홈 화면 PWA 포함): `<a download>` 가 정상 동작해 '다운로드' 폴더에 저장된다.
 * - Android 인앱 WebView(카카오톡·네이버 등): Web Share 미지원 + blob 다운로드 불가 →
 *   외부 브라우저로 열도록 안내해야 한다.
 *
 * 주의: `navigator.share()` 는 사용자 제스처(클릭) 안에서만 호출 가능하다. PDF 생성처럼
 * 긴 비동기 작업 뒤에 호출하면 NotAllowedError 가 날 수 있으므로, 호출부는 Blob 을 캐시해 두고
 * "retap" 결과를 받으면 사용자가 다시 한 번 눌렀을 때 곧바로 share 를 호출해야 한다.
 */
import { detectInAppBrowser, getPlatform } from "./inAppBrowserDetector";

/** 홈 화면에 추가된 웹앱(standalone 표시 모드)인지 */
export const isStandaloneDisplay = () => {
  try {
    if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches
    );
  } catch (_) {
    return false;
  }
};

/** iPhone/iPad 인지 (iPadOS 13+ 는 데스크톱 Macintosh UA 를 보내므로 터치 포인트로 보정) */
export const isIOSDevice = () => {
  if (typeof navigator === "undefined") return false;
  if (getPlatform() === "ios") return true;
  const ua = (navigator.userAgent || "").toLowerCase();
  return ua.includes("macintosh") && (navigator.maxTouchPoints || 0) > 1;
};

/** Web Share API 로 해당 파일을 공유할 수 있는 환경인지 */
export const canShareFile = (file) => {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch (_) {
    return false;
  }
};

/** `<a download>` 로 Blob 다운로드 트리거 (데스크톱·Android 브라우저용) */
export const triggerAnchorDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/**
 * PDF Blob 을 기기에 전달한다.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<"shared"|"cancelled"|"retap"|"downloaded"|"unsupported">}
 *  - shared: 공유 시트로 전달 완료
 *  - cancelled: 사용자가 공유 시트를 닫음 (오류 아님)
 *  - retap: 사용자 제스처가 만료돼 공유 시트를 못 열었음 → 다시 탭하면 즉시 공유 가능
 *  - downloaded: `<a download>` 로 다운로드 트리거됨
 *  - unsupported: 이 환경(인앱 WebView, 공유 미지원 iOS standalone)에서는 저장 불가
 */
export async function deliverPdfFile(blob, filename) {
  const file = new File([blob], filename, { type: "application/pdf" });
  const ios = isIOSDevice();

  // iOS 계열은 `<a download>` 가 Safari 일반 탭에서만 동작하므로 공유 시트를 우선 사용한다
  if (ios && canShareFile(file)) {
    try {
      // 이 호출은 반드시 클릭 핸들러의 동기 구간(첫 await 이전)에서 실행되어야 한다.
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      if (err?.name === "NotAllowedError") return "retap";
      console.warn("PDF 공유 실패, 다운로드로 폴백:", err);
    }
  }

  const { isInApp } = detectInAppBrowser();
  if (isInApp || (ios && isStandaloneDisplay())) {
    return "unsupported";
  }

  triggerAnchorDownload(blob, filename);
  return "downloaded";
}
