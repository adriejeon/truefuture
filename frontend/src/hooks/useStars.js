import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

export function useStars() {
  const { user } = useAuth();
  const [stars, setStars] = useState({ paid: 0, bonus: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStars = useCallback(async () => {
    if (!user?.id) {
      setStars({ paid: 0, bonus: 0, total: 0 });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // get_valid_stars RPC 함수를 사용하여 만료되지 않은 별만 조회
      const { data, error: fetchError } = await supabase.rpc("get_valid_stars", {
        p_user_id: user.id,
      });

      if (fetchError) {
        // RPC가 없으면 기존 방식으로 폴백
        const { data: walletData, error: walletError } = await supabase
          .from("user_wallets")
          .select("paid_stars, bonus_stars")
          .eq("user_id", user.id)
          .maybeSingle();

        if (walletError) throw walletError;

        const paid = walletData?.paid_stars ?? 0;
        const bonus = walletData?.bonus_stars ?? 0;
        setStars({ paid, bonus, total: paid + bonus });
      } else {
        const paid = data?.[0]?.paid_stars ?? 0;
        const bonus = data?.[0]?.bonus_stars ?? 0;
        setStars({ paid, bonus, total: paid + bonus });
      }
    } catch (err) {
      console.error("❌ 별 잔액 조회 실패:", err);
      setError(err.message);
      setStars({ paid: 0, bonus: 0, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchStars();
  }, [fetchStars]);

  return { stars, loading, error, refetchStars: fetchStars };
}
