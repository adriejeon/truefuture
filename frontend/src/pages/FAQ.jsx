import { Link } from "react-router-dom";
import { getSeoLanguage } from "../i18n";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PAGE_SEO, FAQ_PAGE_DESCRIPTION } from "../constants/siteSeo";
import { SITE_FAQ_ITEMS } from "../constants/faqItems";
import { buildFaqPageGraph } from "../utils/pageJsonLd";
import PageSeo from "../components/PageSeo";
import BottomNavigation from "../components/BottomNavigation";


function FAQ() {
  const { t, i18n } = useTranslation();
  const tSeo = i18n.getFixedT(getSeoLanguage()); // SEO 문구는 직접 고른 언어가 없으면 한국어
  const [openSections, setOpenSections] = useState(new Set());

  // 화면(UI)과 FAQPage 구조화 데이터가 같은 배열을 쓴다 — constants/faqItems.js 가 단일 소스
  const FAQ_ITEMS = SITE_FAQ_ITEMS;
  const faqNodes = useMemo(
    () => buildFaqPageGraph({ title: tSeo(PAGE_SEO.faq.titleKey), items: FAQ_ITEMS }),
    [FAQ_ITEMS, tSeo]
  );

  const toggleSection = (index) => {
    setOpenSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };


  return (
    <>
      <PageSeo
        path={PAGE_SEO.faq.path}
        title={tSeo(PAGE_SEO.faq.titleKey)}
        description={FAQ_PAGE_DESCRIPTION}
        ogType={PAGE_SEO.faq.ogType}
        nodes={faqNodes}
      />

      <div className="w-full py-8 sm:py-12">
        <div className="max-w-[600px] mx-auto px-4 pb-20">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors duration-200 mb-6"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            {t("faq.back_home")}
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 text-primary">
            {t("faq.title")}
          </h1>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => (
              <div
                key={index}
                className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-xl border border-slate-700 overflow-hidden transition-all duration-200"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(index)}
                  aria-expanded={openSections.has(index)}
                  aria-controls={`faq-panel-${index}`}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-700/50 transition-colors duration-200"
                >
                  <span className="text-lg font-semibold text-white pr-4">
                    {item.title}
                  </span>
                  <svg
                    className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${
                      openSections.has(index) ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* 답변은 항상 DOM에 유지(Tailwind hidden = display:none). {isOpen && ...} 조건부 렌더링 사용 안 함(GEO). */}
                <div
                  id={`faq-panel-${index}`}
                  className={
                    openSections.has(index)
                      ? "px-6 pb-6 pt-2 border-t border-slate-700 block"
                      : "hidden"
                  }
                  aria-hidden={!openSections.has(index)}
                >
                  <div
                    className="terms-content-section prose prose-invert max-w-none text-slate-300 leading-relaxed"
                    style={{
                      fontSize: "0.95rem",
                      lineHeight: "1.7",
                    }}
                  >
                    <p>{item.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BottomNavigation />
    </>
  );
}

export default FAQ;
