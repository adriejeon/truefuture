import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import ReactMarkdown from "react-markdown";
import { fetchBlogPostBySlug } from "../services/blogService";
import { buildArticleJsonLd, buildFaqJsonLd, buildPostMeta } from "../utils/blogSeo";
import BlogPrepareNotice from "../components/BlogPrepareNotice";

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
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

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchBlogPostBySlug(slug);
        if (mounted) setPost(data);
      } catch (e) {
        if (mounted) setError(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const meta = useMemo(() => buildPostMeta(post), [post]);
  const jsonLd = useMemo(() => buildArticleJsonLd(post), [post]);
  const faqJsonLd = useMemo(() => buildFaqJsonLd(post), [post]);
  const tags = useMemo(() => normalizeTags(post?.tags), [post?.tags]);

  if (loading) {
    return (
      <article className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600 leading-relaxed">글을 불러오는 중…</p>
      </article>
    );
  }

  if (error) {
    return (
      <>
        <BlogPrepareNotice />
        <div className="mt-6 text-center">
          <Link to="/blog" className="text-sm font-semibold text-blue-600 hover:underline">
            블로그 목록으로
          </Link>
        </div>
      </>
    );
  }

  if (!post) {
    return (
      <article className="rounded-2xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-bold text-gray-900">글을 찾을 수 없어요.</h1>
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">
          주소가 올바른지 확인해주세요.
        </p>
        <div className="mt-5">
          <Link to="/blog" className="text-sm font-semibold text-blue-600 hover:underline">
            목록으로
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
      <Helmet>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={meta.url} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={meta.url} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={meta.title} />
        <meta name="twitter:description" content={meta.description} />

        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        {faqJsonLd ? (
          <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
        ) : null}
      </Helmet>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="w-full text-2xl font-bold text-gray-900 sm:text-3xl leading-snug">
          {post.title}
        </h1>
        {post.created_at ? (
          <time className="text-xs text-gray-500" dateTime={post.created_at}>
            {formatDateTime(post.created_at)}
          </time>
        ) : null}
      </div>

      {tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700"
            >
              #{t}
            </span>
          ))}
        </div>
      ) : null}

      {post.excerpt ? (
        <p className="mt-6 text-base text-gray-700 leading-relaxed">{post.excerpt}</p>
      ) : null}

      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="prose prose-slate max-w-none">
          <ReactMarkdown>{post.content || ""}</ReactMarkdown>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between gap-4 border-t border-gray-200 pt-6">
        <Link to="/blog" className="text-sm font-semibold text-blue-600 hover:underline">
          ← 목록으로
        </Link>
      </div>
    </article>
  );
}

