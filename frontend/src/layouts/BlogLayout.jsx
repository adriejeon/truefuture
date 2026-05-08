import { Outlet, useLocation, Link } from "react-router-dom";
import BlogHeader from "../components/BlogHeader";

export default function BlogLayout() {
  const location = useLocation();
  const isDetail = /^\/blog\/[^/]+$/.test(location.pathname);

  return (
    <main className="w-full flex-1 bg-white blog-scope min-h-screen">
      <BlogHeader />

      <div className="mx-auto w-full max-w-3xl px-5 pb-10 pt-6 sm:px-6 sm:pb-12">
        <div
          className={`mb-8 flex flex-wrap items-center gap-3 ${isDetail ? "justify-between" : "justify-end"}`}
        >
          {isDetail ? (
            <Link
              to="/blog"
              className="text-sm font-semibold text-gray-900 hover:text-gray-700"
            >
              ← 블로그 목록
            </Link>
          ) : null}
          <Link
            to="/"
            className="blog-scope-fill-cta inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold shadow-md shadow-indigo-600/25 transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:py-3"
          >
            진짜미래 서비스로 가기
          </Link>
        </div>

        <Outlet />
      </div>
    </main>
  );
}
