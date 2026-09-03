/**
 * 프리렌더 공용 HTML 헬퍼.
 * scripts/prerender-pages.js(메인·리포트·서비스 페이지)와 scripts/prerender-blog.js(블로그)가 함께 쓴다.
 *
 * 규칙
 *  · 메타 태그에는 data-rh="true" 를 붙인다 → 브라우저에서 react-helmet-async 가 인계해
 *    hydration 후 같은 태그가 두 벌로 남지 않는다.
 *  · JSON-LD 는 id 로 구분해 넣는다 → 클라이언트 useJsonLd 가 같은 id 를 교체한다.
 *    (data-rh 를 붙이지 않는다: Helmet 이 지웠다 다시 넣는 순서에 의존하지 않기 위함)
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** <title> 교체 (없으면 head 에 추가) */
export function setTitle(html, title) {
  const tag = `<title data-rh="true">${escapeHtml(title)}</title>`;
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, tag);
  }
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

/** name=/property= 메타의 content 교체(없으면 head 에 추가) */
export function setMeta(html, attr, key, value) {
  const re = new RegExp(
    `<meta[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i"
  );
  const tag = `<meta data-rh="true" ${attr}="${key}" content="${escapeHtml(value)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

/** name=/property= 메타 제거 (셸에서 경로별 태그를 빼야 할 때) */
export function removeMeta(html, attr, key) {
  const re = new RegExp(
    `[ \\t]*<meta[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>\\n?`,
    "gi"
  );
  return html.replace(re, "");
}

export function setCanonical(html, url) {
  const tag = `<link data-rh="true" rel="canonical" href="${escapeHtml(url)}" />`;
  if (/<link[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
    return html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, tag);
  }
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

export function removeCanonical(html) {
  return html.replace(/[ \t]*<link[^>]*rel=["']canonical["'][^>]*>\n?/i, "");
}

/**
 * JSON-LD 삽입. 같은 id 가 이미 있으면 교체한다.
 * @param {{id?: string, data: object, rh?: boolean}[]} scripts
 */
export function injectJsonLd(html, scripts) {
  let out = html;
  for (const item of (scripts || []).filter(Boolean)) {
    if (!item.data) continue;
    const attrs = [
      item.id ? ` id="${item.id}"` : "",
      ' type="application/ld+json"',
      item.rh ? ' data-rh="true"' : "",
    ].join("");
    const tag = `    <script${attrs}>${JSON.stringify(item.data)}</script>`;
    if (item.id) {
      const re = new RegExp(`[ \\t]*<script[^>]*id="${item.id}"[^>]*>[\\s\\S]*?<\\/script>\\n?`, "i");
      if (re.test(out)) {
        out = out.replace(re, `${tag}\n`);
        continue;
      }
    }
    out = out.replace(/<\/head>/i, `${tag}\n  </head>`);
  }
  return out;
}

export function injectRoot(html, contentHtml) {
  if (/<div id="root">\s*<\/div>/i.test(html)) {
    return html.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${contentHtml}</div>`);
  }
  return html.replace(/<div id="root"[^>]*>\s*<\/div>/i, `<div id="root">${contentHtml}</div>`);
}

/** title/description/canonical/OG/Twitter 를 한 번에 (PageSeo 가 렌더하는 것과 같은 세트) */
export function applyPageMeta(html, { title, description, url, ogType = "website", image = null }) {
  let out = html;
  out = setTitle(out, title);
  out = setMeta(out, "name", "description", description);
  out = setCanonical(out, url);
  out = setMeta(out, "property", "og:type", ogType);
  out = setMeta(out, "property", "og:title", title);
  out = setMeta(out, "property", "og:description", description);
  out = setMeta(out, "property", "og:url", url);
  out = setMeta(out, "name", "twitter:url", url);
  out = setMeta(out, "name", "twitter:title", title);
  out = setMeta(out, "name", "twitter:description", description);
  if (image) {
    out = setMeta(out, "property", "og:image", image);
    out = setMeta(out, "name", "twitter:image", image);
  }
  return out;
}

export function writeHtml(distDir, relPath, html) {
  const outPath = join(distDir, relPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf-8");
}
