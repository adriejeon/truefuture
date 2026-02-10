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

      const { data, error: fetchError } = await supabase
        .from("user_wallets")
        .select("paid_stars, bonus_stars")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const paid = data?.paid_stars ?? 0;
      const bonus = data?.bonus_stars ?? 0;
      setStars({ paid, bonus, total: paid + bonus });
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
