import { useState, useEffect, useRef } from "react";

/** 스토리 진행용: 로딩 시작 시 순서대로 딱 한 번만 표시 */
const STORY_PHRASES = [
  "태어난 날의 우주를 보는 중...",
  "복잡한 실타래를 풀어가는 중...",
  "운명의 페이지를 펴는 중...",
  "별들의 이야기를 적는 중...",
];

/** 대기 지연용: 스토리 종료 후에도 로딩 중이면 이 문구들을 무한 반복 */
const LOOP_PHRASES = [
  "우주의 이야기를 듣는 중...",
  "진짜 미래를 찾는 중...",
  "과거를 되짚는 중...",
  "더 깊게 미래를 조각하는 중...",
  "정확한 해석을 위해 다시 보는 중...",
];

const FADEOUT_DURATION = 350;
const FADEIN_DURATION = 400;

/** sequenceIndex에 따라 현재 표시할 문구 결정 (스토리 → 루프) */
function getPhraseAt(sequenceIndex) {
  if (sequenceIndex < STORY_PHRASES.length) {
    return STORY_PHRASES[sequenceIndex];
  }
  const loopIndex =
    (sequenceIndex - STORY_PHRASES.length) % LOOP_PHRASES.length;
  return LOOP_PHRASES[loopIndex];
}

/**
 * TypewriterLoader
 * 스토리 문구를 순서대로 한 번만 보여준 뒤, 로딩이 길어지면 루프 문구를 무한 반복.
 * 한 글자씩 타이핑 → 완성 후 1.5~2초 대기 → 위로 페이드아웃 → 아래에서 페이드인 → 다음 문장 타이핑.
 * 문장 끝에 깜빡이는 커서(|) 표시.
 */
function TypewriterLoader({ typeSpeed = 80, pauseAfterType = 1700 }) {
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [phase, setPhase] = useState("typing"); // 'typing' | 'hold' | 'fadeOut' | 'fadeIn'
  const timeoutRef = useRef(null);
  const charIndexRef = useRef(0);

  const currentPhrase = getPhraseAt(sequenceIndex);
  charIndexRef.current = charIndex;

  // 타이핑: 한 글자씩 추가, 문장이 끝나면 hold
  useEffect(() => {
    if (phase !== "typing") return;
    let cancelled = false;
    const phrase = getPhraseAt(sequenceIndex);
    const tick = () => {
      if (cancelled) return;
      const idx = charIndexRef.current;
      if (idx < phrase.length) {
        setDisplayText(phrase.slice(0, idx + 1));
        setCharIndex((prev) => prev + 1);
        timeoutRef.current = setTimeout(tick, typeSpeed);
      } else {
        setPhase("hold");
      }
    };
    timeoutRef.current = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [phase, sequenceIndex, typeSpeed]);

  // hold → 1.5~2초 후 fadeOut
  useEffect(() => {
    if (phase !== "hold") return;
    const t = setTimeout(() => setPhase("fadeOut"), pauseAfterType);
    return () => clearTimeout(t);
  }, [phase, pauseAfterType]);

  // fadeOut → 다음 문장으로 전환 후 fadeIn (스토리 끝나면 루프로, sequenceIndex만 증가)
  useEffect(() => {
    if (phase !== "fadeOut") return;
    const t = setTimeout(() => {
      setSequenceIndex((prev) => prev + 1);
      setCharIndex(0);
      setDisplayText("");
      setPhase("fadeIn");
    }, FADEOUT_DURATION);
    return () => clearTimeout(t);
  }, [phase]);

  // fadeIn 종료 후 타이핑 시작
  useEffect(() => {
    if (phase !== "fadeIn") return;
    const t = setTimeout(() => setPhase("typing"), FADEIN_DURATION);
    return () => clearTimeout(t);
  }, [phase]);

  const isFadeOut = phase === "fadeOut";
  const isFadeIn = phase === "fadeIn";

  return (
    <div className="flex items-center justify-center w-full">
      <p
        className={`text-xl sm:text-2xl text-center ${
          isFadeOut ? "typewriter-fade-out-up" : ""
        } ${isFadeIn ? "typewriter-fade-in-up" : ""}`}
        style={{
          background: "linear-gradient(to right, #9785FE 0%, #FF9FA1 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        <span>{displayText}</span>
        {(phase === "typing" || phase === "hold" || phase === "fadeOut") && (
          <span
            className="animate-pulse inline-block align-middle ml-1"
            style={{
              background: "linear-gradient(to right, #9785FE 0%, #FF9FA1 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontSize: "1.35em",
              lineHeight: "1em",
              height: "1.35em",
              display: "inline-block",
            }}
            aria-hidden
          >
            |
          </span>
        )}
      </p>
    </div>
  );
}

export default TypewriterLoader;
export { STORY_PHRASES, LOOP_PHRASES };
