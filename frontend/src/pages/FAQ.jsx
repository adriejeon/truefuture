import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { SITE_ORIGIN } from "../constants/seoMeta";
import BottomNavigation from "../components/BottomNavigation";

const FAQ_ITEMS = [
  {
    title:
      "일반적인 '별자리 운세'와 '진짜미래의 정통 점성술'은 무엇이 다른가요?",
    content:
      "시중의 별자리 운세는 태양이 위치한 별자리 하나만으로 전 세계 인구를 12가지 유형으로 분류하는 단순 가십에 가깝습니다. 반면 진짜미래의 정통 점성술은 태양뿐만 아니라 달, 수성, 금성, 화성, 목성, 토성 등 모든 행성의 위치와 그들 사이의 각도(Aspect), 그리고 출생 시간으로 결정되는 하우스(House) 시스템을 종합적으로 연산합니다. 이는 '기성복'과 '맞춤 정장'의 차이만큼이나 개인별 정밀도에서 극명한 차이를 보입니다.",
  },
  {
    title:
      "정통 점성술과 현대 심리 점성술은 어떤 점이 다른가요?",
    content:
      "현대 점성술이 주로 개인의 성격과 심리적 경향을 분석한다면, 정통 점성술은 실제 천체의 물리적 배치와 고전 기법을 통해 사건의 실질적인 발생 여부와 구체적인 길흉화복을 정교하게 예측하는 데 목적이 있습니다. 진짜미래는 수천 년간 검증된 고전의 원형 그대로를 현대적 알고리즘으로 구현합니다.",
  },
  {
    title:
      "왜 생년월일뿐만 아니라 태어난 '정확한 시간'이 중요한가요?",
    content:
      "고전 점성술에서 상승궁(Ascendant)은 약 4분마다 1도씩 변합니다. 정확한 태어난 시간은 당신의 인생 전체를 지배하는 '주인 행성'과 각 하우스의 영역을 결정하는 기준점이 됩니다. 이를 통해 연애, 재물, 직업 등 구체적인 운명의 흐름을 아주 상세하게 짚어낼 수 있습니다.",
  },
  {
    title: "컨설팅 결과 리포트는 나중에 다시 볼 수 있나요?",
    content:
      "네, 언제든 다시 확인하실 수 있습니다. 서비스 화면 헤더 좌측의 메뉴(과거 운세 결과 리스트)를 클릭하시면 지금까지 진행했던 모든 정통 점성술 컨설팅 결과를 한눈에 확인하고 다시 열람할 수 있습니다.",
  },
  {
    title: "컨설팅 결과를 다른 사람에게 공유할 수 있나요?",
    content:
      "네, 결과 화면 내의 링크 공유 기능을 통해 지인이나 가족에게 자신의 정통 점성술 컨설팅 결과를 간편하게 전달할 수 있습니다.",
  },
  {
    title: "1,000원이라는 가격에 전문 컨설팅이 가능한 이유는 무엇인가요?",
    content:
      "더 많은 분이 정통 고전 점성술 컨설팅의 가치를 경험하실 수 있도록 복잡한 수동 연산을 정밀한 자동화 시스템으로 완벽하게 구현했기 때문입니다. 전문가의 지식 체계는 유지하되, 기술을 통해 접근성을 높여 누구나 부담 없이 자신의 운명 지도를 확인할 수 있도록 돕습니다.",
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
