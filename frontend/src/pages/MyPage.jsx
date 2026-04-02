import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";
import PrimaryButton from "../components/PrimaryButton";
import BottomNavigation from "../components/BottomNavigation";
import Toast from "../components/Toast";

function MyPage() {
  const { t } = useTranslation();
  const { user, logout, loadingAuth } = useAuth();
  const { stars } = useStars();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteAgreeChecked, setDeleteAgreeChecked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [myReferralCode, setMyReferralCode] = useState(null);
  const [myReferral, setMyReferral] = useState(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);
  const [referrerCodeInput, setReferrerCodeInput] = useState("");
  const [isRegisteringReferral, setIsRegisteringReferral] = useState(false);

  const currentLang = i18n.language?.startsWith("ko") ? "ko" : "en";

  const hasReferrer = myReferral?.referral_code != null && myReferral.referral_code !== "";

  useEffect(() => {
    if (!user?.id || !supabase) return;
    let cancelled = false;
    setReferralLoading(true);
    Promise.all([
      supabase.from("referral_codes").select("code").eq("user_id", user.id).maybeSingle(),
      supabase.from("referrals").select("referral_code").eq("referee_id", user.id).maybeSingle(),
    ])
      .then(([codeRes, refRes]) => {
        if (cancelled) return;
        if (codeRes.data?.code) setMyReferralCode(codeRes.data.code);
        if (refRes.data?.referral_code != null) setMyReferral(refRes.data);
      })
      .catch((err) => {
        if (!cancelled) console.warn("추천 정보 조회 실패:", err);
      })
      .finally(() => {
        if (!cancelled) setReferralLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleCopyMyCode = () => {
    if (!myReferralCode) return;
    navigator.clipboard.writeText(myReferralCode).then(
      () => setToastMessage(t("mypage.referral_copy_success")),
      () => setToastMessage(t("mypage.referral_copy_fail"))
    );
  };

  const handleKakaoShareReferral = () => {
    if (!window.Kakao?.isInitialized()) {
      setToastMessage(t("mypage.referral_kakao_unavailable"));
      return;
    }
    if (!myReferralCode) {
      setToastMessage(t("mypage.referral_loading"));
      return;
    }
    const shareUrl = `${window.location.origin}/login?ref=${encodeURIComponent(myReferralCode)}`;
    const isLocalhost = window.location.hostname === "localhost";
    const imageUrl = isLocalhost
      ? "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
      : `${window.location.origin}/assets/800x800.png`;
    const kakaoShareConfig = {
      objectType: "feed",
      content: {
        title: "진짜미래 | 정통 고전 점성술 · 출생 차트 분석",
        description: "출생 차트 자동 계산과 자유 질문을 지원하는 점성술 분석 서비스입니다. 회원 가입 시 망원경 1개가 제공됩니다.",
        imageUrl,
        link: {
          mobileWebUrl: shareUrl,
          webUrl: shareUrl,
        },
      },
      buttons: [
        {
          title: "진짜미래 가입하기",
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
        },
      ],
    };
    try {
      window.Kakao.Share.sendDefault(kakaoShareConfig);
    } catch (err) {
      console.error("카카오톡 공유 실패:", err);
      setToastMessage(t("mypage.referral_kakao_error"));
    }
  };

  const handleRegisterReferral = async () => {
    const code = referrerCodeInput?.trim();
    if (!code || !user?.id || !supabase) return;
    setIsRegisteringReferral(true);
    try {
      const { data, error } = await supabase.rpc("register_referral", {
        p_referee_id: user.id,
        p_referral_code: code,
      });
      if (error) throw error;
      const result = data ?? {};
      if (result.success) {
        setMyReferral({ referral_code: code });
        setReferrerCodeInput("");
        setToastMessage(t("mypage.referral_registered"));
      } else {
        setToastMessage(result.message || t("mypage.referral_register_fail"));
      }
    } catch (err) {
      setToastMessage(err?.message || t("mypage.referral_register_error"));
    } finally {
      setIsRegisteringReferral(false);
    }
  };

  useEffect(() => {
    if (!loadingAuth && !user && location.pathname === "/mypage") {
      navigate("/login", { replace: true });
    }
  }, [user, loadingAuth, location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  const handleUsageHistory = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate("/purchase/history", { replace: false });
  };

  const menuItems = [
    {
      id: "usage",
      title: t("mypage.menu_usage"),
      onClick: handleUsageHistory,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "contact",
      title: t("mypage.menu_contact"),
      onClick: (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        navigate("/contact");
      },
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      id: "refund",
      title: t("mypage.menu_refund"),
      onClick: (e) => {
        e?.preventDefault();
        e?.stopPropagation();
        navigate("/refund-inquiry");
      },
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      id: "logout",
      title: t("mypage.menu_logout"),
      onClick: handleLogout,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      ),
    },
    {
      id: "delete",
      title: t("mypage.menu_delete"),
      onClick: () => setShowDeleteModal(true),
      danger: true,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
    },
  ];

  async function handleDeleteAccount() {
    if (!deleteAgreeChecked) return;

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: {},
      });

      if (error) {
        console.error("Edge Function 오류:", error);
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || t("mypage.delete_error"));
      }

      alert(t("mypage.delete_success"));
      await supabase.auth.signOut().catch(() => {});
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    } catch (err) {
      console.error("회원 탈퇴 오류:", err);
      alert(err.message || t("mypage.delete_error"));
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeleteAgreeChecked(false);
    }
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen py-8 px-4 pb-24">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{t("mypage.title")}</h1>
          <p className="text-slate-300 text-sm">
            {t("mypage.user_info", {
              name: user?.user_metadata?.full_name || user?.email || "사용자",
            })}
          </p>
        </div>

        {/* 보유 운세권 카드 */}
        <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl mb-6">
          <div className="text-center">
            <p className="text-slate-300 text-sm mb-3">{t("mypage.stars_owned")}</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl font-bold text-white">
                {stars.total.toLocaleString()}
              </span>
            </div>
            <div className="flex gap-4 justify-center text-xs text-slate-400 mb-4 flex-wrap">
              <span>{t("mypage.telescope")}: {stars.paid}개</span>
              <span>{t("mypage.compass")}: {stars.bonus}개</span>
              <span>{t("mypage.probe")}: {stars.probe}대</span>
            </div>
            <PrimaryButton
              type="button"
              variant="gold"
              fullWidth
              onClick={() => navigate("/purchase")}
            >
              {t("mypage.buy_stars")}
            </PrimaryButton>
          </div>
        </div>

        {/* 언어 설정 카드 */}
        <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 mb-6">
          <p className="text-slate-300 text-sm mb-3">{t("mypage.language_settings")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => i18n.changeLanguage("ko")}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                currentLang === "ko"
                  ? "bg-primary text-black border-primary"
                  : "bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {t("mypage.language_korean")}
            </button>
            <button
              type="button"
              onClick={() => i18n.changeLanguage("en")}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                currentLang === "en"
                  ? "bg-primary text-black border-primary"
                  : "bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {t("mypage.language_english")}
            </button>
          </div>
        </div>

        {/* 나의 추천 코드 */}
        {!referralLoading && (
          <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 mb-6">
            <p className="text-slate-300 text-sm mb-3">{t("mypage.my_referral_code")}</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 font-mono text-lg font-semibold text-white bg-slate-900/50 rounded-lg px-3 py-2 truncate">
                {myReferralCode ?? "—"}
              </span>
              <button
                type="button"
                onClick={handleCopyMyCode}
                disabled={!myReferralCode}
                className="shrink-0 p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                title={t("common.copy")}
              >
                <img src="/assets/copy.svg" alt={t("common.copy")} className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleKakaoShareReferral}
                disabled={!myReferralCode}
                className="shrink-0 p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                title={t("common.share")}
              >
                <img src="/assets/share.svg" alt={t("common.share")} className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 p-4 sm:p-5 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30">
              <p className="text-amber-200 font-medium text-center text-sm sm:text-base">
                {t("mypage.referral_benefit")}
              </p>
            </div>
          </div>
        )}

        {/* 추천인 코드 */}
        {!referralLoading && (
          <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 mb-6">
            <p className="text-slate-300 text-sm mb-3">{t("mypage.referral_code_label")}</p>
            {hasReferrer ? (
              <input
                type="text"
                readOnly
                disabled
                value={myReferral.referral_code}
                className="w-full font-mono text-base text-slate-400 bg-slate-900/70 rounded-lg px-3 py-2.5 border border-slate-600 cursor-not-allowed"
                aria-label={t("mypage.referral_code_label")}
              />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={referrerCodeInput}
                  onChange={(e) => setReferrerCodeInput(e.target.value)}
                  placeholder={t("mypage.referral_friend_placeholder")}
                  className="flex-1 min-w-0 font-mono text-base text-white bg-slate-900/50 rounded-lg px-3 py-2.5 border border-slate-600 placeholder-slate-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                  aria-label={t("mypage.referral_code_label")}
                />
                <button
                  type="button"
                  onClick={handleRegisterReferral}
                  disabled={isRegisteringReferral || !referrerCodeInput?.trim()}
                  className="shrink-0 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegisteringReferral ? t("common.registering") : t("common.register")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 메뉴 리스트 */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 overflow-hidden">
          {menuItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                item.onClick(e);
              }}
              className={`w-full flex items-center gap-4 px-6 py-4 transition-colors ${
                item.danger
                  ? "hover:bg-red-500/10 text-red-400"
                  : "hover:bg-slate-700/50 text-white"
              } ${
                index !== menuItems.length - 1
                  ? "border-b border-slate-700"
                  : ""
              }`}
            >
              <div className={`flex items-center justify-center ${item.danger ? "text-red-400" : "text-white"}`}>
                {item.icon}
              </div>
              <span className="flex-1 text-left font-medium">{item.title}</span>
              <svg
                className="w-5 h-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* 회원 탈퇴 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">
              {t("mypage.delete_confirm_title")}
            </h2>
            <ul className="text-slate-300 text-sm mb-4 space-y-2 leading-relaxed list-disc list-inside">
              <li>{t("mypage.delete_warn1")}</li>
              <li>{t("mypage.delete_warn2")}</li>
            </ul>
            <p className="text-slate-300 text-sm mb-4">
              👉 {t("mypage.delete_privacy_link") === "개인정보 처리방침"
                ? <>자세한 내용은{" "}
                    <a
                      href="/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 underline font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("mypage.delete_privacy_link")}
                    </a>
                    을 확인해 주세요.</>
                : <>For full details, please review our{" "}
                    <a
                      href="/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 underline font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("mypage.delete_privacy_link")}
                    </a>.</>
              }
            </p>
            <label className="flex items-start gap-3 cursor-pointer mb-5 group">
              <input
                type="checkbox"
                checked={deleteAgreeChecked}
                onChange={(e) => setDeleteAgreeChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-900 text-red-500 focus:ring-red-500/50"
              />
              <span className="text-slate-300 text-sm select-none group-hover:text-slate-200">
                {t("mypage.delete_agree_label")}
              </span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteAgreeChecked(false);
                }}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || !deleteAgreeChecked}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? t("mypage.deleting") : t("mypage.delete_btn")}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      {user && <BottomNavigation />}
    </div>
  );
}

export default MyPage;
