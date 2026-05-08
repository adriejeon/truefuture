import { Link, useLocation } from "react-router-dom";

export default function BlogHeader() {
  const location = useLocation();
  const isDetail = /^\/blog\/[^/]+$/.test(location.pathname);

  return (
    <header className="mb-10 flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-8">
      <div className="min-w-0 flex-1">
        {isDetail ? (
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
          >
            <span aria-hidden>←</span>
            <span>블로그 목록</span>
          </Link>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
              블로그
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">
              진짜미래 점성술·사주 서비스와 함께 읽는 칼럼입니다.
            </p>
          </>
        )}
      </div>

      <Link
        to="/"
        className="blog-scope-fill-cta inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold shadow-md shadow-indigo-600/25 transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        진짜미래 서비스로 가기
      </Link>
    </header>
  );
}
