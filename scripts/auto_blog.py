import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests
from google import genai
from pydantic import BaseModel
from supabase import create_client


class BlogPost(BaseModel):
    title: str
    content: str
    slug: str
    excerpt: str
    tags: list[str]


@dataclass(frozen=True)
class DailyTopicSpec:
    """요일(UTC)별 고전 서양 점성술 주제와 문맥형 CTA 힌트."""

    topic: str
    cta_context: str
    allow_auxiliary_ephemeris_sites: bool


def get_daily_topic_and_cta() -> DailyTopicSpec:
    """
    `datetime.now(timezone.utc).weekday()` 기준 요일별 테마(UTC).
    월·화: 행성·별자리, 수·목: 하우스, 금: 어스펙트, 토: 트랜짓, 일: 종합 해석.
    """
    wd = datetime.now(timezone.utc).weekday()

    if wd == 0:  # 월 — 행성과 위계
        topic = (
            "고전 서양 점성술의 행성 위계(planetary hierarchy), 천상의 질(the natures of planets), "
            "그리고 본질적 가·불리(essential dignities / debilities)가 판단 논리에 끼치는 역할"
        )
        cta_context = (
            "독자가 우위·불리 표를 일일이 대조하지 않고도 출생차트에서 행성의 조건을 "
            "정리해 보고 싶은 상황을 가정해, 본문 논지와 맞닿게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 1:  # 화 — 행성과 별자리의 결합
        topic = (
            "12개 별자리(sign)의 기본 성격과, 각 별자리가 어떤 행성의 '집(domicile)'인지 — "
            "행성과 별자리가 짝지어지는 고전적 원리, 그리고 같은 행성이라도 어느 별자리에 있느냐에 따라 "
            "표현이 어떻게 달라지는지"
        )
        cta_context = (
            "별자리 운세 정도만 들어본 독자가, 자신의 출생차트에서 행성이 어느 별자리에 있는지 "
            "확인하고 그 의미를 직관적으로 파악하고 싶을 때의 맥락으로 자연스럽게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 2:  # 수 — 하우스
        topic = (
            "12하우스(whole-sign 등 고전 틀)와 각·속·떨어짐(angular, succedent, cadent)이 "
            "사건의 가중치에 주는 고전적 의미"
        )
        cta_context = (
            "하우스 강약과 각도를 한눈에 짚고 실생활 주제(일, 관계, 재정 등)로 옮기고 싶은 독자에게 "
            "닿는 흐름으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 3:  # 목 — 하우스 주인과 접수
        topic = (
            "하우스 주인(house rulers)과 접수(reception)가 겹칠 때 "
            "하우스 주제를 어떻게 단정·수정하는지에 대한 고전적 원칙"
        )
        cta_context = (
            "룰러 체인을 고려한 해석을 출생 정보에 맞춰 시험해 보고 싶은 독자의 "
            "상황을 상정해 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 4:  # 금 — 어스펙트
        topic = (
            "행성과 행성 사이의 각도(aspect): 컨정션·옵포지션·트라인·스퀘어·섹스타일의 "
            "고전적 의미와 차이, 그리고 어스펙트가 차트 해석에 어떤 식으로 무게를 더하는지"
        )
        cta_context = (
            "어스펙트라는 말은 들어봤지만 각 각도가 실제로 어떤 의미를 가지는지, "
            "본인 차트의 행성 관계를 어떻게 읽어야 할지 막연한 독자의 맥락으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 5:  # 토 — 트랜짓
        topic = (
            "본차트(radix) 대비 트랜짓: 주요 악셉트·하우스 접근, "
            "고전적 관점에서의 허용·거부 조건과 실무적 타이밍"
        )
        cta_context = (
            "여러 트랜짓을 동시에 고려할 때 우선순위를 세우거나 본인 일정에 맞춰 "
            "의미를 압축하고 싶은 독자에게 닿게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    else:  # wd == 6, 일 — 출생 차트 종합 해석
        topic = (
            "출생 차트를 처음부터 끝까지 어떻게 읽어야 하는지 — 행성·별자리·하우스·각도를 "
            "한 번에 보는 종합 해석의 순서와, 초보자가 자주 막히는 지점에 대한 고전적 안내"
        )
        cta_context = (
            "차트 이미지는 받아 봤지만 어디서부터 봐야 할지 몰라 막막한 독자가 "
            "한 번에 정리된 해석을 받아 보고 싶을 때의 맥락으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False

    return DailyTopicSpec(
        topic=topic,
        cta_context=cta_context,
        allow_auxiliary_ephemeris_sites=allow_auxiliary_ephemeris_sites,
    )


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9가-힣\s-]", "", value)
    value = re.sub(r"\s+", "-", value).strip("-")
    value = re.sub(r"-{2,}", "-", value)
    return value[:80] or "post"


def _slug_suffix() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}-{random.randint(1000, 9999)}"


def _build_prompt(
    topic: str,
    cta_context: str,
    allow_auxiliary_ephemeris_sites: bool,
) -> str:
    if allow_auxiliary_ephemeris_sites:
        external_tools_block = (
            "보조 도구는 천체력이나 정밀한 트랜짓 날짜 계산을 다룰 때만, "
            "Astro.com 또는 Astro-Seek 중 하나를 본문 흐름 속에서 한 번 정도 가볍게 언급해도 된다. "
            "사이트 랭킹, 나열, 비교표, 제휴성 표현은 절대 쓰지 마."
        )
    else:
        external_tools_block = (
            "Astro.com, Astro-Seek 같은 외부 사이트는 이 주제에서는 굳이 언급하지 마."
        )

    return f"""
너는 20년 넘게 상담실에서 일반인을 직접 만나온 한국인 고전 서양 점성술사야.
독자는 점성술을 한 번도 공부해 본 적 없는, 별자리 운세 정도만 들어본 평범한 사람이라고 생각하고 글을 써.
대학 강의나 학술 논문처럼 쓰지 마. 단골 손님에게 차 한 잔 내주면서 "이게 왜 그런 거냐면요…" 하고 쉽게 풀어주는 대화체에 가깝게 써.

지키는 범위:
- 다루는 주제는 오직 고전 서양 점성술(전통 점성술)이야.
- 사주명리, 오행, 십성, 타로, 주역, 풍수, 신점 같은 다른 점법은 절대로 끌어들이지 마. 비교도 하지 마.

읽히게 쓰는 법(핵심, 반드시 지켜):
- 어려운 용어를 그냥 쏟아내지 마. 처음 나오는 개념은 일상 비유로 먼저 감을 잡게 한 뒤에 이름을 알려줘.
  예) "이 행성이 자기 집에 있다고 생각하면 돼요. 점성술에서는 이걸 '도미사일(domicile)'이라고 부릅니다." 같은 식.
- 영어 원어는 꼭 필요할 때 한 번만 괄호로 병기하고, 그 뒤로는 한국어로만 써. 영어 용어를 본문에 도배하지 마.
- 한 문단은 보통 3~5문장 안쪽으로 짧게. 한 문장이 너무 길면 두 문장으로 끊어.
- 추상적인 "에너지", "기운", "본질" 같은 말로 도망가지 마. 구체적인 예시(직장에서, 연애에서, 가족 관계에서 이렇게 나타난다)를 꼭 같이 보여줘.
- 글 첫머리는 "고전 점성술에서 X는…" 같은 백과사전식 문장으로 시작하지 마. 독자가 일상에서 궁금해할 법한 질문이나 장면, 짧은 일화로 자연스럽게 시작해.

AI가 쓴 티 안 나게 쓰는 법(반드시 지켜):
- "~입니다", "~합니다"만 반복하지 말고 "~예요", "~거든요", "~죠", "~답니다" 같은 부드러운 종결을 자연스럽게 섞어.
  단, 너무 가볍게 들리지 않도록 베테랑 상담가의 차분한 톤은 유지해.
- 다음 같은 AI 특유의 상투어는 쓰지 마:
  "단편적인 길흉을 논할 수 없습니다", "다층적인 구조", "직관적인 통찰", "핵심 기술", "본질을 이해해야 합니다",
  "결론적으로", "요약하자면", "~에 다름 아닙니다", "~라고 할 수 있겠습니다", "~임을 알 수 있습니다",
  "여러분", "오늘은 ~에 대해 알아보겠습니다", "함께 살펴보겠습니다".
- "세 가지 축", "다섯 가지 핵심 포인트" 같이 숫자로 깔끔하게 떨어지는 목차 구조를 일부러 만들지 마. 자연스럽게 흐르게.
- 같은 문단 안에서 같은 단어를 두 번 이상 굵게 강조하거나, 한 글에서 굵은 글씨가 10개 넘게 나오지 않게 해.

마크다운 규칙(아주 중요, 어기면 안 됨):
- 문단과 문단 사이에는 반드시 빈 줄 한 줄을 띄워. 즉 `\\n\\n` 형태로 문단을 구분해.
  하나의 문단은 한 덩어리 생각이고, 다음 생각으로 넘어갈 때는 무조건 빈 줄 한 줄 넣어. 한 줄 띄움만으로는 화면에서 문단이 안 떨어져.
- 제목은 ## (H2)와 ### (H3)만 써. H1(#)은 쓰지 마. H2/H3 위아래에도 빈 줄 한 줄씩 넣어.
- 굵게(`**텍스트**`)는 핵심 개념이나 한 문장의 키 메시지를 짚을 때만, 한 글에서 4~7번 정도까지만 써. 같은 단어를 두 번 이상 굵게 강조하지 마.
- 굵게 강조에 한국어 조사를 직접 붙이지 마. 닫는 `**` 바로 다음에는 공백이나 문장부호가 오게 해.
  (이유: `**행성**은` 같은 패턴은 일부 렌더러에서 별표가 그대로 보일 수 있어. 한국어 조사가 붙어야 하면 굵게 부분을 줄여서 조사 앞에서 끊어.)
  좋음: "이 별을 점성술에서는 **도미사일(domicile)**이라고 불러요." (닫는 ** 다음에 "이라고"가 오니 조사 직접 부착 아님 — 다만 더 안전하게는 "이걸 **도미사일**, 즉 '집'이라고 부릅니다." 처럼 닫는 ** 다음에 쉼표/공백을 두는 형태가 베스트)
  베스트: "고전에서는 행성을 일종의 **그릇**이라고 봐요." ← 닫는 ** 다음이 "이라고"(공백 없이도 어절 경계)
  나쁨: "**행성**은 천체입니다." ← 닫는 ** 바로 뒤에 조사 '은' 직결 (금지)
  나쁨: "**진짜미래**를 추천해요." ← 닫는 ** 바로 뒤에 조사 '를' 직결 (금지)
  요령: 굵게 처리할 어절을 잡을 때 그 뒤에 공백·쉼표·마침표가 오도록 문장 구조를 짜. 안 되면 그 단어는 굵게 처리하지 마.
- 기울임(`*텍스트*`, `_텍스트_`)과 밑줄은 본문에서 쓰지 마. 한국어에는 기울임 표현이 어색해.
- 글머리표(`- `)는 정말 나열이 필요할 때만 써. 본문은 가능하면 줄글로 풀어 써. 글머리표를 쓸 때도 위아래에 빈 줄을 둬.

CTA(살짝만, 자연스럽게):
- 글 맨 끝에 진짜미래(truefuture.kr) 서비스를 한 번만, 한두 문장으로 자연스럽게 권유해. 본문 흐름 안에 녹여서, 광고처럼 들리지 않게.
- 서비스 이름은 그대로 '진짜미래(truefuture.kr)' 라고만 적어. 별표로 감싸지 마.
- "TOP 3", "최고의", "강력 추천" 같은 광고 문구 금지. 랭킹이나 비교표도 금지.
- 아래 CTA 맥락을 참고해서 자연스럽게 연결해.
  CTA 맥락: {cta_context}

{external_tools_block}

오늘 다룰 주제(이걸 그대로 베끼지 말고, 일반인이 읽기 좋게 풀어서 설명해):
{topic}

분량과 구성:
- 한국어 기준 1500~2200자 정도. 너무 짧지도, 너무 길지도 않게.
- 도입 → 본론(2~3개의 H2 섹션) → 마무리 + 가벼운 CTA 한 단락.
- 제목(title)은 클릭하고 싶어지는 한국어 한 줄. 영어 용어 나열 금지. 물음표나 일상적인 표현 활용 가능.

반드시 아래 JSON 스키마로만 응답해:
{{
  "title": "...",
  "content": "...",
  "slug": "...",
  "excerpt": "...",
  "tags": ["키워드1", "키워드2", "키워드3"]
}}

응답 규칙:
- 응답은 오직 JSON만. 코드펜스(```)나 다른 설명 텍스트 금지.
- content는 마크다운으로 작성해. 문단은 빈 줄(`\\n\\n`)로 반드시 구분하고, 헤더는 ##/###만 사용해.
- 굵게(`**`)는 위 규칙대로 핵심 어절에만 절제해서 쓰고, 닫는 `**` 뒤에 한국어 조사가 직접 붙지 않도록 문장을 구성해.
- excerpt는 한국어 한두 문장으로, 검색 결과에서 클릭하고 싶어질 만한 짧은 미리보기. excerpt에는 굵게/마크다운 쓰지 마, 평문으로만.
- tags는 SEO용 한국어 키워드 3~5개 문자열 배열. 사주, 타로 등 비(非)고전 서양 점성술 키워드는 절대 넣지 마.
""".strip()


_KOREAN_JOSA = (
    "은는이가을를과와의로으로에게서께서도만조차마저까지부터처럼보다이나거나"
    "라고라며이라고이라며이며이라서라서이라서이라"
)


def _sanitize_markdown(text: str) -> str:
    """잘 형성된 `**굵게**` 쌍은 보존하고, 짝 안 맞는 별표/언더스코어와
    한국어 기울임 마크업만 정리한다. 닫는 `**` 바로 뒤에 한국어 조사가
    직결되어 일부 렌더러에서 별표가 노출되는 패턴은 별표 안쪽으로 조사를
    당겨 안전하게 만든다."""
    if not isinstance(text, str):
        return text

    # 0) `** 텍스트 **` 처럼 안쪽 공백이 있는 경우 — 닫힘이 안 되니 공백 제거
    text = re.sub(r"\*\*\s+([^\n*]+?)\s+\*\*", r"**\1**", text)

    # 1) 잘 형성된 `**...**` 쌍을 임시 토큰으로 보호. 한 줄 안, 양끝 비공백.
    bold_pair_re = re.compile(r"\*\*(?=\S)([^\n*]+?)(?<=\S)\*\*")

    placeholders: list[str] = []

    def _keep_pair(match: "re.Match[str]") -> str:
        inner = match.group(1)
        placeholders.append(inner)
        return f"\x00BOLD{len(placeholders) - 1}\x00"

    text = bold_pair_re.sub(_keep_pair, text)

    # 2) 보호 토큰 밖에 남은 짝 안 맞는 `**`, `*`, `__`, `_` 정리
    text = text.replace("**", "")
    text = re.sub(r"(?<!\*)\*(?!\*)", "", text)
    text = text.replace("__", "")
    text = re.sub(r"(?<!_)_(?!_)", "", text)

    # 3) 보호된 굵게 쌍 복원. 단, 닫는 `**` 바로 뒤가 한국어 조사면
    #    조사를 굵게 안쪽으로 흡수시켜 렌더러 호환 패턴으로 만든다.
    josa_pattern = re.compile(rf"\x00BOLD(\d+)\x00([{_KOREAN_JOSA}]+)")

    def _absorb_josa(match: "re.Match[str]") -> str:
        idx = int(match.group(1))
        josa = match.group(2)
        return f"**{placeholders[idx]}{josa}**"

    text = josa_pattern.sub(_absorb_josa, text)

    def _restore(match: "re.Match[str]") -> str:
        idx = int(match.group(1))
        return f"**{placeholders[idx]}**"

    text = re.sub(r"\x00BOLD(\d+)\x00", _restore, text)

    return text


def _normalize_paragraph_breaks(text: str) -> str:
    """3개 이상 연속 개행은 2개로 줄이고, 헤더(##/###) 위아래는 빈 줄을
    보장한다. 단일 개행을 이중 개행으로 강제하지는 않는다(리스트/인용 구조
    파괴 방지)."""
    if not isinstance(text, str):
        return text

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 헤더 위에 빈 줄 보장
    text = re.sub(r"([^\n])\n(#{2,3} )", r"\1\n\n\2", text)
    # 헤더 다음에 빈 줄 보장
    text = re.sub(r"^(#{2,3} [^\n]*)\n(?!\n|#)", r"\1\n\n", text, flags=re.MULTILINE)

    return text.strip() + "\n"


def _safe_json_loads(text: str):
    if not isinstance(text, str):
        return None
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except Exception:
        m = re.search(r"\{[\s\S]*\}\s*$", t)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None


def _extract_text_from_genai_response(resp) -> str:
    text = getattr(resp, "text", None)
    if isinstance(text, str) and text.strip():
        return text

    candidates = getattr(resp, "candidates", None) or []
    if candidates:
        content = getattr(candidates[0], "content", None)
        parts = getattr(content, "parts", None) or []
        if parts:
            t = getattr(parts[0], "text", None)
            if isinstance(t, str) and t.strip():
                return t

    return ""


def _is_transient_genai_error(e: Exception) -> bool:
    msg = (str(e) or "").lower()
    transient_markers = [
        "503",
        "429",
        "unavailable",
        "resource_exhausted",
        "high demand",
        "rate limit",
        "ratelimit",
        "too many requests",
        "temporarily",
        "timeout",
        "timed out",
        "connection reset",
        "connection aborted",
        "connection error",
        "service unavailable",
    ]
    if any(m in msg for m in transient_markers):
        return True

    code = getattr(e, "code", None)
    if isinstance(code, int) and code in (429, 503):
        return True

    status_code = getattr(e, "status_code", None)
    if isinstance(status_code, int) and status_code in (429, 503):
        return True

    return False


def generate_post(gemini_api_key: str) -> dict:
    spec = get_daily_topic_and_cta()
    prompt = _build_prompt(
        spec.topic,
        spec.cta_context,
        spec.allow_auxiliary_ephemeris_sites,
    )

    client = genai.Client(api_key=gemini_api_key)

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = client.models.generate_content(
                model="gemini-3.1-pro-preview",
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": BlogPost,
                    "temperature": 0.9,
                    "max_output_tokens": 12000,
                },
            )
            last_err = None
            break
        except Exception as e:
            last_err = e
            if _is_transient_genai_error(e) and attempt < 3:
                print(
                    f"[auto_blog] transient error on Gemini call (attempt {attempt}/3): {e}. retrying in 30s...",
                    file=sys.stderr,
                )
                time.sleep(30)
                continue
            raise

    if last_err is not None:
        raise last_err

    text = _extract_text_from_genai_response(resp)
    data = _safe_json_loads(text)
    if not isinstance(data, dict):
        raise ValueError(f"Gemini JSON 파싱 실패. raw={text[:500]}")

    raw_title = (data.get("title") or "").strip()
    raw_content = (data.get("content") or "").strip()
    slug = (data.get("slug") or "").strip()
    raw_excerpt = (data.get("excerpt") or "").strip()
    tags = data.get("tags")

    # 제목은 굵게 마크업이 들어와도 평문화(렌더러에 따라 이상해질 수 있음)
    title = re.sub(r"\*\*(.+?)\*\*", r"\1", raw_title, flags=re.DOTALL)
    title = re.sub(r"[*_]", "", title).strip()

    # 본문은 굵게 쌍을 살리되 짝 안 맞는 별표/조사 직결 패턴 정리
    content = _normalize_paragraph_breaks(_sanitize_markdown(raw_content))

    # 미리보기(excerpt)는 평문만
    excerpt = re.sub(r"\*\*(.+?)\*\*", r"\1", raw_excerpt, flags=re.DOTALL)
    excerpt = re.sub(r"[*_`#>]+", "", excerpt).strip()

    if not title or not content:
        raise ValueError("Gemini 응답에 title/content가 비어 있습니다.")

    base_slug = _slugify(slug) if slug else _slugify(title)
    final_slug = f"{base_slug}-{_slug_suffix()}"

    if not excerpt:
        excerpt = (re.sub(r"\s+", " ", re.sub(r"[#*_>`-]+", " ", content)).strip())[:160]

    if isinstance(tags, list):
        tags = [str(t).strip() for t in tags if str(t).strip()]
    else:
        tags = []

    base_tags = ["고전점성술", "점성학", "출생차트", "별자리", "행성"]
    for t in base_tags:
        if len(tags) >= 3:
            break
        if t not in tags:
            tags.append(t)
    tags = tags[:5]

    return {
        "title": title,
        "content": content,
        "slug": final_slug,
        "excerpt": excerpt,
        "tags": tags,
    }


def _trigger_cloudflare_hook(hook_url: str | None) -> None:
    if not hook_url:
        return
    try:
        requests.post(hook_url, timeout=15)
    except Exception:
        return


def insert_post_to_supabase(supabase_url: str, service_role_key: str, post: dict) -> dict:
    sb = create_client(supabase_url, service_role_key)
    payload = {
        "title": post["title"],
        "content": post["content"],
        "excerpt": post["excerpt"],
        "tags": post.get("tags", []),
        "slug": post["slug"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = sb.table("posts").insert(payload).execute()
    return {"inserted": True, "data": getattr(res, "data", None), "slug": post["slug"]}


def main() -> int:
    try:
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        cloudflare_hook_url = os.getenv("CLOUDFLARE_DEPLOY_HOOK_URL")

        missing = [
            k
            for k, v in {
                "GEMINI_API_KEY": gemini_api_key,
                "SUPABASE_URL": supabase_url,
                "SUPABASE_SERVICE_ROLE_KEY": supabase_service_role_key,
            }.items()
            if not v
        ]
        if missing:
            raise ValueError(f"환경변수 누락: {', '.join(missing)}")

        post = generate_post(gemini_api_key)
        result = insert_post_to_supabase(supabase_url, supabase_service_role_key, post)
        rows = len(result.get("data") or [])
        print(f"[auto_blog] inserted={result.get('inserted')} slug={result.get('slug')} rows={rows}")
        _trigger_cloudflare_hook(cloudflare_hook_url)
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
