import { useEffect } from "react";

/**
 * JSON-LD <script type="application/ld+json"> 를 document.head 에 직접 삽입한다.
 * react-helmet-async 가 script 본문을 head 에 반영하지 않는 경우가 있어(AstrologyPageHelmet 참고)
 * 페이지마다 반복하던 useEffect 삽입 패턴을 한 곳으로 모았다.
 * 데이터가 바뀌면(예: 후기 로드 후 평점 추가) 같은 id 의 스크립트를 교체하고, 언마운트 시 제거한다.
 *
 * 프리렌더된 최초 HTML 에 같은 id 의 스크립트가 이미 있으면 그것을 교체하므로
 * 최초 HTML 과 hydration 후 DOM 에 같은 구조화 데이터가 두 벌 생기지 않는다.
 *
 * @param {string|null} id     script 요소 id. falsy 면 아무 것도 하지 않는다
 *                             (상위·하위 컴포넌트가 같은 id 로 서로의 스크립트를 지우는 것을 막기 위함)
 * @param {object|null} data   직렬화할 객체. null/undefined 면 기존 스크립트를 제거만 한다
 */
export function useJsonLd(id, data) {
  const json = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!id || typeof document === "undefined") return undefined;
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    if (!json) return undefined;
    const script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.textContent = json;
    document.head.appendChild(script);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, [id, json]);
}
