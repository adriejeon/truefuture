import { Outlet, useLocation, Link } from "react-router-dom";
import BlogHeader from "../components/BlogHeader";

export default function BlogLayout() {
  const location = useLocation();
  const isDetail = /^\/blog\/[^/]+$/.test(location.pathname);

  return (
    <main className="w-full flex-1 bg-white blog-scope min-h-screen">
      <BlogHeader />

      <div className="mx-auto w-full max-w-3xl px-5 pb-10 pt-6 sm:px-6 sm:pb-12">
        {isDetail ? (
          <div className="mb-8">
            <Link
              to="/blog"
              className="text-sm font-semibold text-gray-900 hover:text-gray-700"
            >
              ← 블로그 목록
            </Link>
          </div>
        ) : null}

        <Outlet />
      </div>
    </main>
  );
}
