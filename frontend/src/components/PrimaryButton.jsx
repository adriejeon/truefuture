/**
 * 중요 CTA 버튼 (로그인하기, 진짜미래 확인하기, 진짜미래 보러가기 등)
 * variant: "gold" = primary 배경 + 검정 텍스트 / "gradient" = 그라데이션 배경 + 흰 텍스트
 */
import { colors } from "../constants/colors";

const CTA_GRADIENT =
  "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)";
const CTA_HOVER_SHADOW_CLASS =
  "hover:shadow-[0_0_8px_rgba(97,72,235,0.3),0_0_12px_rgba(255,82,82,0.2)]";
const GOLD_HOVER = "#C99A2F";
const BASE_CLASS =
  "inline-flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-3.5 px-4 sm:px-6 text-lg font-semibold rounded-full shadow-lg transition-all duration-300 touch-manipulation";

export default function PrimaryButton({
  as: Component = "button",
  href,
  variant = "gradient", // "gold" | "gradient"
  disabled = false,
  loading = false,
  fullWidth = false,
  className = "",
  children,
  ...rest
}) {
  const isGold = variant === "gold";
  const baseStyle = {
    position: "relative",
    zIndex: 1,
    ...(isGold
      ? { backgroundColor: colors.primary, color: "#000000" }
      : { background: CTA_GRADIENT, color: "#ffffff" }),
  };
  const widthClass = fullWidth ? "w-full" : "";
  const disabledClass =
    Component === "button" && disabled
      ? "opacity-50 cursor-not-allowed"
      : isGold
        ? ""
        : CTA_HOVER_SHADOW_CLASS;
  const textClass = isGold ? "text-black" : "text-white";
  const combinedClassName = [
    BASE_CLASS,
    textClass,
    widthClass,
    disabledClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = loading ? (
    <>
      <svg
        className={`animate-spin h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${isGold ? "text-black" : "text-white"}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span>미래를 계산하는 중...</span>
    </>
  ) : (
    children
  );

  // 골드 버튼 호버 시 배경색 변경 (a/Link는 onMouseEnter/Leave로 처리)
  const style =
    Component !== "button" && isGold
      ? {
          ...baseStyle,
          cursor: "pointer",
        }
      : baseStyle;
  const goldHoverProps =
    isGold && Component !== "button"
      ? {
          onMouseEnter: (e) => {
            e.currentTarget.style.backgroundColor = GOLD_HOVER;
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.backgroundColor = colors.primary;
          },
        }
      : {};
  const buttonGoldHoverProps =
    isGold && Component === "button"
      ? {
          onMouseEnter: (e) => {
            if (!disabled && !loading)
              e.currentTarget.style.backgroundColor = GOLD_HOVER;
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.backgroundColor = colors.primary;
          },
        }
      : {};
  const mergedRest = { ...rest, ...goldHoverProps, ...buttonGoldHoverProps };

  if (Component === "a") {
    return (
      <a
        href={href}
        className={combinedClassName}
        style={style}
        {...mergedRest}
      >
        {content}
      </a>
    );
  }

  if (Component === "button" || Component === undefined) {
    return (
      <button
        type={rest.type ?? "button"}
        disabled={disabled || loading}
        className={combinedClassName}
        style={style}
        {...mergedRest}
      >
        {content}
      </button>
    );
  }

  // as={Link} 등 커스텀 컴포넌트 (to 등 rest 전달)
  return (
    <Component
      className={combinedClassName}
      style={style}
      {...mergedRest}
    >
      {content}
    </Component>
  );
}
