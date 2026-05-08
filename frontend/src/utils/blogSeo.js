import { SITE_ORIGIN } from "../constants/seoMeta";

const BRAND_NAME = "트루퓨처";
const BLOG_URL = `${SITE_ORIGIN}/blog`;
const PUBLISHER_LOGO_URL = `${SITE_ORIGIN}/assets/logo-en.png`;

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
  const url = post?.slug ? `${SITE_ORIGIN}/blog/${post.slug}` : BLOG_URL;
  return { title, description, url };
}

export function buildArticleJsonLd(post) {
  const meta = buildPostMeta(post);
  const published = post?.created_at ? new Date(post.created_at).toISOString() : undefined;
  const createdAt = post?.created_at ? new Date(post.created_at) : undefined;
  const tags = Array.isArray(post?.tags)
    ? post.tags
    : typeof post?.tags === "string"
      ? post.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  const plainText = stripMarkdown(post?.content || "");
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post?.title || "블로그",
    description: meta.description,
    datePublished: published,
    dateModified: published,
    inLanguage: "ko-KR",
    isPartOf: {
      "@type": "Blog",
      name: `${BRAND_NAME} 블로그`,
      url: BLOG_URL,
    },
    author: {
      "@type": "Organization",
      name: BRAND_NAME,
      url: SITE_ORIGIN,
    },
    publisher: {
      "@type": "Organization",
      name: BRAND_NAME,
      url: SITE_ORIGIN,
      logo: {
        "@type": "ImageObject",
        url: PUBLISHER_LOGO_URL,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": meta.url,
    },
    url: meta.url,
    keywords: tags.length ? tags.join(", ") : undefined,
    articleSection: tags.length ? tags[0] : undefined,
    wordCount,
    timeRequired: createdAt ? `PT${Math.max(1, Math.ceil(wordCount ? wordCount / 200 : 3))}M` : undefined,
  };

  Object.keys(jsonLd).forEach((k) => {
    if (jsonLd[k] === undefined) delete jsonLd[k];
  });
  return jsonLd;
}

