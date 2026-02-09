import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 사이트맵에 포함할 라우트 목록
const routes = [
  {
    url: 'https://truefuture.kr/',
    changefreq: 'daily',
    priority: 1.0,
  },
  {
    url: 'https://truefuture.kr/compatibility',
    changefreq: 'weekly',
    priority: 0.8,
  },
  {
    url: 'https://truefuture.kr/yearly',
    changefreq: 'daily',
    priority: 0.9,
  },
  {
    url: 'https://truefuture.kr/consultation',
    changefreq: 'daily',
    priority: 0.9,
  },
  {
    url: 'https://truefuture.kr/privacy-policy',
    changefreq: 'monthly',
    priority: 0.3,
  },
  {
    url: 'https://truefuture.kr/terms',
    changefreq: 'monthly',
    priority: 0.3,
  },
];

// 현재 날짜를 ISO 형식으로
const lastmod = new Date().toISOString().split('T')[0];

// sitemap.xml 생성
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${route.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

// dist 폴더에 sitemap.xml 작성
const distPath = join(__dirname, '..', 'dist', 'sitemap.xml');
writeFileSync(distPath, sitemap, 'utf-8');

console.log('✅ sitemap.xml이 생성되었습니다:', distPath);
