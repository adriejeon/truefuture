import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

function Terms() {
  const [termsContent, setTermsContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState(new Set());

  // HTML 콘텐츠를 파싱하여 아코디언 섹션으로 변환
  const parseTermsContent = (htmlContent) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const sections = [];

    // .terms-content 내부의 모든 요소 가져오기
    const termsContent = doc.querySelector(".terms-content");
    if (!termsContent) {
      return sections;
    }

    const allElements = Array.from(termsContent.children);
    let currentSection = null;

    allElements.forEach((element) => {
      if (element.tagName === "H3") {
        // 이전 섹션 저장
        if (currentSection) {
          sections.push(currentSection);
        }
        // 새 섹션 시작
        currentSection = {
          title: element.textContent || "",
          content: "",
        };
      } else if (currentSection) {
        // 현재 섹션에 내용 추가
        const content = element.outerHTML || element.textContent || "";
        if (currentSection.content) {
          currentSection.content += content;
        } else {
          currentSection.content = content;
        }
      }
    });

    // 마지막 섹션 추가
    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  };

  useEffect(() => {
    const fetchTerms = async () => {
      if (!supabase) {
        setError("Supabase 클라이언트가 초기화되지 않았습니다.");
        setLoading(false);
        return;
      }

      try {
        // 가장 최신 버전의 이용약관 가져오기
        const { data, error: fetchError } = await supabase
          .from("terms_definitions")
          .select("*")
          .eq("type", "terms")
          .lte("effective_at", new Date().toISOString())
          .order("version", { ascending: false })
          .order("effective_at", { ascending: false })
          .limit(1)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (data) {
          setTermsContent(data.content);
        } else {
          setError("약관 데이터를 찾을 수 없습니다.");
        }
      } catch (err) {
        console.error("약관 조회 오류:", err);
        setError("약관을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchTerms();
  }, []);

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

  const sections = termsContent ? parseTermsContent(termsContent) : [];

  return (
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
          이용약관
        </h1>

        {loading && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 sm:p-8 shadow-xl border border-slate-700">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto mb-4"></div>
                <p className="text-slate-400 text-sm">약관을 불러오는 중...</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 sm:p-8 shadow-xl border border-slate-700">
            <div className="text-red-400 text-center py-8">
              <p>{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && sections.length > 0 && (
          <div className="space-y-3">
            {sections.map((section, index) => (
              <div
                key={index}
                className="bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-xl border border-slate-700 overflow-hidden transition-all duration-200"
              >
                {/* 아코디언 헤더 */}
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-700/50 transition-colors duration-200"
                >
                  <span className="text-lg font-semibold text-white pr-4">
                    {section.title}
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

                {/* 아코디언 내용 */}
                {openSections.has(index) && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-700">
                    <div
                      className="terms-content-section prose prose-invert max-w-none text-slate-300 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: section.content }}
                      style={{
                        fontSize: "0.95rem",
                        lineHeight: "1.7",
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && !error && sections.length === 0 && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 sm:p-8 shadow-xl border border-slate-700">
            <p className="text-slate-400 text-center py-8">
              약관 내용이 없습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Terms;
