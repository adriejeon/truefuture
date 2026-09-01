/**
 * 프리미엄 상세 리포트 PDF 렌더링 테스트 (Node)
 *
 * 웹앱과 동일한 문서 정의(src/pdf/reportPdf.js)를 사용해 실제 PDF를 생성한다.
 * 사용법:
 *   node scripts/test-report-pdf.mjs <출력디렉터리> [콘텐츠.md] [질문텍스트파일]
 *
 * 인자 없이 실행하면 엣지 케이스 7종의 합성 콘텐츠로 PDF들을 생성한다.
 * (검증: 각 PDF는 pdfinfo/pdftotext/pdftoppm 으로 텍스트 레이어·페이지 규격·레이아웃을 확인)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(__dirname, "../public/fonts");

const { registerReportFonts, buildReportPdfDocument } = await import(
  "../src/pdf/reportPdf.js"
);
const reactPdf = await import("@react-pdf/renderer");

registerReportFonts(fontsDir);

const outDir = process.argv[2] || path.resolve(__dirname, "../.pdf-test-out");
fs.mkdirSync(outDir, { recursive: true });

async function renderTo(filePath, doc) {
  if (typeof reactPdf.renderToFile === "function") {
    await reactPdf.renderToFile(doc, filePath);
    return;
  }
  const instance = reactPdf.pdf(doc);
  const result = await instance.toBuffer();
  if (Buffer.isBuffer(result)) {
    fs.writeFileSync(filePath, result);
  } else {
    // Node 스트림
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(filePath);
      result.pipe(ws);
      result.on("error", reject);
      ws.on("finish", resolve);
      ws.on("error", reject);
    });
  }
}

const baseSnapshot = {
  name: "Adrie",
  birth_date: "1991-10-23T09:40:00",
  birth_time: "09:40",
  gender: "여자",
  city_name: "Seoul",
  lat: 37.5665,
  lng: 126.978,
  timezone: "Asia/Seoul",
};

// ===== 커스텀 콘텐츠 렌더 모드 =====
if (process.argv[3]) {
  const content = fs.readFileSync(process.argv[3], "utf-8");
  const question = process.argv[4] ? fs.readFileSync(process.argv[4], "utf-8").trim() : null;
  const doc = buildReportPdfDocument({
    snapshot: baseSnapshot,
    question,
    content,
    createdAt: "2026-09-01T03:00:00Z",
  });
  const out = path.join(outDir, "report-sample.pdf");
  await renderTo(out, doc);
  console.log("OK", out);
  process.exit(0);
}

// ===== 엣지 케이스 합성 콘텐츠 =====

const para = (s, n = 3) => Array.from({ length: n }, () => s).join(" ");
const longPara = para(
  "이 시기에는 일과 생활의 균형이 조금씩 달라질 가능성이 있습니다. 기존에 해오던 방식이 그대로 이어지기보다, 우선순위를 다시 정하고 환경을 정비하는 과정이 자연스럽게 나타나는 흐름으로 볼 수 있습니다.",
  4,
);

function yearsContent(startYear, count, paraPerYear = 5) {
  const parts = ["## 앞으로 10년의 전체 흐름", longPara, "", "## 연도별 상세 흐름"];
  for (let i = 0; i < count; i++) {
    const y = startYear + i;
    parts.push(`### ${y}년 (만 ${34 + i}~${35 + i}세) — 흐름이 바뀌는 해`);
    for (let p = 0; p < paraPerYear; p++) parts.push(longPara);
  }
  parts.push("## 중요한 전환점과 준비할 일", longPara, "## 마무리", longPara);
  return parts.join("\n\n");
}

const cases = [
  {
    name: "case1-multi-subquestions",
    question: "올해 이직이 가능한가요? 언제가 좋은가요? 어떤 회사가 맞을까요?",
    content: [
      "## 상담을 시작하며",
      longPara,
      "## 먼저, 질문에 답해드리면",
      "**질문 1 —** 올해 하반기부터 가능성이 열립니다. **질문 2 —** 유력한 구간은 연말입니다. **질문 3 —** 체계가 잡힌 조직이 잘 맞습니다.",
      "## 질문에 대한 상세 답변",
      "### 질문 1. 올해 안에 이직이 가능한가요?",
      longPara,
      "### 질문 2. 가능하다면 언제가 유력한가요?",
      longPara,
      "### 질문 3. 어떤 성격의 회사로 이동할 가능성이 있나요?",
      longPara,
      "## 질문을 이해하기 위해 필요한 타고난 성향",
      longPara,
    ].join("\n\n"),
  },
  {
    name: "case2-multiparagraph-question",
    question:
      "안녕하세요. 지금 회사를 다닌 지 5년이 되었는데 요즘 고민이 많습니다.\n\n첫째로는 지금 회사를 계속 다니는 것이 맞는지 궁금하고, 둘째로는 만약 옮긴다면 준비를 어떻게 해야 할지도 알고 싶습니다.\n\n마지막으로 장기적으로 독립도 생각하고 있는데 시기적으로 어떤지 봐주시면 감사하겠습니다.",
    content: yearsContent(2026, 3, 2),
  },
  {
    name: "case3-unknown-birthtime",
    snapshot: { ...baseSnapshot, birth_time: null, birth_date: "1991-10-23T12:00:00" },
    question: "출생 시각을 모르는 경우입니다.",
    content: yearsContent(2026, 3, 2),
  },
  {
    name: "case4-eleven-years",
    question: "10년 흐름이 11개 달력 연도에 걸치는 케이스",
    content: yearsContent(2026, 11, 4),
  },
  {
    name: "case5-long-korean-question",
    question:
      "제가 지금 다니는 회사에서 팀이 개편되면서 역할이 애매해졌는데 올해 안에 이직하는 것이 좋을지 아니면 내년 상반기까지 기다렸다가 움직이는 것이 좋을지, 그리고 이직한다면 지금처럼 큰 조직이 좋을지 작은 조직이 좋을지도 궁금합니다.",
    content: yearsContent(2026, 2, 2),
  },
  {
    name: "case6-long-year-overflow",
    question: null,
    content: yearsContent(2026, 4, 14),
  },
  {
    name: "case7-long-url",
    question: "긴 URL과 영문 문자열 포함 케이스",
    content: [
      "## 상담을 시작하며",
      `참고 링크는 https://www.example.com/very/long/path/that/keeps/going/and/going/report-download-page?session=abcdef1234567890abcdef1234567890&lang=ko 입니다. 그리고 SupercalifragilisticexpialidociousExtremelyLongEnglishTokenWithoutAnySpacesAtAll 같은 문자열도 안전하게 줄바꿈되어야 합니다.`,
      longPara,
    ].join("\n\n"),
  },
];

for (const c of cases) {
  const doc = buildReportPdfDocument({
    snapshot: c.snapshot || baseSnapshot,
    question: c.question,
    content: c.content,
    createdAt: "2026-09-01T03:00:00Z",
  });
  const out = path.join(outDir, `${c.name}.pdf`);
  await renderTo(out, doc);
  console.log("OK", out);
}
console.log("DONE");
