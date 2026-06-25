/**
 * 블로그 라우트 프리렌더(SSG).
 *
 * vite build 이후 실행된다. Supabase에서 글 목록을 가져와,
 *   - dist/blog/index.html            (목록)
 *   - dist/blog/<slug>/index.html     (각 글)
 * 정적 HTML을 생성한다. 각 HTML의 <head>에 글별 title/description/canonical/OG와
 * JSON-LD(BlogPosting + FAQPage, 목록은 Blog)를 미리 박아 넣고, #root 안에 본문을
 * 서버 렌더된 HTML로 채운다.
 *
 * 목적: JS를 실행하지 않는 LLM/검색 크롤러(GPTBot, ClaudeBot, PerplexityBot 등)도
 * HTML만 받아서 본문과 구조화 데이터를 그대로 읽을 수 있게 한다.
 * (브라우저에서는 main.jsx의 createRoot가 #root를 다시 렌더링하므로 SPA 동작은 그대로 유지된다.)
 *
 * Supabase 환경변수가 없거나 fetch가 실패하면 graceful하게 건너뛴다(빌드는 깨지지 않음).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import {
  buildPostMeta,
  buildArticleJsonLd,
  buildFaqJsonLd,
  buildBlogListJsonLd,
  BLOG_LIST_META,
} from '../src/utils/blogSeo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SITE_ORIGIN = 'https://truefuture.kr';
const distDir = join(__dirname, '..', 'dist');
const templatePath = join(distDir, 'index.html');

marked.setOptions({ gfm: true, breaks: false });

async function fetchPosts() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[prerender] Supabase 환경변수 없음 — 블로그 프리렌더를 건너뜁니다.');
    return [];
  }
  try {
    const endpoint = `${url.replace(/\/$/, '')}/rest/v1/posts?select=id,title,content,slug,excerpt,tags,created_at&order=created_at.desc&limit=2000`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.warn(`[prerender] posts fetch 실패: HTTP ${res.status}`);
      return [];
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows.filter((r) => r && r.slug && r.title) : [];
  } catch (error) {
    console.warn('[prerender] posts fetch 예외 — 건너뜁니다:', error?.message || error);
    return [];
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === 'string')
    return tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  return [];
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/** <title> 교체 */
function setTitle(html, title) {
  const tag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, tag);
  }
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

/** name=/property= 메타의 content 교체(없으면 head에 추가). [^>] 은 개행도 포함하므로 멀티라인 메타도 매칭. */
function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function setCanonical(html, url) {
  const tag = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  if (/<link[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
    return html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, tag);
  }
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function injectJsonLd(html, objects) {
  const scripts = objects
    .filter(Boolean)
    .map((o) => `    <script type="application/ld+json">${JSON.stringify(o)}</script>`)
    .join('\n');
  if (!scripts) return html;
  return html.replace(/<\/head>/i, `${scripts}\n  </head>`);
}

function injectRoot(html, contentHtml) {
  if (/<div id="root">\s*<\/div>/i.test(html)) {
    return html.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${contentHtml}</div>`);
  }
  // vite가 self-closing으로 둔 경우 등 대비
  return html.replace(/<div id="root"[^>]*>\s*<\/div>/i, `<div id="root">${contentHtml}</div>`);
}

function applyCommonMeta(html, { title, description, url, ogType }) {
  let out = html;
  out = setTitle(out, title);
  out = setMeta(out, 'name', 'description', description);
  out = setCanonical(out, url);
  out = setMeta(out, 'property', 'og:type', ogType);
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', description);
  out = setMeta(out, 'property', 'og:url', url);
  out = setMeta(out, 'name', 'twitter:title', title);
  out = setMeta(out, 'name', 'twitter:description', description);
  return out;
}

function renderPostBody(post, tags) {
  const tagHtml = tags.length
    ? `<div class="mt-4 flex flex-wrap gap-2">${tags
        .map(
          (t) =>
            `<span class="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">#${escapeHtml(t)}</span>`
        )
        .join('')}</div>`
    : '';
  const dateHtml = post.created_at
    ? `<time class="text-xs text-gray-500" datetime="${escapeHtml(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time>`
    : '';
  const excerptHtml = post.excerpt
    ? `<p class="mt-6 text-base text-gray-700 leading-relaxed">${escapeHtml(post.excerpt)}</p>`
    : '';
  const contentHtml = marked.parse(post.content || '');

  return `<main class="w-full flex-1 bg-white blog-scope min-h-screen"><div class="mx-auto w-full max-w-3xl px-5 pb-10 pt-6 sm:px-6 sm:pb-12"><article class="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8"><div class="flex flex-wrap items-center gap-x-3 gap-y-2"><h1 class="w-full text-2xl font-bold text-gray-900 sm:text-3xl leading-snug">${escapeHtml(post.title)}</h1>${dateHtml}</div>${tagHtml}${excerptHtml}<div class="mt-8 border-t border-gray-200 pt-6"><div class="prose prose-slate max-w-none">${contentHtml}</div></div></article></div></main>`;
}

function renderListBody(posts) {
  const cards = posts
    .map((p) => {
      const tags = normalizeTags(p.tags).slice(0, 8);
      const tagHtml = tags.length
        ? `<div class="mt-4 flex flex-wrap gap-2">${tags
            .map(
              (t) =>
                `<span class="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">#${escapeHtml(t)}</span>`
            )
            .join('')}</div>`
        : '';
      const dateHtml = p.created_at
        ? `<time class="text-xs text-gray-500" datetime="${escapeHtml(p.created_at)}">${escapeHtml(formatDate(p.created_at))}</time>`
        : '';
      const excerptHtml = p.excerpt
        ? `<p class="mt-3 text-sm text-gray-700 leading-relaxed">${escapeHtml(p.excerpt)}</p>`
        : '';
      const href = `/blog/${encodeURIComponent(p.slug)}`;
      return `<article class="rounded-2xl border border-gray-200 bg-white p-6 hover:border-gray-300"><div class="flex flex-wrap items-center gap-x-3 gap-y-2"><h2 class="min-w-0 text-lg font-semibold text-gray-900"><a href="${href}" class="hover:underline">${escapeHtml(p.title)}</a></h2>${dateHtml}</div>${excerptHtml}${tagHtml}<div class="mt-5"><a href="${href}" class="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700">자세히 보기 →</a></div></article>`;
    })
    .join('');

  return `<main class="w-full flex-1 bg-white blog-scope min-h-screen"><div class="mx-auto w-full max-w-3xl px-5 pb-10 pt-6 sm:px-6 sm:pb-12"><section class="space-y-4"><div class="border-b border-gray-100 pb-8"><h1 class="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">블로그</h1><p class="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">점성술·사주·타로 등 운세에 대해 자주 묻는 질문을 질문과 답변 형식으로 풀어 주는 진짜미래 블로그입니다.</p></div><div class="grid gap-4">${cards}</div></section></div></main>`;
}

function writeHtml(relPath, html) {
  const outPath = join(distDir, relPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf-8');
}

async function main() {
  let template;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch (error) {
    console.warn('[prerender] dist/index.html 을 찾을 수 없어 프리렌더를 건너뜁니다.', error?.message || error);
    return;
  }

  const posts = await fetchPosts();
  if (!posts.length) {
    console.warn('[prerender] 글이 없어 블로그 프리렌더를 건너뜁니다.');
    return;
  }

  // 1) 목록 페이지: dist/blog/index.html
  {
    let html = applyCommonMeta(template, {
      title: BLOG_LIST_META.title,
      description: BLOG_LIST_META.description,
      url: BLOG_LIST_META.url,
      ogType: 'website',
    });
    html = injectJsonLd(html, [buildBlogListJsonLd(posts)]);
    html = injectRoot(html, renderListBody(posts));
    writeHtml(join('blog', 'index.html'), html);
  }

  // 2) 각 글: dist/blog/<slug>/index.html
  let count = 0;
  for (const post of posts) {
    try {
      const meta = buildPostMeta(post);
      const tags = normalizeTags(post.tags);
      let html = applyCommonMeta(template, {
        title: meta.title,
        description: meta.description,
        url: meta.url,
        ogType: 'article',
      });
      html = injectJsonLd(html, [buildArticleJsonLd(post), buildFaqJsonLd(post)]);
      html = injectRoot(html, renderPostBody(post, tags));
      writeHtml(join('blog', post.slug, 'index.html'), html);
      count += 1;
    } catch (error) {
      console.warn(`[prerender] slug=${post.slug} 생성 실패:`, error?.message || error);
    }
  }

  console.log(`[prerender] 블로그 목록 1개 + 글 ${count}개 프리렌더 완료`);
}

await main();
