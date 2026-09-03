import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPublishedReviews,
  fetchReviewSummary,
  toReviewLanguage,
} from "../services/reviewService";

/**
 * 공개(published) 후기 목록 + 요약(개수·평균).
 * 현재 UI 언어의 후기를 우선 보여주고, 없으면 언어 무관 전체로 폴백한다.
 * 서비스별 랜딩에서는 service 를 넘겨 해당 서비스 후기만 가져올 수 있다.
 *
 * pageSize 를 주면 페이지 단위로 끊어 받고 loadMore 로 이어붙인다(가로 무한 스크롤).
 * 이때 전체 공개 후기에 상한은 없다 — 스크롤이 끝에 닿는 만큼 계속 불러온다.
 * pageSize 없이 limit 만 주면 예전처럼 한 번에 limit 개만 가져오는 고정 목록이다.
 */
export function usePublishedReviews({
  service = null,
  language = null,
  limit = 6,
  pageSize = 0,
} = {}) {
  const paged = pageSize > 0;
  const step = paged ? pageSize : limit;

  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({ count: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  // 다음 페이지도 첫 페이지와 같은 조건으로 이어받기 위한 상태
  const langRef = useRef(null); // 폴백까지 반영된 실제 언어 필터
  const offsetRef = useRef(0); // 지금까지 받아온 행 수
  const busyRef = useRef(false); // 스크롤 중 중복 호출 방지 (state 는 갱신이 늦다)
  const hasMoreRef = useRef(false); // loadMore 를 state 갱신 전에 다시 불러도 안전하도록

  const lang = language ? toReviewLanguage(language) : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    busyRef.current = false;
    hasMoreRef.current = false;
    offsetRef.current = 0;

    (async () => {
      try {
        let usedLang = lang;
        let list = await fetchPublishedReviews({ service, language: lang, limit: step });
        if (list.length === 0 && lang) {
          usedLang = null;
          list = await fetchPublishedReviews({ service, language: null, limit: step });
        }
        // 요약(개수·평균)은 화면에 보이는 후기와 같은 언어 범위로 계산해 숫자가 어긋나지 않게 한다
        const sum = await fetchReviewSummary({ service, language: usedLang }).catch(() => ({
          count: list.length,
          avg: list.length
            ? Math.round((list.reduce((a, r) => a + (r.rating || 0), 0) / list.length) * 10) / 10
            : 0,
        }));
        if (cancelled) return;
        langRef.current = usedLang;
        offsetRef.current = list.length;
        setReviews(list);
        setSummary(sum);
        hasMoreRef.current = paged && list.length === step;
        setHasMore(hasMoreRef.current);
      } catch (err) {
        if (cancelled) return;
        console.error("후기 조회 실패:", err);
        setError(err);
        setReviews([]);
        hasMoreRef.current = false;
        setHasMore(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [service, lang, step, paged]);

  /** 다음 페이지를 목록 뒤에 이어붙인다. 더 없으면 hasMore 를 내린다. */
  const loadMore = useCallback(async () => {
    if (!paged || busyRef.current || !hasMoreRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const next = await fetchPublishedReviews({
        service,
        language: langRef.current,
        limit: pageSize,
        offset: offsetRef.current,
      });
      offsetRef.current += next.length;
      // 검수 상태가 중간에 바뀌어 페이지가 밀리는 경우를 대비해 id 로 중복을 걸러낸다
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...next.filter((r) => !seen.has(r.id))];
      });
      hasMoreRef.current = next.length === pageSize;
      setHasMore(hasMoreRef.current);
    } catch (err) {
      console.error("후기 추가 조회 실패:", err);
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [paged, pageSize, service]);

  return { reviews, summary, loading, loadingMore, hasMore, error, loadMore };
}
