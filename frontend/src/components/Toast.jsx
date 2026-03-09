import { useEffect } from "react";

/**
 * 하단 중앙에 잠깐 보였다가 사라지는 토스트.
 * @param {{ message: string | null, onDismiss: () => void, duration?: number }} props
 */
export default function Toast({ message, onDismiss, duration = 2500 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-lg bg-slate-700/95 text-white text-sm font-medium shadow-lg border border-slate-600 animate-[fadeIn_0.2s_ease-out]"
      role="alert"
    >
      {message}
    </div>
  );
}
