import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { SITE_ORIGIN } from "../constants/seoMeta";
import BottomNavigation from "../components/BottomNavigation";

const FAQ_ITEMS = [
  {
    title: "썸남, 짝남과의 매일매일의 관계 변화나 연락운도 볼 수 있나요?",
    content:
      "물론입니다. '진짜미래' 페이지의 자유 질문 기능을 통해 매일 변하는 별의 위치를 정밀하게 계산하여 오늘은 먼저 연락하기 좋은 날인지, 데이트할 때 어떤 분위기가 전개될지 하루하루 다이나믹하게 변하는 디테일한 연애운을 확인할 수 있습니다.",
  },
  {
    title: "고백받을 시기나 헤어진 연인과의 재회 타이밍처럼 구체적인 날짜도 알 수 있나요?",
    content:
      "네, 가능합니다. '진짜미래' 페이지에서 내 현재 상황과 궁금한 점을 자유롭게 텍스트로 질문해 보세요. 정해진 결과만 보여주는 것이 아니라, 정통 서양 고전 점성학의 정교한 연산을 통해 가장 확률이 높은 결정적 타이밍(연락, 고백, 재회 시기)을 명확하게 답변해 드립니다.",
  },
  {
    title: "동성 연애나 비밀 사내 연애, 혹은 아이돌 짝사랑 궁합처럼 남에게 말하기 민망한 질문도 괜찮나요?",
    content:
      "진짜미래는 100% 비대면 자동화 시스템으로 완벽한 프라이버시를 보장합니다. 성별에 얽매이지 않는 퀴어 궁합, 최애 아이돌과의 궁합 등 대면 상담에서 사람에게 직접 묻기 부끄러운 어떤 은밀한 고민이라도 눈치 보지 않고 편안하게 분석해 드립니다.",
  },
  {
    title: "일반 사주나 타로 앱(점신 등)과 비교했을 때 연애운 분석의 차이점이 뭔가요?",
    content:
      "단순히 미리 쓰인 운세 텍스트를 띄워주는 방식이 아닙니다. 진짜미래는 개인의 태어난 시간과 장소를 기반으로 한 '출생 차트'를 분석하며, 내 구체적인 상황에 맞춘 '자유 질문'이 가능합니다. 압도적인 단골 재방문율이 그 적중률과 전문성을 증명합니다.",
  },
  {
    title: "자유롭게 질문하면 사람이 직접 답변해 주는 건가요?",
    content:
      "아닙니다. 수많은 실전 상담으로 검증된 점성술 전문가의 해독 로직을 100% 시스템화한 AI 운명 컨설팅입니다. 기다릴 필요 없이 즉각적으로, 사람의 주관이 섞이지 않은 객관적이고 예리한 점성학적 해답을 제공받을 수 있습니다.",
  },
];

const FAQ_PAGE_TITLE =
  "자주 묻는 질문(FAQ) | 정통 점성술 컨설팅 진짜미래";
const FAQ_PAGE_DESCRIPTION =
  "정통 점성술과 일반 별자리 운세의 차이점, 진짜미래 서비스 이용 방법 등 궁금해하시는 질문들에 대한 상세한 답변을 확인하세요. 20년 경력의 전문성이 담긴 정밀 컨설팅을 제공합니다.";
const FAQ_JSON_LD_SCRIPT_ID = "faq-page-ld-json";

function FAQ() {
  const [openSections, setOpenSections] = useState(new Set());

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
    []
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
            홈으로 돌아가기
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 text-primary">
            자주 묻는 질문
          </h1>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => (
              <div
                key={index}
                className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-xl border border-slate-700 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggleSection(index)}
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

                {openSections.has(index) && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-700">
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
                )}
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
