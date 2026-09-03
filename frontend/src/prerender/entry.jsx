/**
 * 빌드 시 프리렌더용 서버 엔트리.
 * `vite build --ssr src/prerender/entry.jsx --outDir dist-ssr` 로 번들되고,
 * scripts/prerender-pages.js 가 dist-ssr/entry.js 를 import 해 화면과 같은 컴포넌트를 HTML 문자열로 만든다.
 *
 * 여기서 렌더하는 컴포넌트는 훅·브라우저 API 를 쓰지 않아야 한다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import PageIntro from "../components/PageIntro.jsx";

/** @param {{ pageKey: string, lang?: "ko"|"en", description?: string|null, className?: string }} props */
export function renderPageIntro(props) {
  return renderToStaticMarkup(<PageIntro {...props} />);
}
