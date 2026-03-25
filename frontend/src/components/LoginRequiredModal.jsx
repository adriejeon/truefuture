import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PrimaryButton from "./PrimaryButton";

/**
 * 프로필 입력/선택 등 액션 시 비로그인 사용자에게 띄우는 모달.
 * "로그인하기" 클릭 시 /login으로 이동하며, 로그인 완료 후 원래 페이지로 복귀할 수 있도록 state.from 전달.
 */
function LoginRequiredModal({ isOpen, onClose, description }) {
  const { t } = useTranslation();
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
          {t("login_required_modal.title")}
        </h2>
        <p className="text-slate-300 text-sm sm:text-base mb-6">
          {description || t("login_required_modal.default_desc")}
        </p>
        <div className="flex flex-col gap-2">
          <PrimaryButton variant="gold" fullWidth onClick={handleLogin}>
            {t("login_required_modal.login_btn")}
          </PrimaryButton>
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

export default LoginRequiredModal;
