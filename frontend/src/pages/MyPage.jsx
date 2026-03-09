import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";
import PrimaryButton from "../components/PrimaryButton";
import BottomNavigation from "../components/BottomNavigation";
import Toast from "../components/Toast";

function MyPage() {
  const { user, logout, loadingAuth } = useAuth();
  const { stars } = useStars();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteAgreeChecked, setDeleteAgreeChecked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 추천: 나의 코드, 추천인 정보, 토스트
  const [myReferralCode, setMyReferralCode] = useState(null);
  const [myReferral, setMyReferral] = useState(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);
  const [referrerCodeInput, setReferrerCodeInput] = useState("");
  const [isRegisteringReferral, setIsRegisteringReferral] = useState(false);

  const hasReferrer = myReferral?.referral_code != null && myReferral.referral_code !== "";

  // 추천 코드·추천인 정보 조회
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
      () => setToastMessage("코드가 복사되었습니다"),
      () => setToastMessage("복사에 실패했습니다.")
    );
  };

  const handleKakaoShareReferral = () => {
    if (!window.Kakao?.isInitialized()) {
      setToastMessage("카카오톡 공유 기능을 사용할 수 없습니다.");
      return;
    }
    if (!myReferralCode) {
      setToastMessage("추천 코드를 불러오는 중입니다.");
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
        title: "진짜미래 - 더 나은 미래를 위한 운명 컨설팅",
        description: "점성학 정밀 분석으로 미래의 흐름을 읽고, 더 나은 내일을 위한 전략을 제시합니다. 지금 가입하면 망원경 1개를 무료로 드려요.",
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
      setToastMessage("카카오톡 공유 중 오류가 발생했습니다.");
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
        setToastMessage("추천인 코드가 등록되었습니다.");
      } else {
        setToastMessage(result.message || "등록에 실패했습니다.");
      }
    } catch (err) {
      setToastMessage(err?.message || "등록 중 오류가 발생했습니다.");
    } finally {
      setIsRegisteringReferral(false);
    }
  };

  // 로그인하지 않은 경우 로그인 페이지로 리다이렉트 (로딩 완료 후에만, 마이페이지에 있을 때만)
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
      title: "사용내역",
      onClick: handleUsageHistory,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "contact",
      title: "문의하기",
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
      title: "환불 문의",
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
      title: "로그아웃",
      onClick: handleLogout,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      ),
    },
    {
      id: "delete",
      title: "회원탈퇴",
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
        throw new Error(data?.error || "회원 탈퇴 처리 중 오류가 발생했습니다.");
      }

      alert("회원 탈퇴가 완료되었습니다.");
      // 이미 삭제된 유저 토큰으로 signOut 시 403 발생할 수 있음 → 에러 무시
      await supabase.auth.signOut().catch(() => {});
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    } catch (err) {
      console.error("회원 탈퇴 오류:", err);
      alert(err.message || "회원 탈퇴 처리 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeleteAgreeChecked(false);
    }
  }

  // 로딩 중이거나 로그인하지 않은 경우 로딩 화면 표시
  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 로그인하지 않은 경우 아무것도 렌더링하지 않음 (useEffect에서 리다이렉트 처리)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen py-8 px-4 pb-24">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">마이페이지</h1>
          <p className="text-slate-300 text-sm">
            {user?.user_metadata?.full_name || user?.email || "사용자"}님의 정보
          </p>
        </div>

        {/* 보유 운세권 카드 */}
        <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl mb-6">
          <div className="text-center">
            <p className="text-slate-300 text-sm mb-3">보유 운세권</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl font-bold text-white">
                {stars.total.toLocaleString()}
              </span>
            </div>
            <div className="flex gap-4 justify-center text-xs text-slate-400 mb-4 flex-wrap">
              <span>망원경: {stars.paid}개</span>
              <span>나침반: {stars.bonus}개</span>
              <span>탐사선: {stars.probe}대</span>
            </div>
            <PrimaryButton
              type="button"
              variant="gold"
              fullWidth
              onClick={() => navigate("/purchase")}
            >
              운세권 구매하기
            </PrimaryButton>
          </div>
        </div>

        {/* 나의 추천 코드 */}
        {!referralLoading && (
          <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 mb-6">
            <p className="text-slate-300 text-sm mb-3">나의 추천 코드</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 font-mono text-lg font-semibold text-white bg-slate-900/50 rounded-lg px-3 py-2 truncate">
                {myReferralCode ?? "—"}
              </span>
              <button
                type="button"
                onClick={handleCopyMyCode}
                disabled={!myReferralCode}
                className="shrink-0 p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                title="복사"
              >
                <img src="/assets/copy.svg" alt="복사" className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleKakaoShareReferral}
                disabled={!myReferralCode}
                className="shrink-0 p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                title="카카오톡 공유하기"
              >
                <img src="/assets/share.svg" alt="공유" className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* 추천인 코드 (친구의 코드) */}
        {!referralLoading && (
          <div className="p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700 mb-6">
            <p className="text-slate-300 text-sm mb-3">추천인 코드</p>
            {hasReferrer ? (
              <input
                type="text"
                readOnly
                disabled
                value={myReferral.referral_code}
                className="w-full font-mono text-base text-slate-400 bg-slate-900/70 rounded-lg px-3 py-2.5 border border-slate-600 cursor-not-allowed"
                aria-label="등록된 추천인 코드"
              />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={referrerCodeInput}
                  onChange={(e) => setReferrerCodeInput(e.target.value)}
                  placeholder="친구의 추천 코드 입력"
                  className="flex-1 min-w-0 font-mono text-base text-white bg-slate-900/50 rounded-lg px-3 py-2.5 border border-slate-600 placeholder-slate-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                  aria-label="추천인 코드 입력"
                />
                <button
                  type="button"
                  onClick={handleRegisterReferral}
                  disabled={isRegisteringReferral || !referrerCodeInput?.trim()}
                  className="shrink-0 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegisteringReferral ? "등록 중..." : "등록"}
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
              정말 진짜미래를 떠나시겠습니까?
            </h2>
            <ul className="text-slate-300 text-sm mb-4 space-y-2 leading-relaxed list-disc list-inside">
              <li>
                사주 및 운세 조회 기록, 보유 중인 쿠폰(망원경/나침반)은 즉시 삭제되며 복구할 수 없습니다.
              </li>
              <li>
                단, 신규 가입 혜택 악용을 막기 위해 암호화된 가입 식별값은 1년간 안전하게 보관 후 파기됩니다.
              </li>
            </ul>
            <p className="text-slate-300 text-sm mb-4">
              👉 자세한 내용은{" "}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 underline font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                개인정보 처리방침
              </a>
              을 확인해 주세요.
            </p>
            <label className="flex items-start gap-3 cursor-pointer mb-5 group">
              <input
                type="checkbox"
                checked={deleteAgreeChecked}
                onChange={(e) => setDeleteAgreeChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-900 text-red-500 focus:ring-red-500/50"
              />
              <span className="text-slate-300 text-sm select-none group-hover:text-slate-200">
                안내 사항을 모두 확인했으며, 탈퇴에 동의합니다.
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
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || !deleteAgreeChecked}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "처리 중..." : "탈퇴하기"}
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
