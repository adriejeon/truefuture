import { useEffect } from "react";

/** 로그인·마이페이지·결제완료 등 검색 노출이 불필요한 페이지에 robots noindex 메타를 붙인다 */
export default function useNoIndex() {
  useEffect(() => {
    const el = document.createElement("meta");
    el.name = "robots";
    el.content = "noindex, nofollow";
    el.dataset.tfNoindex = "1";
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
}
