import SocialLoginButtons from "../components/SocialLoginButtons";
import { useAuth } from "../hooks/useAuth";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { setPendingReferralCode } from "../utils/referral";

function Login() {
  const { t } = useTranslation();
  const { user, loadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refCode = params.get("ref");
    if (refCode?.trim()) {
      setPendingReferralCode(refCode.trim());
    }
  }, [location.search]);

  useEffect(() => {
    if (!loadingAuth && user && !verifying) {
      let cancelled = false;
      setVerifying(true);
      supabase?.auth
        .getUser()
        .then(({ data: { user: currentUser }, error }) => {
          if (cancelled) return;
          setVerifying(false);
          if (error || !currentUser) {
            supabase?.auth.signOut();
            return;
          }
          const from = location.state?.from?.pathname;
          navigate(from || "/", { replace: true });
        })
        .catch(() => {
          if (!cancelled) setVerifying(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [loadingAuth, user, navigate, location.state?.from?.pathname, verifying]);

  if (loadingAuth || (user && verifying)) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm sm:text-base">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-8 sm:py-12">
      <div className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24">
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            {t("login.title")}
          </h1>
          <p className="text-center text-slate-300 text-sm sm:text-base">
            {t("login.subtitle")}
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 md:p-8 shadow-xl border border-slate-700">
          <SocialLoginButtons />
        </div>

        <div className="mt-6 p-4 sm:p-5 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30">
          <p className="text-amber-200 font-medium text-center text-sm sm:text-base mb-1">
            {t("login.event_banner")}
          </p>
          <p className="text-amber-100/90 text-center text-sm sm:text-base">
            {t("login.event_banner_sub")}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
