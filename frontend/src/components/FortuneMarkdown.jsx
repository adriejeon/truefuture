import ReactMarkdown from "react-markdown";
import { normalizeFortuneMarkdown } from "../utils/normalizeFortuneMarkdown";

/**
 * 운세/상담/타로 결과 전용 Markdown 렌더러.
 * ReactMarkdown 과 동일한 인터페이스지만, 렌더 직전에 normalizeFortuneMarkdown 으로
 * (1) 볼드 깨짐(예: `**'컬러'**와`) 교정 (2) 볼드 라벨/서브텍스트 줄바꿈을 적용한다.
 *
 * 기존 `<ReactMarkdown>{text}</ReactMarkdown>` 를 이 컴포넌트로 바꾸기만 하면 된다.
 */
export default function FortuneMarkdown({ children, ...props }) {
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.filter((c) => typeof c === "string").join("")
        : children == null
          ? ""
          : String(children);
  return <ReactMarkdown {...props}>{normalizeFortuneMarkdown(text)}</ReactMarkdown>;
}
