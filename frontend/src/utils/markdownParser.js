/**
 * 마크다운 텍스트를 파싱하여 구조화된 데이터로 변환하는 유틸리티 함수
 *
 * @param {string} markdownText - 파싱할 마크다운 텍스트
 * @returns {{ intro: string, accordionSections: Array<{ title: string, summary?: string, content: string }> }}
 *   - intro: ## 헤더 없이 시작하는 서론 부분
 *   - accordionSections: 각 ## 헤더와 그 아래 내용으로 구성된 아코디언 섹션 배열
 *     - title: ## 헤더의 제목
 *     - summary: > 블록쿼트로 시작하는 요약 부분 (선택적)
 *     - content: 요약 다음의 본문 내용
 */
export function parseMarkdownToSections(markdownText) {
  if (!markdownText || typeof markdownText !== "string") {
    return { intro: "", accordionSections: [] };
  }

  // ## 헤더를 찾는 정규식 (멀티라인 모드) - 아코디언 제목으로 사용
  const accordionHeaderRegex = /^##\s+(.+)$/gm;
  const accordionMatches = [...markdownText.matchAll(accordionHeaderRegex)];

  // ## 헤더가 없으면 전체를 intro로 처리하고 아코디언 없음
  if (accordionMatches.length === 0) {
    return { intro: markdownText.trim(), accordionSections: [] };
  }

  // 첫 번째 ## 헤더 전의 내용을 intro로 추출
  const firstAccordionIndex = accordionMatches[0].index;
  const intro = markdownText.substring(0, firstAccordionIndex).trim();

  const accordionSections = [];

  // 각 ## 헤더와 다음 ## 헤더 사이의 내용을 추출
  for (let i = 0; i < accordionMatches.length; i++) {
    const match = accordionMatches[i];
    const title = match[1].trim(); // 헤더 텍스트 (## 제외)
    const startIndex = match.index + match[0].length; // 헤더 다음 위치

    // 다음 ## 헤더 위치 또는 텍스트 끝까지
    const endIndex =
      i < accordionMatches.length - 1
        ? accordionMatches[i + 1].index
        : markdownText.length;

    let sectionContent = markdownText.substring(startIndex, endIndex).trim();

    // > 블록쿼트로 시작하는 요약 부분 추출 (여러 줄 지원)
    // > 로 시작하는 연속된 줄들을 모두 찾기
    const lines = sectionContent.split("\n");
    let blockquoteLines = [];
    let blockquoteEndIndex = 0;

    // 첫 줄이 > 로 시작하는지 확인
    if (lines.length > 0 && lines[0].trim().startsWith(">")) {
      // > 로 시작하는 연속된 줄들을 모두 수집
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim().startsWith(">")) {
          blockquoteLines.push(line);
          blockquoteEndIndex = j + 1;
        } else if (line.trim() === "" && j < lines.length - 1) {
          // 빈 줄이 나오면 요약 종료 (단, 마지막 줄이 아니어야 함)
          break;
        } else {
          // 일반 텍스트가 나오면 요약 종료
          break;
        }
      }
    }

    let summary = null;
    let content = sectionContent;

    if (blockquoteLines.length > 0) {
      // 요약 부분 추출 (앞의 > 제거하고 여러 줄을 하나의 문자열로 합치기)
      summary = blockquoteLines
        .map((line) => line.replace(/^>\s*/, "").trim())
        .filter((line) => line.length > 0)
        .join(" ")
        .trim();

      // 요약 부분을 제거한 나머지가 본문
      // blockquoteLines의 모든 줄을 제거
      const remainingLines = lines.slice(blockquoteEndIndex);
      // 첫 번째 빈 줄 제거 (요약과 본문 사이의 구분선)
      if (remainingLines.length > 0 && remainingLines[0].trim() === "") {
        remainingLines.shift();
      }
      content = remainingLines.join("\n").trim();
    }

    // 제목과 내용이 모두 있는 경우에만 섹션 추가
    if (title && (summary || content)) {
      accordionSections.push({
        title,
        ...(summary && { summary }),
        content: content || "",
      });
    }
  }

  return { intro, accordionSections };
}
