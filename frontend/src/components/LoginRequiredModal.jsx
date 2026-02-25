import { useNavigate, useLocation } from "react-router-dom";
import PrimaryButton from "./PrimaryButton";

/**
 * 프로필 입력/선택 등 액션 시 비로그인 사용자에게 띄우는 모달.
 * "로그인하기" 클릭 시 /login으로 이동하며, 로그인 완료 후 원래 페이지로 복귀할 수 있도록 state.from 전달.
 */
function LoginRequiredModal({ isOpen, onClose, description }) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!isOpen) return null;

  const handleLogin = () => {
    onClose?.();
    navigate("/login", { state: { from: location } });
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-required-title"
    >
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md rounded-lg shadow-xl border border-slate-700 p-6 text-center"
        style={{ backgroundColor: "#0F0F2B" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="login-required-title" className="text-xl sm:text-2xl font-bold text-white mb-3">
          로그인이 필요합니다
        </h2>
        <p className="text-slate-300 text-sm sm:text-base mb-6">
          {description || "해당 서비스는 로그인 후 이용하실 수 있습니다."}
        </p>
        <div className="flex flex-col gap-2">
          <PrimaryButton variant="gold" fullWidth onClick={handleLogin}>
            로그인하기
          </PrimaryButton>
          <button
            type="button"
            onClick={onClose}
            className="py-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginRequiredModal;
