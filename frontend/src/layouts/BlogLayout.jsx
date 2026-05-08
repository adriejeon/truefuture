import { Outlet } from "react-router-dom";
import BlogHeader from "../components/BlogHeader";

export default function BlogLayout() {
  return (
    <main className="w-full flex-1 bg-white blog-scope">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-12">
        <BlogHeader />
        <Outlet />
      </div>
    </main>
  );
}

