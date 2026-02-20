/**
 * 그레이스케일 쉬머(Shimmer) 스켈레톤
 * - 제목 1줄 + 본문 3~4줄 형태로 문단 구조를 흉내 내어 스트리밍 대기 시 기대감을 줌.
 * - 빛이 왼쪽 → 오른쪽으로 부드럽게 지나가는 효과 (Tailwind animate-shimmer)
 */
function ShimmerBar({ className = "" }) {
  return (
    <div
      className={`relative overflow-hidden rounded bg-slate-700/40 ${className}`}
      aria-hidden
    >
      <div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-slate-400/25 to-transparent animate-shimmer"
        style={{ willChange: "transform" }}
      />
    </div>
  );
}

export default function ShimmerSkeleton({ className = "" }) {
  return (
    <div
      className={`flex flex-col gap-3 ${className}`}
      aria-label="로딩 중"
    >
      {/* 제목 위치: 짧은 박스 1개 */}
      <ShimmerBar className="h-5 w-3/4 max-w-[240px] rounded-md" />
      {/* 본문 위치: 긴 박스 3~4개 */}
      <ShimmerBar className="h-4 w-full rounded-md" />
      <ShimmerBar className="h-4 w-full rounded-md" />
      <ShimmerBar className="h-4 w-full rounded-md" />
      <ShimmerBar className="h-4 w-2/3 max-w-[320px] rounded-md" />
    </div>
  );
}
