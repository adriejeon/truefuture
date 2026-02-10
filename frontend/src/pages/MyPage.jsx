import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useStars } from "../hooks/useStars";
import { supabase } from "../lib/supabaseClient";
import PrimaryButton from "../components/PrimaryButton";

function MyPage() {
  const { user, logout, loadingAuth } = useAuth();
  const { stars } = useStars();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
    console.log("사용내역 클릭됨");
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
    if (deleteConfirmText !== "탈퇴하기") {
      alert("'탈퇴하기'를 정확히 입력해주세요.");
      return;
    }

    if (!confirm("정말로 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    setIsDeleting(true);
    try {
      // Supabase Edge Function 호출
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { user_id: user.id },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "회원 탈퇴 처리 중 오류가 발생했습니다.");
      }

      // 로그아웃 및 홈으로 이동
      alert("회원 탈퇴가 완료되었습니다.");
      await logout();
      navigate("/");
    } catch (err) {
      console.error("회원 탈퇴 오류:", err);
      alert(err.message || "회원 탈퇴 처리 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
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
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">마이페이지</h1>
          <p className="text-slate-300 text-sm">
            {user?.user_metadata?.full_name || user?.email || "사용자"}님의 정보
          </p>
        </div>

        {/* 보유 별 카드 */}
        <div className="p-6 bg-[rgba(37,61,135,0.2)] border border-[#253D87] rounded-xl shadow-xl mb-6">
          <div className="text-center">
            <p className="text-slate-300 text-sm mb-3">보유 별</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl">⭐</span>
              <span className="text-3xl font-bold text-white">
                {stars.total.toLocaleString()}
              </span>
            </div>
            <div className="flex gap-4 justify-center text-xs text-slate-400 mb-4">
              <span>유료: {stars.paid}개</span>
              <span>보너스: {stars.bonus}개</span>
            </div>
            <PrimaryButton
              type="button"
              variant="gold"
              fullWidth
              onClick={() => navigate("/purchase")}
            >
              별 구매하기
            </PrimaryButton>
          </div>
        </div>

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
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-white mb-4">회원 탈퇴</h2>
            <p className="text-slate-300 text-sm mb-4 leading-relaxed">
              회원 탈퇴 시 모든 데이터가 삭제되며, 보유하신 별도 함께 소멸됩니다.
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
              <p className="text-red-300 text-sm">
                <strong>삭제될 데이터:</strong>
                <br />• 보유 별: {stars.total}개
                <br />• 상담 내역
                <br />• 구매 내역
                <br />• 프로필 정보
              </p>
            </div>
            <p className="text-slate-300 text-sm mb-2">
              계속하시려면 아래에 <strong>"탈퇴하기"</strong>를 입력해주세요.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="탈퇴하기"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmText !== "탈퇴하기"}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "처리 중..." : "탈퇴하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPage;
