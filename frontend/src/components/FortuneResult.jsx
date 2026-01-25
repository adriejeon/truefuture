import { useState, useMemo, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { parseMarkdownToSections } from '../utils/markdownParser'

function FortuneResult({ title, interpretation }) {
  // Markdown 파싱: ## 헤더를 아코디언으로 처리
  const { intro, accordionSections } = useMemo(() => {
    return parseMarkdownToSections(interpretation)
  }, [interpretation])

  // 아코디언 열림/닫힘 상태 관리 (첫 번째는 기본적으로 열림)
  const [openSections, setOpenSections] = useState(() => new Set([0]))
  
  // accordionSections가 변경되면 첫 번째 섹션을 열어둠
  useEffect(() => {
    if (accordionSections.length > 0) {
      setOpenSections(new Set([0]))
    }
  }, [accordionSections.length])

  const toggleSection = (index) => {
    setOpenSections((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700" style={{ overflow: 'visible', position: 'relative', zIndex: 50 }}>
      <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
        {title}
      </h2>
      
      {/* Intro (서론) - 아코디언 바깥 상단에 표시 */}
      {intro && (
        <div className="mb-4 sm:mb-6 prose prose-invert max-w-none prose-sm sm:prose-base text-slate-200 leading-relaxed text-sm sm:text-base break-words">
          <ReactMarkdown>{intro}</ReactMarkdown>
        </div>
      )}

      {/* 아코디언 섹션들 (## 헤더) */}
      {accordionSections.length > 0 ? (
        <div className="space-y-2 sm:space-y-3">
          {accordionSections.map((section, index) => {
            const isOpen = openSections.has(index)
            
            return (
              <div
                key={index}
                className="bg-slate-700/50 rounded-lg border border-slate-600/50 overflow-hidden transition-all duration-200 hover:border-slate-500"
              >
                {/* 아코디언 헤더 (버튼) - 타이틀만 포함 */}
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full flex items-center justify-between p-4 sm:p-5 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors duration-200 hover:bg-slate-700/70"
                >
                  <h3 className="text-base sm:text-lg font-semibold text-white flex-1 pr-4">
                    {section.title}
                  </h3>
                  {/* 화살표 아이콘 */}
                  <svg
                    className={`w-5 h-5 sm:w-6 sm:h-6 text-slate-300 flex-shrink-0 transition-transform duration-300 ${
                      isOpen ? 'transform rotate-180' : ''
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
                    <p className="text-xs sm:text-sm text-slate-400 line-clamp-2">
                      {section.summary}
                    </p>
                  </div>
                )}

                {/* 아코디언 본문 (내용) */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
                    <div className="prose prose-invert max-w-none prose-sm sm:prose-base text-slate-200 leading-relaxed text-sm sm:text-base break-words">
                      <ReactMarkdown>{section.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* 헤더가 없는 경우 기존 방식으로 렌더링 */
        <div className="prose prose-invert max-w-none prose-sm sm:prose-base text-slate-200 leading-relaxed text-sm sm:text-base break-words">
          <ReactMarkdown>{interpretation}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default FortuneResult
