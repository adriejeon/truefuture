import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { checkIsAdmin } from "../services/reviewService";

/**
 * 현재 로그인 사용자가 운영 관리자(admin_users)인지 확인.
 * 서버 RPC is_admin() 결과를 그대로 사용하므로 클라이언트 조작 불가(실제 권한은 RLS 가 판정).
 */
export function useIsAdmin() {
  const { user, loadingAuth } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    checkIsAdmin()
      .then((v) => {
        if (!cancelled) setIsAdmin(!!v);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, loadingAuth]);

  return { isAdmin, checking, user, loadingAuth };
}
