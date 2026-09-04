import { ChevronDown } from "lucide-react";
import { getPageIntro } from "../constants/pageIntro.js";

/**
 * 공개 서비스 페이지 하단 '페이지 설명 보기' 아코디언.
 *
 * · 아코디언은 하나다. 접었을 때는 토글 한 줄만 보이고, 펼치면 목적·제공 내용·입력 정보·
 *   결과물·가격이 한 번에 나온다.
 * · 내용은 constants/pageIntro.js 가 단일 소스. 빌드 시 프리렌더(src/prerender/entry.jsx)가
 *   이 컴포넌트를 react-dom/server 로 그대로 렌더해 최초 HTML 에 넣으므로,
 *   hydration 후 DOM 과 텍스트·구조가 같다.
 * · 기본 접힘은 네이티브 <details> 로 처리한다 — display:none·sr-only 같은 숨김 기법을 쓰지 않으며
 *   사용자가 열어 볼 수 있는 내용만 크롤러에도 보인다.
 * · 스타일은 리포트 랜딩 FAQ(ReportLanding.ReportFaq)와 같은 토큰을 쓴다.
 * · 훅을 쓰지 않는다(서버 렌더 호환). 언어·설명은 호출자가 넘긴다.
 *
 * @param {{ pageKey: string, lang?: "ko"|"en", description?: string|null, className?: string }} props
 *   description: 그 페이지의 meta description — '페이지 목적' 본문으로 그대로 쓰여 본문·meta·JSON-LD 가 일치한다
 */
function PageIntro({ pageKey, lang = "ko", description = null, className = "" }) {
  const { toggle, items } = getPageIntro(pageKey, lang, { description });
  const headingId = `page-intro-${pageKey}`;

  return (
    <section aria-labelledby={headingId} className={`w-full py-8 ${className}`} data-page-intro={pageKey}>
      <details className="group rounded-xl border border-slate-700 bg-slate-800/30 open:bg-slate-800/50">
        <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <h2 id={headingId} className="text-sm font-semibold text-white m-0">
            {toggle}
          </h2>
          <ChevronDown
            className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
            strokeWidth={2}
            aria-hidden="true"
          />
        </summary>

        <div className="px-4 pb-4 pt-1 border-t border-slate-700 space-y-4">
          {items.map((item) => (
            <div key={item.key}>
              <h3 className="text-xs font-semibold text-slate-200 mt-3 mb-1.5 text-left">{item.title}</h3>
              {Array.isArray(item.body) ? (
                <ul className="pl-4 text-xs text-slate-300 leading-relaxed list-disc space-y-1 text-left">
                  {item.body.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed text-left">{item.body}</p>
              )}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

export default PageIntro;
