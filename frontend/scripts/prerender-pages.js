/**
 * 메인·리포트·서비스 페이지 프리렌더(SSG).
 *
 * vite build 이후 가장 먼저 실행된다. 블로그 프리렌더(scripts/prerender-blog.js)와 같은 구조를 쓰되,
 * 대상이 SPA 라우트라서 본문은 "그 페이지가 실제로 보여주는 텍스트"만 정적으로 재구성한다.
 *
 * 출력 (Cloudflare Pages 의 auto-trailing-slash 규칙에 맞춰 <경로>.html 로 쓴다 →
 *  /report 가 리디렉션 없이 바로 200 을 준다. 디렉터리+index.html 로 두면 /report → /report/ 로 308 된다.)
 *   dist/app/index.html      SPA 폴백 셸 (_redirects 가 SPA 전용 경로를 여기로 rewrite)
 *   dist/404.html            없는 경로용 (같은 셸, 상태코드만 404)
 *   dist/index.html          메인 /
 *   dist/report.html         /report
 *   dist/consultation.html   /consultation
 *   dist/compatibility.html  /compatibility
 *   dist/yearly.html         /yearly
 *   dist/faq.html            /faq
 *   dist/purchase.html       /purchase
 *   dist/daily-tarot.html    /daily-tarot
 *   dist/terms.html          /terms
 *   dist/privacy-policy.html /privacy-policy
 *   dist/contact.html        /contact
 *
 * 데이터 출처(화면과 동일)
 *   · 문구   : src/locales/ko.json (화면이 쓰는 i18n 값 그대로)
 *   · 가격   : src/constants/packages.js · pricing.js
 *   · 후기   : Supabase public_reviews / get_review_summary (published 만, 화면 훅과 같은 필터)
 *   · JSON-LD: src/utils/pageJsonLd.js (React 페이지와 같은 빌더)
 *
 * 개인정보(프로필·질문·결제·상담 내역)는 절대 포함하지 않는다 — 공개 데이터만 읽는다.
 * Supabase 환경변수가 없으면 후기 없이 나머지만 생성한다(빌드는 깨지지 않음).
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  COMMON_GRAPH,
  DEFAULT_OG_IMAGE,
  PAGE_SEO,
  absoluteUrl,
} from "../src/constants/siteSeo.js";
import { DEFAULT_META } from "../src/constants/seoMeta.js";
import { SITE_FAQ_ITEMS, REPORT_FAQ_KEYS } from "../src/constants/faqItems.js";
import { TICKET_PACKAGES } from "../src/constants/packages.js";
import {
  LEGACY_WRITTEN_ANALYSIS_PRICE,
  REPORT_PRICE,
  REPORT_YEAR_COUNT,
} from "../src/constants/pricing.js";
import {
  PAGE_SEO_PURCHASE_PATH,
  PURCHASE_PAGE_DESCRIPTION,
  PURCHASE_PAGE_TITLE,
} from "../src/constants/purchaseSeo.js";
import {
  HOME_REVIEW_PAGE_SIZE,
  REPORT_REVIEW_PAGE_SIZE,
  buildCompatibilityGraph,
  buildConsultationGraph,
  buildContactPageGraph,
  buildDailyTarotGraph,
  buildFaqPageGraph,
  buildGraph,
  buildHomeGraph,
  buildLegalPageGraph,
  buildPurchaseGraph,
  buildReportGraph,
  buildYearlyGraph,
} from "../src/utils/pageJsonLd.js";
import {
  applyPageMeta,
  escapeHtml,
  injectJsonLd,
  injectRoot,
  removeCanonical,
  removeMeta,
  setMeta,
  writeHtml,
} from "./lib/prerender.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const srcDir = join(__dirname, "..", "src");

/* ───────────────────────── i18n (화면이 쓰는 ko.json 그대로) ───────────────────────── */

const ko = JSON.parse(readFileSync(join(srcDir, "locales", "ko.json"), "utf-8"));

function t(path, vars) {
  const value = path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), ko);
  if (typeof value !== "string") return "";
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}
const L = (key, vars) => t(`premium_report.landing.${key}`, vars);
const won = (n) => Number(n).toLocaleString("ko-KR");

/* ───────────────────────── 공개 후기 (화면 훅과 같은 필터) ───────────────────────── */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const REVIEW_FIELDS =
  "id,service,rating,content,display_name,is_verified,is_repeat,source,language,published_at,created_at";

async function fetchReviews({ service = null, limit }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const params = new URLSearchParams({
    select: REVIEW_FIELDS,
    language: "eq.ko",
    order: "published_at.desc,id.desc",
    limit: String(limit),
  });
  if (service) params.set("service", `eq.${service}`);
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/public_reviews?${params}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) {
      console.warn(`[prerender-pages] 후기 조회 실패: HTTP ${res.status}`);
      return [];
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn("[prerender-pages] 후기 조회 예외:", error?.message || error);
    return [];
  }
}

async function fetchSummary({ service = null }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/get_review_summary`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_service: service, p_language: "ko" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { count: Number(row.review_count ?? 0), avg: Number(row.avg_rating ?? 0) };
  } catch (error) {
    console.warn("[prerender-pages] 후기 요약 예외:", error?.message || error);
    return null;
  }
}

/**
 * 약관·개인정보처리방침 본문. 화면(services/termsService.fetchTermsContent)과 같은 테이블·같은 조건이다.
 * (type/language 로 고르고, 시행일이 지난 것 중 최신 버전 1건)
 */
async function fetchLegalDoc(type) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const params = new URLSearchParams({
    select: "version,effective_at,content",
    type: `eq.${type}`,
    language: "eq.ko",
    effective_at: `lte.${new Date().toISOString()}`,
    order: "version.desc,effective_at.desc",
    limit: "1",
  });
  try {
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/terms_definitions?${params}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) {
      console.warn(`[prerender-pages] ${type} 조회 실패: HTTP ${res.status}`);
      return null;
    }
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    console.warn(`[prerender-pages] ${type} 조회 예외:`, error?.message || error);
    return null;
  }
}

/* ───────────────────────── 본문 조립 ───────────────────────── */

const SHELL_STYLE =
  "font-family:'Noto Serif KR',system-ui,-apple-system,sans-serif;background:#0F0F2B;color:#E6E6F0;min-height:100vh;margin:0;padding:32px 16px 64px;line-height:1.7;";
const WRAP_STYLE = "max-width:600px;margin:0 auto;";
const H1_STYLE = "font-size:24px;line-height:1.45;font-weight:600;color:#fff;margin:0 0 12px;";
const H2_STYLE = "font-size:17px;font-weight:600;color:#fff;margin:28px 0 8px;";
const P_STYLE = "font-size:14px;color:#C7C7D9;margin:0 0 10px;";
const LI_STYLE = "font-size:14px;color:#C7C7D9;margin:0 0 6px;";

const NAV_LINKS = [
  ["/", "메인"],
  ["/consultation", "자유 질문 상담"],
  ["/compatibility", "궁합"],
  ["/yearly", "데일리·종합 운세"],
  ["/report", "프리미엄 상세 리포트"],
  ["/purchase", "이용권 구매"],
  ["/faq", "자주 묻는 질문"],
  ["/blog", "점성학 칼럼"],
];

function navHtml(current) {
  const items = NAV_LINKS.filter(([href]) => href !== current)
    .map(([href, label]) => `<li style="${LI_STYLE}"><a href="${href}" style="color:#E1AC3F;">${escapeHtml(label)}</a></li>`)
    .join("");
  return `<nav style="margin-top:32px;"><h2 style="${H2_STYLE}">진짜미래 바로가기</h2><ul style="list-style:none;padding:0;margin:0;">${items}</ul></nav>`;
}

function section(title, innerHtml) {
  return `<section><h2 style="${H2_STYLE}">${escapeHtml(title)}</h2>${innerHtml}</section>`;
}

function paragraphs(lines) {
  return lines
    .filter(Boolean)
    .map((line) => `<p style="${P_STYLE}">${escapeHtml(line).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function bullets(items) {
  return `<ul style="padding-left:18px;margin:0 0 8px;">${items
    .filter(Boolean)
    .map((item) => `<li style="${LI_STYLE}">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function faqHtml(items) {
  return items
    .map(
      (item) =>
        `<div style="margin:0 0 14px;"><h3 style="font-size:14px;font-weight:600;color:#fff;margin:0 0 4px;">${escapeHtml(
          item.title
        )}</h3><p style="${P_STYLE}">${escapeHtml(item.content)}</p></div>`
    )
    .join("");
}

/** 후기: 화면(ReviewList)과 같은 요약 문구·같은 후기 목록 */
function reviewsHtml({ reviews, summary, heading }) {
  if (!reviews.length) return "";
  const summaryLine = summary?.count
    ? `<p style="${P_STYLE}">${escapeHtml(
        t("reviews.summary", { count: summary.count, avg: summary.avg.toFixed(1) })
      )}</p>`
    : "";
  const cards = reviews
    .map(
      (r) =>
        `<blockquote style="margin:0 0 14px;padding:14px;border:1px solid #2A2A4A;border-radius:12px;background:#1E1E3A;">` +
        `<p style="font-size:13px;color:#E1AC3F;margin:0 0 6px;">${escapeHtml(
          `${Number(r.rating).toFixed(1)}점`
        )}</p>` +
        `<p style="font-size:14px;color:#F5F0E8;margin:0 0 8px;white-space:pre-line;">${escapeHtml(r.content)}</p>` +
        `<footer style="font-size:12px;color:#9CA3B8;">${escapeHtml(r.display_name || "익명")}</footer>` +
        `</blockquote>`
    )
    .join("");
  return section(heading, summaryLine + cards);
}

function pageBody({ path, h1, lead, sections }) {
  return (
    `<main style="${SHELL_STYLE}"><div style="${WRAP_STYLE}">` +
    `<h1 style="${H1_STYLE}">${escapeHtml(h1)}</h1>` +
    paragraphs(lead) +
    sections.filter(Boolean).join("") +
    navHtml(path) +
    `</div></main>`
  );
}

/* ───────────────────────── 페이지별 본문 ───────────────────────── */

function homeBody({ reviews, summary }) {
  return pageBody({
    path: "/",
    h1: `${t("home.tagline1")} ${t("home.tagline2")}`,
    lead: [
      t("home.tagline3"),
      `${t("home.made_by")} ${t("home.brand")}`,
      `${t("home.future_know")} ${t("home.future_change")}`,
      `${t("home.price_highlight")} ${t("home.price_cta")}`,
    ],
    sections: [
      section("진짜미래가 제공하는 것", bullets([
        `${t("free_question.title")} — ${t("free_question.description")}`,
        `${t("compatibility.title")} — ${t("compatibility.description")}`,
        `${PAGE_SEO.yearly.title} — ${PAGE_SEO.yearly.description}`,
        `${L("toc_doc_title")} — ${PAGE_SEO.report.description}`,
      ])),
      reviewsHtml({
        reviews,
        summary,
        heading: `${t("home.buyer_title")} ${t("home.buyer_title_accent")}`,
      }),
    ],
  });
}

function reportBody({ reviews, summary, faqItems }) {
  const parts = [
    { title: L("toc_p1"), items: L("toc_p1_items").split("|") },
    { title: L("toc_p2"), items: L("toc_p2_items").split("|") },
    { title: L("toc_p3"), items: L("toc_p3_items").split("|") },
  ];
  return pageBody({
    path: "/report",
    h1: `${L("hero_title_1")} ${L("hero_title_2")}`,
    lead: [L("hero_sub"), L("span_note"), L("hero_trust")],
    sections: [
      section("리포트 핵심 구성", bullets([
        L("hero_chip_0"),
        L("hero_chip_1"),
        L("hero_chip_2"),
        L("hero_chip_3"),
        L("hero_chip_4"),
      ])),
      section(
        "가격",
        paragraphs([
          `${L("purchase_price_label")} ${won(REPORT_PRICE)}원`,
          L("price_unit", {
            years: REPORT_YEAR_COUNT,
            perYear: won(Math.round(REPORT_PRICE / REPORT_YEAR_COUNT / 100) * 100),
          }),
          L("price_footnote", { amount: won(LEGACY_WRITTEN_ANALYSIS_PRICE) }),
        ])
      ),
      section(
        `${L("toc_doc_title")} — ${L("toc_doc_sub")}`,
        parts
          .map(
            (p, i) =>
              `<h3 style="font-size:14px;font-weight:600;color:#fff;margin:12px 0 4px;">${escapeHtml(
                `${L("toc_part", { num: i + 1 })} ${p.title}`
              )}</h3>${bullets(p.items)}`
          )
          .join("") +
          bullets([L("toc_meta_1"), L("toc_meta_3")])
      ),
      section(`${L("out_title")} ${L("out_title_accent")}`, bullets(
        [1, 2, 3, 4, 5, 6].map((n) => `${L(`out_${n}_t`)} — ${L(`out_${n}_d`)}`)
      )),
      section(`${L("method_title")} ${L("method_title_accent")}`, bullets(
        [1, 2, 3, 4, 5].map((n) => `${L(`m_${n}_t`)} — ${L(`m_${n}_d`)}`)
      )),
      reviewsHtml({
        reviews,
        summary,
        heading: `${L("review_title_report")} ${L("review_title_report_accent")}`,
      }),
      section(`${L("faq_title")} ${L("faq_title_accent")}`, faqHtml(faqItems)),
    ],
  });
}

function simpleBody({ path, title, description, sections = [] }) {
  return pageBody({ path, h1: title, lead: [description], sections });
}

function purchaseBody() {
  return simpleBody({
    path: PAGE_SEO_PURCHASE_PATH,
    title: PURCHASE_PAGE_TITLE,
    description: PURCHASE_PAGE_DESCRIPTION,
    sections: [
      section(
        "이용권 가격",
        bullets(
          TICKET_PACKAGES.map((pkg) => `${pkg.nameKo} — ${won(pkg.price)}원 · ${t(pkg.descKey)}`)
        )
      ),
    ],
  });
}

/**
 * 약관·방침 본문. 운영자가 작성해 DB에 저장한 HTML 을 그대로 싣는다(화면과 동일한 내용).
 * 스크립트·스타일 태그만 방어적으로 제거한다.
 */
function legalBody({ path, title, description, doc }) {
  const raw = String(doc?.content ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const meta = doc?.effective_at
    ? `<p style="${P_STYLE}">시행일 ${escapeHtml(String(doc.effective_at).slice(0, 10))} · 버전 ${escapeHtml(String(doc.version ?? ""))}</p>`
    : "";
  const article = raw
    ? `<div style="font-size:14px;color:#C7C7D9;">${raw}</div>`
    : paragraphs([description]);
  return pageBody({ path, h1: title, lead: [], sections: [meta + article] });
}

/* ───────────────────────── 실행 ───────────────────────── */

function baseTemplate() {
  const raw = readFileSync(join(distDir, "index.html"), "utf-8");
  // 공통 Organization/WebSite 는 constants/siteSeo.js 가 단일 소스 — 모든 정적 페이지에 같은 내용으로 주입
  return injectJsonLd(raw, [{ id: "common-ld-json", data: buildGraph(COMMON_GRAPH) }]);
}

function renderPage(template, { path, title, description, ogType, nodes, body }) {
  let html = applyPageMeta(template, {
    title,
    description,
    url: absoluteUrl(path),
    ogType: ogType || "website",
    image: DEFAULT_OG_IMAGE,
  });
  html = injectJsonLd(html, [{ id: "page-ld-json", data: buildGraph(nodes) }]);
  return body ? injectRoot(html, body) : html;
}

async function main() {
  let template;
  try {
    template = baseTemplate();
  } catch (error) {
    console.warn("[prerender-pages] dist/index.html 없음 — 건너뜁니다:", error?.message || error);
    return;
  }

  // 0) SPA 폴백 셸: 프리렌더하지 않은 경로(/mypage, /terms 등)와 없는 경로가 받는 HTML.
  //    경로별 canonical/og:url 을 넣지 않는다 — 잘못된 정규 URL 을 주는 것보다 비우는 편이 안전하다.
  //    디렉터리 인덱스(app/index.html)로 쓴다: Cloudflare Pages 는 rewrite 대상이 .html 이면
  //    확장자를 떼는 308 을 다시 태우므로 `/app/` 형태여야 200 rewrite 가 유지된다.
  {
    let shell = template;
    shell = removeCanonical(shell);
    shell = removeMeta(shell, "property", "og:url");
    shell = removeMeta(shell, "name", "twitter:url");
    shell = setMeta(shell, "name", "description", DEFAULT_META.description);
    writeHtml(distDir, join("app", "index.html"), shell);
    writeHtml(distDir, "404.html", shell);
  }

  const [homeReviews, homeSummary, reportReviews, reportSummary, termsDoc, privacyDoc] =
    await Promise.all([
      fetchReviews({ limit: HOME_REVIEW_PAGE_SIZE }),
      fetchSummary({}),
      fetchReviews({ service: "report", limit: REPORT_REVIEW_PAGE_SIZE }),
      fetchSummary({ service: "report" }),
      fetchLegalDoc("terms"),
      fetchLegalDoc("privacy"),
    ]);

  const reportFaqItems = REPORT_FAQ_KEYS.map((key) => ({
    title: L(`${key}_q`),
    content: L(`${key}_a`),
  }));

  const pages = [
    {
      file: "index.html",
      path: "/",
      title: PAGE_SEO.home.title,
      description: PAGE_SEO.home.description,
      ogType: PAGE_SEO.home.ogType,
      nodes: buildHomeGraph({
        reviews: homeReviews,
        summary: homeSummary,
        consultationDescription: t("free_question.description"),
      }),
      body: homeBody({ reviews: homeReviews, summary: homeSummary }),
    },
    {
      file: "report.html",
      path: "/report",
      title: PAGE_SEO.report.title,
      description: PAGE_SEO.report.description,
      ogType: PAGE_SEO.report.ogType,
      nodes: buildReportGraph({
        reviews: reportReviews,
        summary: reportSummary,
        faqItems: reportFaqItems,
      }),
      body: reportBody({ reviews: reportReviews, summary: reportSummary, faqItems: reportFaqItems }),
    },
    {
      file: "consultation.html",
      path: "/consultation",
      title: t("free_question.title"),
      description: t("free_question.description"),
      nodes: buildConsultationGraph({
        title: t("free_question.title"),
        description: t("free_question.description"),
      }),
      body: simpleBody({
        path: "/consultation",
        title: t("free_question.title"),
        description: t("free_question.description"),
        sections: [
          section(
            "이런 질문을 하실 수 있습니다",
            bullets([
              t("consultation.preset_love_1"),
              t("consultation.preset_money_1"),
              t("consultation.preset_exam_1"),
              t("consultation.preset_health_1"),
            ])
          ),
        ],
      }),
    },
    {
      file: "compatibility.html",
      path: "/compatibility",
      title: t("compatibility.title"),
      description: t("compatibility.description"),
      nodes: buildCompatibilityGraph({
        title: t("compatibility.title"),
        description: t("compatibility.description"),
      }),
      body: simpleBody({
        path: "/compatibility",
        title: t("compatibility.title"),
        description: t("compatibility.description"),
        sections: [
          section(
            "볼 수 있는 관계",
            bullets([
              t("compatibility.rel_lover"),
              t("compatibility.rel_partner"),
              t("compatibility.rel_friend"),
              t("compatibility.rel_family"),
              t("compatibility.rel_coworker"),
            ])
          ),
        ],
      }),
    },
    {
      file: "yearly.html",
      path: "/yearly",
      title: PAGE_SEO.yearly.title,
      description: PAGE_SEO.yearly.description,
      nodes: buildYearlyGraph({
        title: PAGE_SEO.yearly.title,
        description: PAGE_SEO.yearly.description,
      }),
      body: simpleBody({
        path: "/yearly",
        title: PAGE_SEO.yearly.title,
        description: PAGE_SEO.yearly.description,
        sections: [
          section(
            t("yearly_fortune.tab_daily"),
            paragraphs([t("yearly_fortune.daily_title"), t("yearly_fortune.daily_desc")])
          ),
          section(
            t("yearly_fortune.tab_lifetime"),
            paragraphs([t("yearly_fortune.lifetime_title"), t("yearly_fortune.lifetime_desc")])
          ),
        ],
      }),
    },
    {
      file: "faq.html",
      path: "/faq",
      title: t("faq.title"),
      description: PAGE_SEO.faq.description,
      nodes: buildFaqPageGraph({ title: t("faq.title"), items: SITE_FAQ_ITEMS }),
      body: simpleBody({
        path: "/faq",
        title: t("faq.title"),
        description: PAGE_SEO.faq.description,
        sections: [section("자주 묻는 질문", faqHtml(SITE_FAQ_ITEMS))],
      }),
    },
    {
      file: "purchase.html",
      path: PAGE_SEO_PURCHASE_PATH,
      title: PURCHASE_PAGE_TITLE,
      description: PURCHASE_PAGE_DESCRIPTION,
      nodes: buildPurchaseGraph({
        title: PURCHASE_PAGE_TITLE,
        description: PURCHASE_PAGE_DESCRIPTION,
      }),
      body: purchaseBody(),
    },
    {
      file: "terms.html",
      path: PAGE_SEO.terms.path,
      title: PAGE_SEO.terms.title,
      description: PAGE_SEO.terms.description,
      nodes: buildLegalPageGraph({
        path: PAGE_SEO.terms.path,
        title: PAGE_SEO.terms.title,
        description: PAGE_SEO.terms.description,
        datePublished: termsDoc?.effective_at ?? null,
      }),
      body: legalBody({
        path: PAGE_SEO.terms.path,
        title: t("terms_pages.terms_title"),
        description: PAGE_SEO.terms.description,
        doc: termsDoc,
      }),
    },
    {
      file: "privacy-policy.html",
      path: PAGE_SEO.privacy.path,
      title: PAGE_SEO.privacy.title,
      description: PAGE_SEO.privacy.description,
      nodes: buildLegalPageGraph({
        path: PAGE_SEO.privacy.path,
        title: PAGE_SEO.privacy.title,
        description: PAGE_SEO.privacy.description,
        datePublished: privacyDoc?.effective_at ?? null,
      }),
      body: legalBody({
        path: PAGE_SEO.privacy.path,
        title: t("terms_pages.privacy_title"),
        description: PAGE_SEO.privacy.description,
        doc: privacyDoc,
      }),
    },
    {
      file: "contact.html",
      path: PAGE_SEO.contact.path,
      title: PAGE_SEO.contact.title,
      description: PAGE_SEO.contact.description,
      nodes: buildContactPageGraph({
        title: PAGE_SEO.contact.title,
        description: PAGE_SEO.contact.description,
      }),
      body: simpleBody({
        path: PAGE_SEO.contact.path,
        title: t("contact.title"),
        description: t("contact.subtitle"),
        sections: [
          section(
            "문의 시 남기는 정보",
            bullets([t("contact.email_label"), t("contact.subject_label"), t("contact.message_label")])
          ),
        ],
      }),
    },
    {
      file: "daily-tarot.html",
      path: "/daily-tarot",
      title: t("daily_tarot.meta_title"),
      description: t("daily_tarot.meta_desc"),
      nodes: buildDailyTarotGraph({
        title: t("daily_tarot.meta_title"),
        description: t("daily_tarot.meta_desc"),
      }),
      body: simpleBody({
        path: "/daily-tarot",
        title: t("daily_tarot.meta_title"),
        description: t("daily_tarot.meta_desc"),
      }),
    },
  ];

  for (const page of pages) {
    writeHtml(distDir, page.file, renderPage(template, page));
  }

  console.log(
    `[prerender-pages] ${pages.length}개 페이지 + SPA 셸 생성 완료 ` +
      `(메인 후기 ${homeReviews.length}건 / 리포트 후기 ${reportReviews.length}건)`
  );
}

await main();
