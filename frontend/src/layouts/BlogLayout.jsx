import { Outlet, Link, useLocation } from "react-router-dom";

export default function BlogLayout() {
  const location = useLocation();
  const isDetail = /^\/blog\/[^/]+$/.test(location.pathname);

  return (
    <main className="w-full flex-1 blog-scope">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-12">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
            >
              <span aria-hidden>←</span>
              <span>블로그</span>
            </Link>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              SEO/GEO 최적화를 위해 구조화 데이터(JSON-LD)를 포함합니다.
            </p>
          </div>

          {isDetail ? (
            <Link
              to="/"
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              서비스로 돌아가기
            </Link>
          ) : null}
        </header>

        <Outlet />
      </div>
    </main>
  );
}

