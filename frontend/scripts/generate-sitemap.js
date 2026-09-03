import { writeFileSync, unlinkSync, readdirSync, statSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDir = join(__dirname, '..');

/**
 * 사이트맵에 포함할 라우트.
 *  · loc 은 canonical 과 완전히 같아야 하고, 리디렉션 없이 200 이어야 한다.
 *    (후행 슬래시 없음 정책 — Cloudflare Pages 는 dist/<경로>.html 을 /<경로> 로 200 서빙한다)
 *  · lastmod 는 배포할 때마다 오늘로 갱신하지 않는다. 그 페이지를 실제로 만든 소스의
 *    마지막 커밋 날짜(git)를 쓰고, git 을 못 쓰면 기존 sitemap 의 값을 유지한다.
 */
const routes = [
  { url: 'https://truefuture.kr/',              changefreq: 'daily',   priority: 1.0, sources: ['src/pages/Home.jsx', 'scripts/prerender-pages.js'] },
  { url: 'https://truefuture.kr/report',        changefreq: 'weekly',  priority: 0.9, sources: ['src/pages/PremiumReport.jsx', 'src/components/ReportLanding.jsx'] },
  { url: 'https://truefuture.kr/consultation',  changefreq: 'daily',   priority: 0.9, sources: ['src/pages/Consultation.jsx'] },
  { url: 'https://truefuture.kr/compatibility', changefreq: 'weekly',  priority: 0.8, sources: ['src/pages/Compatibility.jsx'] },
  { url: 'https://truefuture.kr/yearly',        changefreq: 'daily',   priority: 0.9, sources: ['src/pages/YearlyFortune.jsx'] },
  { url: 'https://truefuture.kr/daily-tarot',   changefreq: 'daily',   priority: 0.6, sources: ['src/pages/DailyTarot.jsx'] },
  { url: 'https://truefuture.kr/purchase',      changefreq: 'monthly', priority: 0.6, sources: ['src/pages/Purchase.jsx', 'src/constants/packages.js'] },
  { url: 'https://truefuture.kr/faq',           changefreq: 'monthly', priority: 0.4, sources: ['src/pages/FAQ.jsx', 'src/constants/faqItems.js'] },
  { url: 'https://truefuture.kr/blog',          changefreq: 'daily',   priority: 0.7, sources: ['src/pages/BlogList.jsx'] },
  { url: 'https://truefuture.kr/privacy-policy', changefreq: 'monthly', priority: 0.3, sources: ['src/pages/PrivacyPolicy.jsx'] },
  { url: 'https://truefuture.kr/terms',         changefreq: 'monthly', priority: 0.3, sources: ['src/pages/Terms.jsx'] },
];

/** 이전 sitemap(public/sitemap.xml)의 loc → lastmod. git 을 쓸 수 없을 때의 폴백 */
function previousLastmods() {
  try {
    const xml = readFileSync(join(frontendDir, 'public', 'sitemap.xml'), 'utf-8');
    const map = new Map();
    const re = /<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
    let m;
    while ((m = re.exec(xml))) map.set(m[1].trim(), m[2].trim());
    return map;
  } catch {
    return new Map();
  }
}

/** 소스 파일들의 마지막 커밋 날짜(YYYY-MM-DD). git 을 못 쓰면 null */
function gitLastModified(sources) {
  if (!sources || !sources.length) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...sources], {
      cwd: frontendDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? out.split('T')[0] : null;
  } catch {
    return null;
  }
}

const prevLastmod = previousLastmods();
const FALLBACK_LASTMOD = '2026-09-03';

function lastmodFor(route) {
  return gitLastModified(route.sources) || prevLastmod.get(route.url) || FALLBACK_LASTMOD;
}

// 현재 날짜를 ISO 형식으로
const lastmod = new Date().toISOString().split('T')[0];

// 빌드 시 Supabase에서 게시글 목록을 가져와 sitemap에 포함한다.
// (auto_blog.py가 새 글 발행 후 Cloudflare 배포 훅을 호출 → 재빌드 → 최신 글이 sitemap에 반영됨)
// 실패하더라도 빌드가 깨지지 않도록 전부 graceful degrade.
async function fetchBlogPosts() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[sitemap] Supabase 환경변수 없음 — 블로그 글은 sitemap에서 생략됩니다.');
    return [];
  }
  try {
    const endpoint = `${url.replace(/\/$/, '')}/rest/v1/posts?select=slug,created_at&order=created_at.desc&limit=2000`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.warn(`[sitemap] posts fetch 실패: HTTP ${res.status}`);
      return [];
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows.filter((r) => r && r.slug) : [];
  } catch (error) {
    console.warn('[sitemap] posts fetch 예외 — 블로그 글 생략:', error?.message || error);
    return [];
  }
}

const posts = await fetchBlogPosts();

const postUrls = posts.map((p) => {
  const postLastmod = p.created_at
    ? new Date(p.created_at).toISOString().split('T')[0]
    : lastmod;
  return `  <url>
    <loc>https://truefuture.kr/blog/${encodeURIComponent(p.slug)}</loc>
    <lastmod>${postLastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
});

console.log(`[sitemap] 정적 라우트 ${routes.length}개 + 블로그 글 ${postUrls.length}개 포함 (lastmod: git 커밋일 기준)`);

// sitemap.xml 생성
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${route.url}</loc>
    <lastmod>${lastmodFor(route)}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  )
  .join('\n')}
${postUrls.join('\n')}
</urlset>`;

// dist 폴더에 sitemap.xml 작성
const distPath = join(__dirname, '..', 'dist', 'sitemap.xml');
writeFileSync(distPath, sitemap, 'utf-8');

// .DS_Store 파일 제거 (Cloudflare 배포 시 문제 방지)
const distDir = join(__dirname, '..', 'dist');
const removeDSStore = (dir) => {
  try {
    const files = readdirSync(dir);
    files.forEach((file) => {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        removeDSStore(filePath);
      } else if (file === '.DS_Store') {
        unlinkSync(filePath);
      }
    });
  } catch (error) {
    // 무시 (파일이 없거나 권한 문제 등)
  }
};

removeDSStore(distDir);
