import { useState, useEffect, useRef } from "react";

/** 스토리 진행용: 로딩 시작 시 순서대로 딱 한 번만 표시 */
const STORY_PHRASES = [
  "당신이 태어난 그날 밤의 별들을 기억해 내는 중...",
  "복잡한 인연의 실타래를 조심스럽게 풀어보고 있습니다...",
  "운명의 서고에서 당신의 페이지를 펼치고 있습니다...",
  "별들이 들려주는 이야기를 받아 적고 있습니다...",
];

/** 대기 지연용: 스토리 종료 후에도 로딩 중이면 이 문구들을 무한 반복 */
const LOOP_PHRASES = [
  "별들이 당신에게 속삭이는 이야기를 듣고 있습니다...",
  "수많은 미래의 갈래 중, 당신에게 닿을 빛을 찾는 중...",
  "당신의 지난 시간들이 만든 별자리를 읽어내려가는 중...",
  "조금 더 깊은 미래의 조각을 맞추는 중입니다...",
  "가장 정확한 해석을 위해 별들을 다시 살피고 있습니다...",
];

const FADEOUT_DURATION = 350;
const FADEIN_DURATION = 400;

/** sequenceIndex에 따라 현재 표시할 문구 결정 (스토리 → 루프) */
function getPhraseAt(sequenceIndex) {
  if (sequenceIndex < STORY_PHRASES.length) {
    return STORY_PHRASES[sequenceIndex];
  }
  const loopIndex = (sequenceIndex - STORY_PHRASES.length) % LOOP_PHRASES.length;
  return LOOP_PHRASES[loopIndex];
}

/**
 * TypewriterLoader
 * 스토리 문구를 순서대로 한 번만 보여준 뒤, 로딩이 길어지면 루프 문구를 무한 반복.
 * 한 글자씩 타이핑 → 완성 후 1.5~2초 대기 → 위로 페이드아웃 → 아래에서 페이드인 → 다음 문장 타이핑.
 * 문장 끝에 깜빡이는 커서(|) 표시.
 */
function TypewriterLoader({
  typeSpeed = 80,
  pauseAfterType = 1700,
}) {
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
    <div className="min-h-[4rem] flex items-center justify-center overflow-hidden">
      <p
        className={`text-slate-200 text-base sm:text-lg text-center min-h-[1.5em] ${
          isFadeOut ? "typewriter-fade-out-up" : ""
        } ${isFadeIn ? "typewriter-fade-in-up" : ""}`}
      >
        <span>{displayText}</span>
        {(phase === "typing" || phase === "hold") && (
          <span className="animate-pulse text-purple-300" aria-hidden>
            |
          </span>
        )}
      </p>
    </div>
  );
}

export default TypewriterLoader;
export { STORY_PHRASES, LOOP_PHRASES };
