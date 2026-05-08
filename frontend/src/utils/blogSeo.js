import { SITE_ORIGIN } from "../constants/seoMeta";

function stripMarkdown(md) {
  if (typeof md !== "string") return "";
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPostMeta(post) {
  const title = post?.title ? `${post.title} | 블로그` : "블로그";
  const descriptionRaw = post?.excerpt || stripMarkdown(post?.content || "");
  const description = (descriptionRaw || "블로그 글").slice(0, 160);
  const url = post?.slug ? `${SITE_ORIGIN}/blog/${post.slug}` : `${SITE_ORIGIN}/blog`;
  return { title, description, url };
}

export function buildArticleJsonLd(post) {
  const meta = buildPostMeta(post);
  const published = post?.created_at ? new Date(post.created_at).toISOString() : undefined;
  const tags = Array.isArray(post?.tags)
    ? post.tags
    : typeof post?.tags === "string"
      ? post.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post?.title || "블로그",
    description: meta.description,
    datePublished: published,
    dateModified: published,
    author: {
      "@type": "Organization",
      name: "진짜미래",
      url: SITE_ORIGIN,
    },
    publisher: {
      "@type": "Organization",
      name: "진짜미래",
      url: SITE_ORIGIN,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": meta.url,
    },
    url: meta.url,
    keywords: tags.length ? tags.join(", ") : undefined,
  };

  Object.keys(jsonLd).forEach((k) => {
    if (jsonLd[k] === undefined) delete jsonLd[k];
  });
  return jsonLd;
}

