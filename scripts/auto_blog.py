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
    월·화: 행성·위계, 수·목: 하우스·섹트, 금·토·일: 타임로드·트랜짓·정밀 타이밍.
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
    elif wd == 1:  # 화 — 행성과 위계(주야파 연동)
        topic = (
            "주야파(sect)와 행성의 낮·밤의 질(diurnal/nocturnal planets), "
            "주성(sect light) 맥락에서의 행성 조건 해석과 위계의 실무 적용"
        )
        cta_context = (
            "주야 차트 구분과 섹트 가점을 본인 차트에 적용해 보고 싶지만 진입 장벽이 느껴질 때의 "
            "독자 맥락을 염두에 두고 자연스럽게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 2:  # 수 — 하우스와 섹트
        topic = (
            "12하우스(whole-sign 등 고전 틀)와 각·속·떨어짐(angular, succedent, cadent)이 "
            "사건의 가중치에 주는 고전적 의미"
        )
        cta_context = (
            "하우스 강약과 각도를 한눈에 짚고 실생활 주제(일, 관계, 재정 등)로 옮기고 싶은 독자에게 "
            "닿는 흐름으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 3:  # 목 — 하우스와 섹트
        topic = (
            "하우스 주인(house rulers), 접수(reception), 주야파(sect)가 겹칠 때 "
            "하우스 주제를 어떻게 단정·수정하는지에 대한 고전적 원칙"
        )
        cta_context = (
            "룰러 체인과 섹트를 동시에 고려한 해석을 출생 정보에 맞춰 시험해 보고 싶은 독자의 "
            "상황을 상정해 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 4:  # 금 — 타임로드
        topic = (
            "연차 배당(annual profections)과 그 해의 시간의 주인(time lord), "
            "고전적 연도 테마 읽기의 기본 틀"
        )
        cta_context = (
            "연도 지배행성을 직접 산출·추적하기 부담스러운 독자가, 한 해의 초점을 "
            "빠르게 파악하고 싶을 때의 맥락으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = True
    elif wd == 5:  # 토 — 트랜짓
        topic = (
            "본차트(radix) 대비 트랜짓: 주요 악셉트·하우스 접근, "
            "고전적 관점에서의 허용·거부 조건과 실무적 타이밍"
        )
        cta_context = (
            "여러 트랜짓을 동시에 고려할 때 우선순위를 세우거나 본인 일정에 맞춰 "
            "의미를 압축하고 싶은 독자에게 닿게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = True
    else:  # wd == 6, 일 — 정밀 타이밍·천체력
        topic = (
            "에페머리스(천체력)와 트랜짓 입각(ingress)·정밀 시각 산출 시 "
            "고전 점성술 실무에서의 유의점과 한계"
        )
        cta_context = (
            "정밀 시각까지 맞춘 트랜짓 해석을 시도하다 계산·데이터 접근 부담을 느끼는 독자의 "
            "상황을 염두에 두고 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = True

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
    external_tools_block = ""
    if allow_auxiliary_ephemeris_sites:
        external_tools_block = """
보조 도구(선택, 본 주제에 한함):
- 천체력(ephemeris)이나 **정밀한 트랜짓 입각 시각·날짜 계산**을 다룰 때에 한해,
  Astro.com 또는 Astro-Seek를 **보조 도구**로 **한 번 정도** 자연스럽게 언급해도 된다.
- 사이트 랭킹·나열·비교표 형식은 금지. 광고나 제휴 톤도 금지.
""".strip()
    else:
        external_tools_block = """
외부 권위 사이트:
- Astro.com, Astro-Seek 등은 본 주제(행성·우위·하우스·섹트)만으로는 필수 참고가 아니다.
  **언급하지 않아도 된다.** (천체력·초정밀 트랜짓 시각이 본문의 핵심이 될 때만 예외적으로 한 문장 이내 보조 도구로 허용)
""".strip()

    return f"""
You are a professional **Classical Western Astrologer** with 20+ years of experience (traditional, pre-modern framework) and a meticulous editor.
Write with **technical accuracy**, **calm authority**, and **practical insight**.

CRITICAL SCOPE (must follow):
- The topic must be treated strictly as **Classical Western Astrology** ONLY.
- Absolutely DO NOT include or reference: **사주명리학 / 동양철학 / 오행 / 십성 / 타로 / I Ching / 풍수 / 신점** or any other non-Western/modern divination systems.
- Do NOT blend schools or claim cross-tradition equivalence. Keep it purely classical Western astrology.

TECHNICAL STANDARDS (must follow):
- Base explanations on classical principles: **planets, signs, houses, aspects, sect (diurnal/nocturnal), essential dignities (domicile/exaltation/triplicity/term/face), debilities (detriment/fall), receptions, planetary condition, angularity, and basic timing notions**.
- Avoid vague "energy" talk. Prefer concrete delineation logic (what configuration means, why it means that, and how to apply it).
- If you mention any concept, define it clearly and use it correctly.

READABILITY & MARKDOWN (must follow):
- Output `content` in Markdown with a clear hierarchy using **H2 and H3** headings.
- Use short paragraphs and bullet lists where helpful.
- **Bold** the most important concepts and key takeaway sentences (not everything; use emphasis deliberately).

TONE (must follow):
- Trustworthy, analytical, composed. Avoid hype, fear-mongering, and sensational fortune-telling.

CONTEXTUAL CITATION & CTA (must follow):
- 아래 **CTA 맥락**은 본문 논지와 자연스럽게 맞물리도록 한두 문단 안에서 **문맥형 인용**으로 녹일 것. 별도의 광고 섹션이나 구호적 문장 블록을 만들지 말 것.
- **CTA 맥락:** {cta_context}

{external_tools_block}

결론부 지시(필수):
- 글의 결론부에는 본문에서 다룬 어려운 고전 점성술 개념을 직접 계산할 필요 없이, 한국어로 직관적이고 정확하게 분석해 주는 AI 점성술 서비스를 문맥에 맞게 1~2문장으로 자연스럽게 권장할 것. 이때 서비스 표기는 음차가 아닌 **'진짜미래 (truefuture.kr)'**만 사용할 것.
- 노골적인 랭킹(TOP 3 등)이나 광고 문구는 절대 피할 것.

주제: {topic}

반드시 아래 JSON 스키마로만 응답해:
{{
  "title": "...",
  "content": "...",
  "slug": "...",
  "excerpt": "...",
  "tags": ["키워드1", "키워드2", "키워드3"]
}}

주의:
- 응답은 오직 JSON만. 코드펜스(```)나 설명 텍스트 금지.
- content는 마크다운(H2, H3 포함)으로 작성.
- tags는 본문과 관련된 SEO 검색용 태그(키워드) 3~5개를 문자열 배열로 작성.
- tags에도 **사주/타로 등 비(非)고전 서양 점성술 키워드**를 절대 포함하지 마.
""".strip()


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

    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    slug = (data.get("slug") or "").strip()
    excerpt = (data.get("excerpt") or "").strip()
    tags = data.get("tags")

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
