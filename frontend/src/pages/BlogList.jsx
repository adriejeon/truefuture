import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { fetchBlogPosts } from "../services/blogService";
import { BLOG_LIST_META, buildBlogListJsonLd } from "../utils/blogSeo";
import BlogPrepareNotice from "../components/BlogPrepareNotice";

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
  const listJsonLd = useMemo(() => buildBlogListJsonLd(items), [items]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600 leading-relaxed">글을 불러오는 중…</p>
      </section>
    );
  }

  if (error) {
    return <BlogPrepareNotice />;
  }

  return (
    <section className="space-y-4">
      <Helmet>
        <title>{BLOG_LIST_META.title}</title>
        <meta name="description" content={BLOG_LIST_META.description} />
        <link rel="canonical" href={BLOG_LIST_META.url} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={BLOG_LIST_META.title} />
        <meta property="og:description" content={BLOG_LIST_META.description} />
        <meta property="og:url" content={BLOG_LIST_META.url} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={BLOG_LIST_META.title} />
        <meta name="twitter:description" content={BLOG_LIST_META.description} />
        <script type="application/ld+json">{JSON.stringify(listJsonLd)}</script>
      </Helmet>

      <div className="border-b border-gray-100 pb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">블로그</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">
          진짜미래 점성술·사주 서비스와 함께 읽는 칼럼입니다.
        </p>
      </div>

      <div className="flex items-end justify-between gap-4 border-b border-gray-100 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">최신 글</h2>
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

