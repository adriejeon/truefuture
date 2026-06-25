import { SITE_ORIGIN } from "../constants/seoMeta.js";

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

export const BLOG_LIST_META = {
  title: `블로그 | ${BRAND_NAME}`,
  description:
    "점성술·사주·타로 등 운세에 대해 자주 묻는 질문을, 질문과 답변 형식으로 풀어 주는 진짜미래(트루퓨처) 블로그입니다.",
  url: BLOG_URL,
};

export function buildPostMeta(post) {
  const title = post?.title ? `${post.title} | 블로그` : "블로그";
  const descriptionRaw = post?.excerpt || stripMarkdown(post?.content || "");
  const description = (descriptionRaw || "블로그 글").slice(0, 160);
  const url = post?.slug ? `${SITE_ORIGIN}/blog/${post.slug}` : BLOG_URL;
  return { title, description, url };
}

/**
 * 마크다운 본문에서 H2/H3 제목과 그 아래 본문을 (질문, 답변) 쌍으로 추출한다.
 * 질문→답변 구조로 작성된 글에서 FAQPage 구조화 데이터를 만들기 위해 사용.
 */
export function extractFaqFromMarkdown(md) {
  if (typeof md !== "string" || !md.trim()) return [];

  const lines = md.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^#{2,3}\s+(.+?)\s*$/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { question: headingMatch[1], answerLines: [] };
    } else if (current) {
      current.answerLines.push(rawLine);
    }
  }
  if (current) sections.push(current);

  return sections
    .map((s) => ({
      question: stripMarkdown(s.question),
      answer: stripMarkdown(s.answerLines.join("\n")).slice(0, 1200),
    }))
    .filter((s) => s.question && s.answer);
}

/**
 * 질문형(물음표로 끝나는) 소제목이 2개 이상일 때만 FAQPage JSON-LD를 만든다.
 * (FAQ 구조화 데이터는 LLM/검색엔진이 답변을 그대로 인용하기 쉽게 해준다.)
 */
export function buildFaqJsonLd(post) {
  const faqs = extractFaqFromMarkdown(post?.content || "").filter((s) =>
    s.question.endsWith("?")
  );
  if (faqs.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "ko-KR",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

/** /blog 목록 페이지용 Blog + 글 목록 JSON-LD */
export function buildBlogListJsonLd(posts) {
  const items = Array.isArray(posts) ? posts.slice(0, 50) : [];
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${BRAND_NAME} 블로그`,
    url: BLOG_URL,
    inLanguage: "ko-KR",
    publisher: {
      "@type": "Organization",
      name: BRAND_NAME,
      url: SITE_ORIGIN,
      logo: {
        "@type": "ImageObject",
        url: PUBLISHER_LOGO_URL,
      },
    },
    blogPost: items
      .filter((p) => p && p.slug && p.title)
      .map((p) => {
        const published = p.created_at
          ? new Date(p.created_at).toISOString()
          : undefined;
        const entry = {
          "@type": "BlogPosting",
          headline: p.title,
          url: `${SITE_ORIGIN}/blog/${p.slug}`,
          datePublished: published,
          description: p.excerpt || undefined,
        };
        Object.keys(entry).forEach((k) => {
          if (entry[k] === undefined) delete entry[k];
        });
        return entry;
      }),
  };
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
    articleBody: plainText || undefined,
    wordCount,
    timeRequired: createdAt ? `PT${Math.max(1, Math.ceil(wordCount ? wordCount / 200 : 3))}M` : undefined,
  };

  Object.keys(jsonLd).forEach((k) => {
    if (jsonLd[k] === undefined) delete jsonLd[k];
  });
  return jsonLd;
}

