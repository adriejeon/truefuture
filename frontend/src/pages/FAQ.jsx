import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { SITE_ORIGIN } from "../constants/seoMeta";
import BottomNavigation from "../components/BottomNavigation";

const FAQ_PAGE_TITLE =
  "자주 묻는 질문(FAQ) | 정통 점성술 컨설팅 진짜미래";
const FAQ_PAGE_DESCRIPTION =
  "정통 고전 점성술, 출생 차트 분석, 자유 질문 이용 방법 등 자주 묻는 질문과 답변입니다. 20년 경력 점성술 전문가 해석 로직을 시스템화한 AI 분석 서비스 진짜미래를 안내합니다.";
const FAQ_JSON_LD_SCRIPT_ID = "faq-page-ld-json";

function FAQ() {
  const { t } = useTranslation();
  const [openSections, setOpenSections] = useState(new Set());

  const FAQ_ITEMS = useMemo(() => [
    { title: t("faq.q1_title"), content: t("faq.q1_content") },
    { title: t("faq.q2_title"), content: t("faq.q2_content") },
    { title: t("faq.q3_title"), content: t("faq.q3_content") },
    { title: t("faq.q4_title"), content: t("faq.q4_content") },
    { title: t("faq.q5_title"), content: t("faq.q5_content") },
  ], [t]);

  const faqPageJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.title,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.content,
        },
      })),
    }),
    [FAQ_ITEMS]
  );

  useEffect(() => {
    const existing = document.getElementById(FAQ_JSON_LD_SCRIPT_ID);
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = FAQ_JSON_LD_SCRIPT_ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(faqPageJsonLd);
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById(FAQ_JSON_LD_SCRIPT_ID);
      if (el) el.remove();
    };
  }, [faqPageJsonLd]);

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

  const canonicalUrl = `${SITE_ORIGIN}/faq`;

  return (
    <>
      <Helmet>
        <title>{FAQ_PAGE_TITLE}</title>
        <meta name="description" content={FAQ_PAGE_DESCRIPTION} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={FAQ_PAGE_TITLE} />
        <meta property="og:description" content={FAQ_PAGE_DESCRIPTION} />
        <meta name="twitter:url" content={canonicalUrl} />
        <meta name="twitter:title" content={FAQ_PAGE_TITLE} />
        <meta name="twitter:description" content={FAQ_PAGE_DESCRIPTION} />
      </Helmet>

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
