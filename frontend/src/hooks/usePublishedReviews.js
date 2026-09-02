import { useEffect, useState } from "react";
import {
  fetchPublishedReviews,
  fetchReviewSummary,
  toReviewLanguage,
} from "../services/reviewService";

/**
 * 공개(published) 후기 목록 + 요약(개수·평균).
 * 현재 UI 언어의 후기를 우선 보여주고, 없으면 언어 무관 전체로 폴백한다.
 * 서비스별 랜딩에서는 service 를 넘겨 해당 서비스 후기만 가져올 수 있다.
 */
export function usePublishedReviews({ service = null, language = null, limit = 6 } = {}) {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({ count: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const lang = language ? toReviewLanguage(language) : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let list = await fetchPublishedReviews({ service, language: lang, limit });
        if (list.length === 0 && lang) {
          list = await fetchPublishedReviews({ service, language: null, limit });
        }
        const sum = await fetchReviewSummary({ service, language: null }).catch(() => ({
          count: list.length,
          avg: list.length
            ? Math.round((list.reduce((a, r) => a + (r.rating || 0), 0) / list.length) * 10) / 10
            : 0,
        }));
        if (cancelled) return;
        setReviews(list);
        setSummary(sum);
      } catch (err) {
        if (cancelled) return;
        console.error("후기 조회 실패:", err);
        setError(err);
        setReviews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [service, lang, limit]);

  return { reviews, summary, loading, error };
}
