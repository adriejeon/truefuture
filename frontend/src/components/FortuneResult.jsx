import { useState, useMemo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { parseMarkdownToSections } from "../utils/markdownParser";
import { colors } from "../constants/colors";

/** 운세 한 줄 요약을 intro/섹션에서 추출 (최대 100자) */
function getDefaultShareSummary(intro, accordionSections) {
  const firstLine = (intro || "").trim().split(/\n/)[0]?.replace(/#{1,6}\s*/, "").trim() || "";
  const fromSection = accordionSections?.[0]?.summary?.trim();
  const text = firstLine || fromSection || (intro || "").trim().slice(0, 100);
  if (!text) return null;
  return text.length > 100 ? text.slice(0, 97) + "…" : text;
}

/** 데일리 운세 점수 추출 (## 오늘의 운세 점수 섹션에서 **오전:** XX점, **오후:** XX점 파싱) */
function parseDailyScores(interpretation) {
  if (!interpretation) return null;
  
  // "## 오늘의 운세 점수" 섹션 찾기
  const scoreMatch = interpretation.match(/##\s*오늘의 운세 점수\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!scoreMatch) return null;
  
  const scoreSection = scoreMatch[1];
  
  // **오전:** XX점, **오후:** XX점 파싱
  const morningMatch = scoreSection.match(/\*\*오전[:\s]*\*\*\s*(\d+)\s*점/i);
  const afternoonMatch = scoreSection.match(/\*\*오후[:\s]*\*\*\s*(\d+)\s*점/i);
  
  if (!morningMatch && !afternoonMatch) return null;
  
  return {
    morning: morningMatch ? parseInt(morningMatch[1], 10) : null,
    afternoon: afternoonMatch ? parseInt(afternoonMatch[1], 10) : null,
  };
}

function FortuneResult({ title, interpretation, shareId, isShared = false, shareSummary: shareSummaryProp, profileName: profileNameProp }) {
  // Markdown 파싱: ## 헤더를 아코디언으로 처리
  const { intro, accordionSections } = useMemo(() => {
    return parseMarkdownToSections(interpretation);
  }, [interpretation]);

  // 데일리 운세 점수 파싱
  const dailyScores = useMemo(() => {
    return parseDailyScores(interpretation);
  }, [interpretation]);

  // 카카오 공유용 한 줄 요약 (데일리 운세 시 "xx님의 오전 N점, 오후 M점. 오늘의 운세 점수는 평균점" 포함)
  const shareSummary = useMemo(() => {
    // 데일리 운세 점수가 있으면 카카오 메시지에 "xx님의 오전 N점, 오후 M점" + 오늘의 운세 중간 점수
    if (dailyScores && (dailyScores.morning != null || dailyScores.afternoon != null)) {
      const name = profileNameProp?.trim() ? `${profileNameProp}님의 ` : "";
      const parts = [];
      if (dailyScores.morning != null) parts.push(`오전 ${dailyScores.morning}점`);
      if (dailyScores.afternoon != null) parts.push(`오후 ${dailyScores.afternoon}점`);
      const avgScore = dailyScores.morning != null && dailyScores.afternoon != null
        ? Math.round((dailyScores.morning + dailyScores.afternoon) / 2)
        : dailyScores.morning ?? dailyScores.afternoon ?? 0;
      if (parts.length) return `${name}${parts.join(", ")}. 오늘의 운세 점수는 ${avgScore}점입니다`;
    }
    if (shareSummaryProp && shareSummaryProp.trim()) return shareSummaryProp.trim();
    if (dailyScores) {
      const avgScore = dailyScores.morning != null && dailyScores.afternoon != null
        ? Math.round((dailyScores.morning + dailyScores.afternoon) / 2)
        : dailyScores.morning ?? dailyScores.afternoon ?? 0;
      return `오늘의 운세 점수는 ${avgScore}점입니다`;
    }
    return getDefaultShareSummary(intro, accordionSections);
  }, [shareSummaryProp, intro, accordionSections, dailyScores, profileNameProp]);

  // 아코디언 열림/닫힘 상태 관리 (첫 번째는 기본적으로 열림)
  const [openSections, setOpenSections] = useState(() => new Set([0]));

  // accordionSections가 변경되면 첫 번째 섹션을 열어둠
  useEffect(() => {
    if (accordionSections.length > 0) {
      setOpenSections(new Set([0]));
    }
  }, [accordionSections.length]);

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

  // 주소 복사
  const handleCopyLink = () => {
    if (!shareId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("id", shareId);
    url.hash = "";
    const shareUrl = url.toString();
    navigator.clipboard.writeText(shareUrl).then(
      () => alert("링크가 복사되었어요. 친구에게 보내보세요!"),
      () => alert("복사에 실패했어요. 주소창의 링크를 복사해 주세요.")
    );
  };

  // 카카오톡 공유하기
  const handleKakaoShare = () => {
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      alert("카카오톡 공유 기능을 사용할 수 없습니다.");
      return;
    }

    if (!shareId) {
      alert("공유할 운세 정보가 없습니다.");
      console.error("❌ shareId가 null입니다.");
      return;
    }

    // [수정] 결제 파라미터 누출을 막기 위해 깨끗한 URL 생성
    const origin = window.location.origin;
    const pathname = window.location.pathname; // 예: /yearly 등 현재 경로만 가져옴
    const shareUrl = `${origin}${pathname}?id=${shareId}`;

    // 이미지 URL (로컬 개발 시 외부 이미지 사용)
    const isLocalhost = window.location.hostname === "localhost";
    const imageUrl = isLocalhost
      ? "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
      : `${window.location.origin}/assets/800x800.png`;

    // 카카오 공유 설정 객체 (요약이 있으면 한 줄 요약으로 노출)
    const description = shareSummary || "AI가 분석한 서양 점성술 결과입니다.";
    const kakaoShareConfig = {
      objectType: "feed",
      content: {
        title: shareSummary ? "진짜미래 - 운세 결과 공유" : "진짜미래 - 당신의 운세를 확인해보세요",
        description,
        imageUrl: imageUrl,
        link: {
          mobileWebUrl: shareUrl,
          webUrl: shareUrl,
        },
      },
      // [중요] 클릭 가능한 버튼 추가
      buttons: [
        {
          title: "결과 확인하기",
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl,
          },
        },
      ],
    };

    try {
      window.Kakao.Share.sendDefault(kakaoShareConfig);
    } catch (error) {
      console.error("❌ 카카오톡 공유 실패:", error);
      alert("카카오톡 공유 중 오류가 발생했습니다: " + error.message);
    }
  };

  return (
    <>
      {/* 제목과 공유 버튼 - 컨테이너 밖 */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-primary">{title}</h2>

        {/* 주소 복사 / 카카오톡 공유 - 공유된 운세가 아닐 때만 표시 */}
        {!isShared && shareId ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
              title="주소 복사"
            >
              <img src="/assets/copy.svg" alt="복사" className="w-5 h-5" />
            </button>
            <button
              onClick={handleKakaoShare}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
              title="카카오톡 공유하기"
            >
              <img src="/assets/share.svg" alt="공유" className="w-5 h-5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Intro (서론) - ## 헤더가 있을 때만 표시 (아코디언과 함께) */}
      {intro && accordionSections.length > 0 && (
        <div className="mb-4 sm:mb-6 prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed text-base break-words">
          <ReactMarkdown>{intro}</ReactMarkdown>
        </div>
      )}

      {/* 데일리 운세 점수 표시 */}
      {dailyScores && (dailyScores.morning || dailyScores.afternoon) && (
        <div className="mb-6 sm:mb-8">
          <div className="grid grid-cols-2 gap-4">
            {dailyScores.morning && (
              <div className="relative overflow-hidden rounded-xl p-6 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-400/30">
                <div className="text-center">
                  <div className="text-sm text-slate-300 mb-2">☀️ 오전</div>
                  <div className="text-4xl font-bold text-white mb-1">{dailyScores.morning}</div>
                  <div className="text-xs text-slate-400">점</div>
                </div>
              </div>
            )}
            {dailyScores.afternoon && (
              <div className="relative overflow-hidden rounded-xl p-6 bg-gradient-to-br from-orange-500/20 to-pink-500/20 border border-orange-400/30">
                <div className="text-center">
                  <div className="text-sm text-slate-300 mb-2">🌙 오후</div>
                  <div className="text-4xl font-bold text-white mb-1">{dailyScores.afternoon}</div>
                  <div className="text-xs text-slate-400">점</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 아코디언 섹션들 (## 헤더) - Real Tip은 제외하고 아코디언으로 표시 */}
      {accordionSections.length > 0 ? (
        <div className="space-y-2 sm:space-y-3">
          {accordionSections.map((section, index) => {
            const isRealTip = /Real\s*Tip/i.test((section.title || "").trim());
            if (isRealTip) return null;

            const isOpen = openSections.has(index);

            return (
              <div
                key={index}
                className="rounded-lg border border-slate-600/50 overflow-hidden transition-all duration-200 hover:border-slate-500"
                style={{ backgroundColor: "rgba(15, 15, 43, 0.3)" }}
              >
                {/* 아코디언 헤더 (버튼) - 타이틀만 포함 */}
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full flex items-center justify-between p-4 sm:p-5 text-left focus:outline-none transition-colors duration-200"
                  style={{
                    boxShadow: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${colors.primary}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#201F44";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "";
                  }}
                >
                  <h3 className="text-base sm:text-lg font-semibold text-white flex-1 pr-4">
                    {section.title}
                  </h3>
                  {/* 화살표 아이콘 */}
                  <svg
                    className={`w-5 h-5 sm:w-6 sm:h-6 text-slate-300 flex-shrink-0 transition-transform duration-300 ${
                      isOpen ? "transform rotate-180" : ""
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

                {/* 서브타이틀 (요약) - 버튼 아래 별도 영역 */}
                {section.summary && (
                  <div className="px-4 sm:px-5 pb-3 sm:pb-4 pt-0">
                    <p className="text-base text-slate-400 line-clamp-2">
                      {section.summary}
                    </p>
                  </div>
                )}

                {/* 아코디언 본문 (내용) */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
                    <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed text-base break-words">
                      <ReactMarkdown>{section.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* 데일리 운세 Real Tip: 아코디언 밖 별도 영역 (자유 상담소 Action Tip 스타일) */}
          {(() => {
            const realTipSection = accordionSections.find((s) =>
              /Real\s*Tip/i.test((s.title || "").trim())
            );
            if (!realTipSection) return null;
            // Gemini가 Real Tip 위에 넣는 메타/디바이스 문구 줄 제거
            const metaKeywords = /디바이스|기기|화면\s*에서|앱\s*에서|인터페이스|사용자\s*경험|^\s*UI\s|^\s*UX\s/;
            const tipContent = (realTipSection.content || "")
              .split("\n")
              .filter((line) => {
                const t = line.trim();
                return t && !metaKeywords.test(t);
              })
              .join("\n")
              .trim();
            if (!tipContent) return null;
            return (
              <div className="p-4 bg-[rgba(249,163,2,0.1)] border-2 border-[#F9A302] rounded-xl mt-4">
                <h3 className="text-lg font-semibold text-[#F9A302] mb-3 flex items-center gap-2">
                  💡 Real Tip
                </h3>
                <div className="prose prose-invert max-w-none prose-base text-slate-100 leading-relaxed text-base break-words">
                  <ReactMarkdown>{tipContent}</ReactMarkdown>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        /* 헤더가 없으면 intro와 동일한 내용 중복 방지: interpretation만 렌더 */
        <div className="prose prose-invert max-w-none prose-base text-slate-200 leading-relaxed text-base break-words">
          <ReactMarkdown>{interpretation}</ReactMarkdown>
        </div>
      )}
    </>
  );
}

export default FortuneResult;
