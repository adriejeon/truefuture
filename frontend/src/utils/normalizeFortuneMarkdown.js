/**
 * 운세/타로 결과 마크다운을 렌더(ReactMarkdown) 직전에 정규화한다.
 *
 * 두 가지 가독성 문제를 해결한다.
 *  (A) 볼드 깨짐: CommonMark의 emphasis flanking 규칙 때문에
 *      `**'네이비 블루(Navy Blue)'**와` 처럼 볼드가 문장부호로 끝나고 바로 한글이 붙으면
 *      닫는 `**` 가 right-flanking을 만족하지 못해 볼드가 적용되지 않고 `**` 가 그대로 노출된다.
 *  (B) 볼드 요약 라벨(`**금전운:**` 등)과 서브텍스트가 한 줄에 붙어 나와 가독성이 떨어진다.
 *      → 라벨을 제목 줄로 올리고 서브텍스트를 다음 줄로 분리한다.
 *
 * 앱(Flutter)의 markdown_normalize.dart 와 동일한 규칙을 유지한다.
 */

// 볼드 델리미터 안쪽 가장자리에 붙는 따옴표류(밖으로 이동 대상)
const EDGE_QUOTES =
  "\"'‘’“”«»「」『』";

// CommonMark의 "Unicode punctuation" 근사 (문장부호 + 기호)
const PUNCT_RE = /[!-/:-@[-`{-~¡-¿‐-‧‰-⁞　-〿！-｠\p{P}\p{S}]/u;

function isPunct(ch) {
  return !!ch && PUNCT_RE.test(ch);
}
function isSpace(ch) {
  return !!ch && /\s/.test(ch);
}

/**
 * (B) 줄 맨 앞의 `**라벨:**` / `**라벨**:` (앞에 목록기호·번호가 있어도) 를
 *     `**라벨**` 제목 줄 + 서브텍스트 줄로 분리한다.
 *     콜론이 반드시 있어야 하므로 일반 문장 첫 볼드 단어(예: `**네이비 블루**가 ...`)는 건드리지 않는다.
 */
function breakBoldLabelLines(text) {
  const marker = "(?:[-*•]\\s+|\\d+[.)]\\s+)?";
  // `**라벨**:` 형태
  const reOutside = new RegExp(
    `^(\\s*)${marker}\\*\\*\\s*([^*\\n]+?)\\s*\\*\\*\\s*[:：]\\s*(\\S[\\s\\S]*)$`,
  );
  // `**라벨:**` 형태 (콜론이 볼드 안쪽)
  const reInside = new RegExp(
    `^(\\s*)${marker}\\*\\*\\s*([^*\\n]+?)\\s*[:：]\\s*\\*\\*\\s*(\\S[\\s\\S]*)$`,
  );

  return text
    .split("\n")
    .map((line) => {
      const m = line.match(reOutside) || line.match(reInside);
      if (!m) return line;
      const indent = m[1] || "";
      const title = m[2].trim().replace(/[:：]\s*$/, "");
      const sub = m[3].trim();
      if (!title || !sub) return line;
      // 빈 줄로 문단 분리 → 제목/본문이 확실히 줄바꿈되어 보인다
      return `${indent}**${title}**\n\n${indent}${sub}`;
    })
    .join("\n");
}

/** (A-1) 볼드 양끝 따옴표를 델리미터 밖으로 이동: `**'X'**` → `'**X**'` (간격 없이 깔끔하게 교정) */
function moveEdgeQuotesOutOfBold(text) {
  return text.replace(/\*\*([^\n*][\s\S]*?)\*\*/g, (full, inner) => {
    const leadWs = (inner.match(/^\s*/) || [""])[0];
    const trailWs = (inner.match(/\s*$/) || [""])[0];
    let core = inner.slice(leadWs.length, inner.length - (trailWs.length || 0));
    if (!core) return full;
    let pre = "";
    let post = "";
    let s = 0;
    while (s < core.length && EDGE_QUOTES.includes(core[s])) {
      pre += core[s];
      s++;
    }
    let e = core.length;
    while (e > s && EDGE_QUOTES.includes(core[e - 1])) {
      e--;
    }
    post = core.slice(e);
    core = core.slice(s, e);
    if (!core) return full; // 내용이 전부 따옴표면 원본 유지
    return `${leadWs}${pre}**${core}**${post}${trailWs}`;
  });
}

/**
 * (A-2) 그래도 flanking 위반이 남는 볼드(닫는 `**` 앞이 문장부호 + 뒤가 글자 / 여는 `**` 반대 경우)에
 *       헤어스페이스(U+200A)를 삽입해 반드시 렌더되게 한다.
 *       `**` 를 토글로 보고 (여는/닫는) 쌍을 이뤄 판단한다.
 */
function fixBoldFlankingWithHairSpace(text) {
  const HAIR = " ";
  // 모든 ** 위치 수집
  const idxs = [];
  for (let i = 0; i + 1 < text.length; i++) {
    if (text[i] === "*" && text[i + 1] === "*") {
      idxs.push(i);
      i++; // 두 번째 * 건너뜀
    }
  }
  const opens = new Set();
  const closes = new Set();
  for (let k = 0; k + 1 < idxs.length; k += 2) {
    opens.add(idxs[k]);
    closes.add(idxs[k + 1]);
  }
  if (opens.size === 0) return text;

  let out = "";
  for (let i = 0; i < text.length; i++) {
    if ((opens.has(i) || closes.has(i)) && text[i] === "*" && text[i + 1] === "*") {
      const before = out.length ? out[out.length - 1] : "";
      const after = text[i + 2] || "";
      if (opens.has(i)) {
        // 여는 **가 문장부호로 시작하는데 앞이 글자면 → 앞에 헤어스페이스로 left-flanking 확보
        if (isPunct(after) && !isSpace(after) && before && !isSpace(before) && !isPunct(before)) {
          out += HAIR;
        }
        out += "**";
      } else {
        // 닫는 **가 문장부호 뒤인데 뒤가 글자면 → 뒤에 헤어스페이스로 right-flanking 확보
        out += "**";
        if (isPunct(before) && !isSpace(before) && after && !isSpace(after) && !isPunct(after)) {
          out += HAIR;
        }
      }
      i++; // 두 번째 * 건너뜀
    } else {
      out += text[i];
    }
  }
  return out;
}

/**
 * 운세/타로 마크다운 정규화 진입점.
 * @param {string} text
 * @returns {string}
 */
export function normalizeFortuneMarkdown(text) {
  if (!text || typeof text !== "string") return text || "";
  let t = text;
  t = breakBoldLabelLines(t); // (B) 라벨/서브텍스트 줄바꿈
  t = moveEdgeQuotesOutOfBold(t); // (A-1) 따옴표 밖으로
  t = fixBoldFlankingWithHairSpace(t); // (A-2) 잔여 깨짐 헤어스페이스 교정
  return t;
}

export default normalizeFortuneMarkdown;
