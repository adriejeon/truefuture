import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { SITE_ORIGIN } from "../constants/seoMeta";
import BottomNavigation from "../components/BottomNavigation";

const FAQ_PAGE_TITLE_KEY = "faq.title";
const FAQ_PAGE_DESCRIPTION =
  "단순 운세 앱과의 차이점, 출생 차트 분석 원리, 소액 결제 방식 등 진짜미래의 1:1 맞춤형 AI 점성술 서비스에 대해 가장 많이 묻는 질문들을 확인해 보세요.";
const FAQ_JSON_LD_SCRIPT_ID = "faq-page-ld-json";

function FAQ() {
  const { t } = useTranslation();
  const [openSections, setOpenSections] = useState(new Set());

  // JSON-LD와 화면(UI)에 노출되는 Q/A 텍스트를 100% 동일하게 유지(숨김 텍스트 이슈 방지)
  const FAQ_ITEMS = useMemo(
    () => [
      {
        title: "진짜미래는 다른 무료 사주 사이트와 무엇이 다른가요?",
        content:
          "진짜미래는 정해진 텍스트를 출력하는 단순 무료 운세가 아닙니다. 오프라인 전문가에게 수십만 원을 지불해야 경험할 수 있는 정통 고전 점성술의 심층 해석 로직을 AI로 구현하여, 합리적인 소액 결제만으로 최고 수준의 1:1 맞춤형 상담을 제공합니다.",
      },
      {
        title: "자유 질문 상담소에서는 어떤 고민을 물어볼 수 있나요?",
        content:
          "연애, 이직, 금전 등 구체적이고 복잡한 고민을 자유롭게 텍스트로 입력해 주세요. 실제 점성술사와 대면 상담을 하듯, 고객님의 현재 상황과 질문의 맥락을 출생 차트와 결합하여 정교한 답변을 도출해 냅니다.",
      },
      {
        title: "상담 비용 결제는 어떻게 진행되나요?",
        content:
          "커피 한 잔 값의 부담 없는 소액 결제로 프리미엄 점성술 상담을 제공합니다. 국내 결제는 물론 해외 이용자를 위한 페이팔(PayPal) 결제도 안전하게 지원하고 있습니다.",
      },
    ],
    []
  );

  // FAQPage 스키마만 적용 (Organization/WebSite 등 메인 스키마는 포함하지 않음)
  const faqPageJsonLd = useMemo(() => {
    return {
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
    };
  }, [FAQ_ITEMS]);

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
        <title>{t(FAQ_PAGE_TITLE_KEY)}</title>
        <meta name="description" content={FAQ_PAGE_DESCRIPTION} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="진짜미래" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={t(FAQ_PAGE_TITLE_KEY)} />
        <meta property="og:description" content={FAQ_PAGE_DESCRIPTION} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={canonicalUrl} />
        <meta name="twitter:title" content={t(FAQ_PAGE_TITLE_KEY)} />
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
