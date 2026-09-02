import { useState } from "react";
import { colors } from "../constants/colors";

const EMPTY_COLOR = "#3A3A5C";

/** /assets/favorite.svg 를 마스크로 쓰는 별 아이콘 (메인 페이지 별점과 동일한 모양) */
function StarGlyph({ filled, size }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 transition-colors duration-150"
      style={{
        width: size,
        height: size,
        maskImage: "url(/assets/favorite.svg)",
        WebkitMaskImage: "url(/assets/favorite.svg)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        backgroundColor: filled ? colors.primary : EMPTY_COLOR,
      }}
    />
  );
}

/**
 * 별점 표시/입력.
 *  - interactive=false: 읽기 전용 (리뷰 카드)
 *  - interactive=true : 탭/클릭으로 선택, 모바일 터치 영역 44px 보장
 * @param {{ value:number, onChange?:(n:number)=>void, interactive?:boolean, size?:number, className?:string, ariaLabel?:string }} props
 */
export default function StarRating({
  value = 0,
  onChange,
  interactive = false,
  size = 14,
  className = "",
  ariaLabel,
}) {
  const [hover, setHover] = useState(0);
  const shown = interactive && hover ? hover : value;

  if (!interactive) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 ${className}`}
        role="img"
        aria-label={ariaLabel || `별점 ${value}점`}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <StarGlyph key={i} filled={i <= Math.round(shown)} size={size} />
        ))}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center ${className}`}
      role="radiogroup"
      aria-label={ariaLabel || "별점 선택"}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i}점`}
          onClick={() => onChange?.(i)}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(0)}
          className="flex items-center justify-center w-11 h-11 rounded-full touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-95 transition-transform"
        >
          <StarGlyph filled={i <= shown} size={size} />
        </button>
      ))}
    </div>
  );
}
