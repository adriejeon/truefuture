import { useState } from "react";
import { useTranslation } from "react-i18next";
import PrimaryButton from "./PrimaryButton";
import {
  redirectToExternalBrowser,
  copyCurrentUrl,
  getPlatform,
} from "../utils/inAppBrowserDetector";

/**
 * 인앱 브라우저(카카오톡/네이버/Threads/Instagram 등) 진입 시 사용자에게
 * 외부 브라우저로 열도록 안내하는 모달.
 *
 * 결제(PG 카드결제)와 OAuth 로그인이 OS 보안 정책상 인앱 webview에서 동작하지 않기에
 * 진입 시점에 안내하여 사용자가 외부 브라우저로 이동할 수 있도록 한다.
 */
function InAppBrowserModal({ isOpen, onClose, appName, appKey }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const platform = getPlatform();

  if (!isOpen) return null;

  // 자체 URL scheme이 동작하는 앱 (KakaoTalk, Naver) 또는 Android는 자동 redirect 시도 가능
  const canAutoRedirect =
    appKey === "kakaotalk" || appKey === "naver" || platform === "android";

  const handleOpenExternal = () => {
    redirectToExternalBrowser(appKey, window.location.href);
  };

  const handleCopyUrl = async () => {
    const ok = await copyCurrentUrl(window.location.href);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  // 앱별 + 플랫폼별 수동 안내 메시지
  const getManualGuide = () => {
    if (appKey === "kakaotalk") {
      return platform === "ios"
        ? t("inapp_modal.guide.kakaotalk_ios")
        : t("inapp_modal.guide.kakaotalk_android");
    }
    if (appKey === "naver") {
      return t("inapp_modal.guide.naver");
    }
    if (appKey === "threads" || appKey === "instagram" || appKey === "facebook") {
      return platform === "ios"
        ? t("inapp_modal.guide.meta_ios")
        : t("inapp_modal.guide.meta_android");
    }
    return t("inapp_modal.guide.default");
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inapp-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl border border-yellow-500/30 p-6 animate-[scale-in_0.2s_ease-out]"
        style={{
          background: "linear-gradient(to bottom right, #1e293b, #0F0F2B)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-6 h-6 text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2
              id="inapp-modal-title"
              className="text-lg sm:text-xl font-bold text-white mb-1"
            >
              {t("inapp_modal.title")}
            </h2>
            <p className="text-sm text-slate-300">
              {t("inapp_modal.subtitle", { appName })}
            </p>
          </div>
        </div>

        {/* 제한 사항 안내 */}
        <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
          <p className="text-xs text-slate-400 mb-2">
            {t("inapp_modal.restricted_label")}
          </p>
          <ul className="space-y-1.5 text-sm text-slate-200">
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">•</span>
              <span>{t("inapp_modal.restricted.payment")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">•</span>
              <span>{t("inapp_modal.restricted.login")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">•</span>
              <span>{t("inapp_modal.restricted.fortune")}</span>
            </li>
          </ul>
        </div>

        {/* 플랫폼별 수동 안내 */}
        <div className="mb-5">
          <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
            {getManualGuide()}
          </p>
        </div>

        {/* 액션 버튼 */}
        <div className="flex flex-col gap-2">
          {canAutoRedirect && (
            <PrimaryButton
              variant="gold"
              fullWidth
              onClick={handleOpenExternal}
            >
              {t("inapp_modal.open_external_btn")}
            </PrimaryButton>
          )}
          <button
            type="button"
            onClick={handleCopyUrl}
            className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-semibold text-sm transition-all duration-200"
          >
            {copied
              ? t("inapp_modal.copied_btn")
              : t("inapp_modal.copy_url_btn")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InAppBrowserModal;
