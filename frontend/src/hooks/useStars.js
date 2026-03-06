import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

export function useStars() {
  const { user } = useAuth();
  const [stars, setStars] = useState({ paid: 0, bonus: 0, probe: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStars = useCallback(async () => {
    if (!user?.id) {
      setStars({ paid: 0, bonus: 0, probe: 0, total: 0 });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // get_valid_stars RPC 함수를 사용하여 만료되지 않은 운세권만 조회 (paid/bonus/probe/total)
      const { data, error: fetchError } = await supabase.rpc("get_valid_stars", {
        p_user_id: user.id,
      });

      if (fetchError) {
        // RPC 에러가 발생하면 기존 방식으로 폴백 (콘솔 에러는 조용히 처리)
        console.warn("⚠️ get_valid_stars RPC 실패, 폴백 모드 사용:", fetchError.message);

        const { data: walletData, error: walletError } = await supabase
          .from("user_wallets")
          .select("paid_stars, bonus_stars, probe_stars")
          .eq("user_id", user.id)
          .maybeSingle();

        if (walletError) throw walletError;

        const paid = walletData?.paid_stars ?? 0;
        const bonus = walletData?.bonus_stars ?? 0;
        const probe = walletData?.probe_stars ?? 0;
        setStars({ paid, bonus, probe, total: paid + bonus + probe });
      } else {
        // RPC 성공 시 데이터 사용 (DB가 paid_stars, bonus_stars, probe_stars, total_stars 반환)
        const row = data?.[0];
        const paid = row?.paid_stars ?? 0;
        const bonus = row?.bonus_stars ?? 0;
        const probe = row?.probe_stars ?? 0;
        const total = row?.total_stars ?? paid + bonus + probe;
        setStars({ paid, bonus, probe, total });
      }
    } catch (err) {
      console.error("❌ 운세권 잔액 조회 실패:", err);
      setError(err.message);
      setStars({ paid: 0, bonus: 0, probe: 0, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchStars();
  }, [fetchStars]);

  return { stars, loading, error, refetchStars: fetchStars };
}
