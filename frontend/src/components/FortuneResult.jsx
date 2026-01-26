import { useState, useMemo, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { parseMarkdownToSections } from '../utils/markdownParser'

function FortuneResult({ title, interpretation, shareId, isShared = false }) {
  // 디버깅: shareId 확인
  useEffect(() => {
    console.log(`[FortuneResult] ${title} - shareId:`, shareId)
  }, [shareId, title])

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

  // 카카오톡 공유하기
  const handleKakaoShare = () => {
    console.log('🔗 [카카오톡 공유] 시작')
    console.log('  - Kakao 초기화 여부:', window.Kakao?.isInitialized())
    console.log('  - shareId:', shareId)
    
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      alert('카카오톡 공유 기능을 사용할 수 없습니다.')
      return
    }

    if (!shareId) {
      alert('공유할 운세 정보가 없습니다.')
      console.error('❌ shareId가 null입니다.')
      return
    }

    // [수정] URL API를 사용해서 현재 경로를 유지하면서 id만 교체
    const url = new URL(window.location.href)
    url.searchParams.set('id', shareId) // 기존 id가 있으면 덮어쓰고, 없으면 추가
    url.hash = '' // 해시(#) 제거 (카카오톡 공유 시 문제 방지)
    const shareUrl = url.toString()
    
    // 이미지 URL (로컬 개발 시 외부 이미지 사용)
    const isLocalhost = window.location.hostname === 'localhost'
    const imageUrl = isLocalhost
      ? 'https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png'
      : `${window.location.origin}/assets/truefuture.png`

    console.log('📍 [공유 URL 정보]')
    console.log('  - 현재 페이지:', window.location.href)
    console.log('  - 공유 URL:', shareUrl)
    console.log('  - 이미지 URL:', imageUrl)
    console.log('  - Origin:', window.location.origin)

    // 카카오 공유 설정 객체
    const kakaoShareConfig = {
      objectType: 'feed',
      content: {
        title: '진짜미래 - 당신의 운세를 확인해보세요',
        description: 'AI가 분석한 서양 점성술 결과입니다.',
        imageUrl: imageUrl,
        link: {
          mobileWebUrl: shareUrl,
          webUrl: shareUrl,
        },
      },
      // [중요] 클릭 가능한 버튼 추가
      buttons: [
        {
          title: '결과 확인하기',
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl,
          },
        },
      ],
    }

    console.log('📤 [카카오 공유 설정]', JSON.stringify(kakaoShareConfig, null, 2))

    try {
      window.Kakao.Share.sendDefault(kakaoShareConfig)
      console.log('✅ 카카오톡 공유 완료')
    } catch (error) {
      console.error('❌ 카카오톡 공유 실패:', error)
      alert('카카오톡 공유 중 오류가 발생했습니다: ' + error.message)
    }
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700" style={{ overflow: 'visible', position: 'relative', zIndex: 50 }}>
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          {title}
        </h2>
        
        {/* 카카오톡 공유 버튼 - 공유된 운세가 아닐 때만 표시 */}
        {!isShared && shareId ? (
          <button
            onClick={handleKakaoShare}
            className="flex items-center gap-2 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold rounded-lg transition-colors text-sm"
            title="카카오톡으로 공유하기"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C6.48 3 2 6.58 2 11c0 2.76 1.88 5.18 4.67 6.53-.2.72-.66 2.32-.76 2.69-.12.45.16.44.38.32.16-.09 2.59-1.73 3-2.01C10.15 18.83 11.05 19 12 19c5.52 0 10-3.58 10-8s-4.48-8-10-8z"/>
            </svg>
            <span className="hidden sm:inline">공유하기</span>
          </button>
        ) : null}
      </div>
      
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
