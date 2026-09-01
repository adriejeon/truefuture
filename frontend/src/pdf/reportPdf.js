/**
 * 프리미엄 상세 리포트 PDF 문서 정의 (@react-pdf/renderer)
 *
 * - 실제 텍스트 레이어를 가진 PDF (선택·검색·복사 가능, 한글 폰트 서브셋 임베드)
 * - A4 세로, 좌우 여백 대칭(19mm), 모든 페이지 동일 규격
 * - 브라우저(PremiumReport.jsx)와 Node 검증 스크립트(frontend/scripts/test-report-pdf.mjs)가
 *   같은 문서 정의를 공유하도록 JSX 없이 React.createElement 로 작성한다.
 */
import React from "react";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

const e = React.createElement;

// ===== 색상 (심플한 한국어 상담 리포트 팔레트) =====
const INK = "#2b2d36"; // 본문 차콜
const INK_STRONG = "#17181f"; // 제목·강조
const MUTED = "#8a8d99"; // 보조 텍스트
const ACCENT = "#8a6d3b"; // 탁한 골드·브라운 (절제 사용)
const ACCENT_SOFT = "#d8cdb4"; // 옅은 구분선
const BG_SOFT = "#f7f5f0"; // 신청 내용 상자

// mm → pt
const mm = (v) => v * 2.83465;

let fontsRegistered = false;

/**
 * 폰트 등록. base는 폰트 파일이 있는 URL 경로 또는 로컬 디렉터리 경로.
 * (브라우저: "/fonts", Node: 절대 경로)
 */
export function registerReportFonts(base) {
  if (fontsRegistered) return;
  Font.register({
    family: "Pretendard",
    fonts: [
      { src: `${base}/PretendardSub-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/PretendardSub-SemiBold.ttf`, fontWeight: 600 },
    ],
  });
  Font.register({
    family: "NotoSerifKRClosing",
    src: `${base}/NotoSerifKRSub-Closing.ttf`,
  });
  // 한국어: 공백 단위 줄바꿈(keep-all). 공백 없는 초장문(URL 등)만 안전하게 분절.
  Font.registerHyphenationCallback((word) => {
    if (word.length <= 18) return [word];
    const parts = [];
    for (let i = 0; i < word.length; i += 12) parts.push(word.substring(i, i + 12));
    return parts;
  });
  fontsRegistered = true;
}

// ===== 마크다운 파서 (## / ### / 목록 / 인용 / **볼드**) =====

function parseInline(text) {
  const runs = [];
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push({ text: part.slice(2, -2), bold: true });
    } else {
      runs.push({ text: part.replace(/\*\*/g, ""), bold: false });
    }
  }
  return runs.length > 0 ? runs : [{ text: "", bold: false }];
}

export function parseReportMarkdown(markdown) {
  const blocks = [];
  const lines = String(markdown || "").split("\n");
  let paragraph = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "p", runs: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^#{2}\s+/.test(trimmed) && !/^###/.test(trimmed)) {
      flush();
      blocks.push({ type: "h2", text: trimmed.replace(/^#{2}\s+/, "").replace(/\*\*/g, "") });
      continue;
    }
    if (/^#{3,}\s+/.test(trimmed)) {
      flush();
      const text = trimmed.replace(/^#{3,}\s+/, "").replace(/\*\*/g, "");
      blocks.push({ type: "h3", text, isYear: /^\d{4}년/.test(text) });
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flush();
      blocks.push({ type: "quote", runs: parseInline(trimmed.replace(/^>\s?/, "")) });
      continue;
    }
    const listMatch = trimmed.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      flush();
      blocks.push({ type: "li", runs: parseInline(listMatch[2]) });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();

  // 연도(###) 소제목 새 페이지 규칙:
  // 직전 의미 블록이 "연도별 상세 흐름" h2 인 첫 연도는 붙여 두고, 그 외 연도는 새 페이지에서 시작.
  let prevMeaningful = null;
  for (const b of blocks) {
    if (b.type === "h3" && b.isYear) {
      b.breakBefore = !(prevMeaningful && prevMeaningful.type === "h2" && /연도별/.test(prevMeaningful.text));
    }
    prevMeaningful = b;
  }
  return blocks;
}

// ===== 스타일 =====

const styles = StyleSheet.create({
  page: {
    fontFamily: "Pretendard",
    fontSize: 10.2,
    lineHeight: 1.78,
    color: INK,
    paddingTop: mm(20),
    paddingBottom: mm(24),
    paddingLeft: mm(19),
    paddingRight: mm(19),
    backgroundColor: "#ffffff",
  },
  footer: {
    position: "absolute",
    bottom: mm(11),
    left: mm(19),
    right: mm(19),
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
  },
  h2: {
    fontSize: 14,
    fontWeight: 600,
    color: INK_STRONG,
    marginTop: 24,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.8,
    borderBottomColor: ACCENT_SOFT,
    lineHeight: 1.45,
  },
  h3: {
    fontSize: 11.5,
    fontWeight: 600,
    color: INK_STRONG,
    marginTop: 18,
    marginBottom: 7,
    lineHeight: 1.5,
  },
  h3Year: {
    fontSize: 12.5,
    fontWeight: 600,
    color: INK_STRONG,
    marginTop: 6,
    marginBottom: 9,
    paddingBottom: 5,
    borderBottomWidth: 0.8,
    borderBottomColor: ACCENT_SOFT,
    lineHeight: 1.5,
  },
  p: { marginBottom: 8.5 },
  bold: { fontWeight: 600, color: INK_STRONG },
  quote: {
    borderLeftWidth: 1.5,
    borderLeftColor: ACCENT_SOFT,
    paddingLeft: 10,
    marginBottom: 9,
    color: "#5d5f6b",
  },
  liRow: { flexDirection: "row", marginBottom: 4.5, paddingLeft: 4 },
  liBullet: { width: 12, color: ACCENT },
  liText: { flex: 1 },

  // 표지
  coverPage: {
    fontFamily: "Pretendard",
    color: INK,
    paddingTop: mm(20),
    paddingBottom: mm(24),
    paddingLeft: mm(19),
    paddingRight: mm(19),
    backgroundColor: "#ffffff",
    justifyContent: "center",
  },
  coverInner: { alignItems: "center", marginTop: -mm(20) },
  coverBrand: { fontSize: 9, letterSpacing: 4, color: ACCENT, marginBottom: 14 },
  coverTitle: { fontSize: 24, fontWeight: 600, color: INK_STRONG, marginBottom: 6 },
  coverSub: { fontSize: 11, color: MUTED, marginBottom: 34 },
  coverRule: { width: 42, borderBottomWidth: 1, borderBottomColor: ACCENT_SOFT, marginBottom: 34 },
  coverInfoRow: { flexDirection: "row", marginBottom: 7 },
  coverInfoLabel: { width: 64, fontSize: 9.5, color: MUTED, textAlign: "right", marginRight: 14 },
  coverInfoValue: { fontSize: 10.5, color: INK_STRONG },
  coverFootnote: { position: "absolute", bottom: mm(20), left: 0, right: 0, textAlign: "center", fontSize: 8, color: MUTED },

  // 신청 내용 상자
  questionBox: {
    backgroundColor: BG_SOFT,
    borderRadius: 4,
    padding: 13,
    marginBottom: 6,
  },
  questionLabel: { fontSize: 9, color: ACCENT, fontWeight: 600, marginBottom: 5 },
  questionText: { fontSize: 10.2, lineHeight: 1.7 },

  // 마무리·면책
  closingWrap: { marginTop: 30, paddingTop: 22, borderTopWidth: 0.8, borderTopColor: ACCENT_SOFT },
  closingSentence: {
    fontFamily: "NotoSerifKRClosing",
    fontSize: 11,
    lineHeight: 1.9,
    color: ACCENT,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: mm(8),
  },
  noteTitle: { fontSize: 9, fontWeight: 600, color: MUTED, marginBottom: 4 },
  noteText: { fontSize: 8.5, lineHeight: 1.7, color: MUTED, marginBottom: 10 },
});

const CLOSING_SENTENCE =
  "이 풀이가 미래를 단정하는 답이 아니라, 앞으로의 선택을 조금 더 선명하게 바라보고 다음 걸음을 준비하는 작은 길잡이가 되기를 바랍니다.";

const METHOD_NOTE =
  "이 리포트는 서양 고전 점성술의 방법을 따릅니다. 수년 단위의 긴 흐름을 먼저 확인하고, 그 위에서 몇 년 단위의 변화 지표와 한 해의 주제, 한 달 단위의 세부 구간이 같은 방향을 가리키는지 겹쳐 살펴보았습니다. 여러 층의 흐름이 겹치는 시기만 분명한 시기로 서술했으며, 신호가 약한 시기는 약하다고 그대로 적었습니다.";

const DISCLAIMER_NOTE =
  "점성학적 해석은 가능성과 흐름을 살펴보기 위한 참고 자료이며, 의료·법률·투자 등 전문적인 판단을 대신하지 않습니다. 중요한 결정은 본인의 상황과 전문가의 조언을 함께 고려해 주세요.";

// ===== 렌더 =====

function renderRuns(runs, keyPrefix) {
  return runs.map((r, i) =>
    e(Text, { key: `${keyPrefix}-${i}`, style: r.bold ? styles.bold : undefined }, r.text),
  );
}

function renderBlocks(blocks) {
  const out = [];
  blocks.forEach((b, idx) => {
    const key = `b${idx}`;
    if (b.type === "h2") {
      out.push(e(Text, { key, style: styles.h2, minPresenceAhead: 90 }, b.text));
    } else if (b.type === "h3") {
      // break 와 minPresenceAhead 를 같은 요소에 함께 주면 레이아웃 계산이 발산하는
      // react-pdf 이슈가 있어, 새 페이지 시작 요소에는 minPresenceAhead 를 주지 않는다.
      const props = b.breakBefore
        ? { key, style: b.isYear ? styles.h3Year : styles.h3, break: true }
        : { key, style: b.isYear ? styles.h3Year : styles.h3, minPresenceAhead: 80 };
      out.push(e(Text, props, b.text));
    } else if (b.type === "quote") {
      out.push(e(View, { key, style: styles.quote }, e(Text, null, renderRuns(b.runs, key))));
    } else if (b.type === "li") {
      out.push(
        e(
          View,
          { key, style: styles.liRow, wrap: false },
          e(Text, { style: styles.liBullet }, "·"),
          e(Text, { style: styles.liText }, renderRuns(b.runs, key)),
        ),
      );
    } else {
      out.push(e(Text, { key, style: styles.p }, renderRuns(b.runs, key)));
    }
  });
  return out;
}

function formatBirthLabel(snapshot) {
  const birth = String(snapshot?.birth_date || "").substring(0, 10).replace(/-/g, ". ");
  const time = snapshot?.birth_time ? ` ${String(snapshot.birth_time).substring(0, 5)}` : "";
  return `${birth}${time}`;
}

function formatIssueDate(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

/**
 * 리포트 PDF 문서 엘리먼트 생성
 * @param {object} params { snapshot, question, content(markdown), createdAt }
 */
export function buildReportPdfDocument({ snapshot, question, content, createdAt }) {
  const blocks = parseReportMarkdown(content);
  const issueDate = formatIssueDate(createdAt);
  const name = snapshot?.name || "";

  const footer = e(
    View,
    { style: styles.footer, fixed: true },
    e(Text, null, "진짜미래 · truefuture.kr"),
    e(Text, { render: ({ pageNumber }) => `${pageNumber}` }),
  );

  // 표지
  const infoRow = (label, value) =>
    value
      ? e(
          View,
          { key: label, style: styles.coverInfoRow },
          e(Text, { style: styles.coverInfoLabel }, label),
          e(Text, { style: styles.coverInfoValue }, value),
        )
      : null;

  const coverPage = e(
    Page,
    { size: "A4", style: styles.coverPage },
    e(
      View,
      { style: styles.coverInner },
      e(Text, { style: styles.coverBrand }, "TRUE FUTURE"),
      e(Text, { style: styles.coverTitle }, "프리미엄 상세 리포트"),
      e(Text, { style: styles.coverSub }, "질문 상담과 앞으로 10년의 흐름"),
      e(View, { style: styles.coverRule }),
      infoRow("이름", `${name}${snapshot?.gender ? ` (${snapshot.gender})` : ""}`),
      infoRow("출생", formatBirthLabel(snapshot)),
      infoRow("출생지", snapshot?.city_name || ""),
      infoRow("발행일", issueDate),
    ),
    e(Text, { style: styles.coverFootnote }, "진짜미래 · truefuture.kr"),
  );

  // 본문 (신청 내용 → 원고 → 분석 기준·마무리·면책)
  const children = [];
  if (question) {
    children.push(
      e(
        View,
        { key: "qbox", style: styles.questionBox },
        e(Text, { style: styles.questionLabel }, "상담 신청 내용"),
        e(Text, { style: styles.questionText }, question),
      ),
    );
  }
  children.push(...renderBlocks(blocks));
  children.push(
    e(
      View,
      { key: "closing", style: styles.closingWrap },
      e(Text, { style: styles.closingSentence }, CLOSING_SENTENCE),
      e(Text, { style: styles.noteTitle }, "이 리포트의 분석 기준"),
      e(Text, { style: styles.noteText }, METHOD_NOTE),
      e(Text, { style: styles.noteTitle }, "분석 범위 및 면책 안내"),
      e(Text, { style: styles.noteText }, DISCLAIMER_NOTE),
      e(Text, { style: { fontSize: 8.5, color: MUTED, marginTop: 4 } }, "진짜미래 · truefuture.kr"),
    ),
  );

  const contentPage = e(Page, { size: "A4", style: styles.page, wrap: true }, footer, ...children);

  return e(Document, {
    title: `진짜미래 프리미엄 상세 리포트 — ${name}`,
    author: "진짜미래 truefuture.kr",
    language: "ko",
  }, coverPage, contentPage);
}
