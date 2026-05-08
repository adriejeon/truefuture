import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBlogPosts } from "../services/blogService";

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === "string")
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return [];
}

export default function BlogList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchBlogPosts({ limit: 50 });
        if (mounted) setPosts(data);
      } catch (e) {
        if (mounted) setError(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const items = useMemo(() => posts ?? [], [posts]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600 leading-relaxed">글을 불러오는 중…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-white p-6">
        <p className="text-sm font-semibold text-gray-900">불러오기에 실패했어요.</p>
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">
          {String(error?.message || error)}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">블로그</h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            읽기 쉬운 라이트 테마로 렌더링됩니다.
          </p>
        </div>
        <span className="text-xs text-gray-500">총 {items.length}개</span>
      </div>

      <div className="grid gap-4">
        {items.map((p) => {
          const tags = normalizeTags(p.tags);
          return (
            <article
              key={p.id}
              className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-gray-300"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="min-w-0 text-lg font-semibold text-gray-900">
                  <Link to={`/blog/${p.slug}`} className="hover:underline">
                    {p.title}
                  </Link>
                </h2>
                {p.created_at ? (
                  <time className="text-xs text-gray-500" dateTime={p.created_at}>
                    {formatDate(p.created_at)}
                  </time>
                ) : null}
              </div>

              {p.excerpt ? (
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  {p.excerpt}
                </p>
              ) : null}

              {tags.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {tags.slice(0, 8).map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5">
                <Link
                  to={`/blog/${p.slug}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  자세히 보기 <span aria-hidden>→</span>
                </Link>
              </div>
            </article>
          );
        })}

        {!items.length ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <p className="text-sm text-gray-700 leading-relaxed">아직 게시된 글이 없어요.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

