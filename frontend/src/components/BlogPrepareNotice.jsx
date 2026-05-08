export default function BlogPrepareNotice() {
  return (
    <section
      className="flex min-h-[42vh] w-full flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 px-6 py-16 text-center shadow-sm"
      aria-live="polite"
    >
      <p className="text-lg font-semibold text-gray-900">블로그 글을 준비 중입니다.</p>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-600">
        잠시 후 다시 확인해 주세요.
      </p>
    </section>
  );
}
