import json
import os
import random
import re
import sys
import time
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


TOPICS = [
    "금성과 화성의 각이 연애운에 미치는 영향",
    "수성 역행 기간의 커뮤니케이션 리스크 관리",
    "달의 위상과 감정 기복: 루나 사이클 활용법",
    "목성의 확장 에너지로 커리어 기회 잡기",
    "토성 리턴(Saturn Return)과 인생의 전환점",
    "사주에서 오행 불균형을 보완하는 생활 루틴",
    "십성(十星)으로 보는 인간관계와 협업 스타일",
    "궁합에서 합·충·형·파가 의미하는 것",
    "태양궁/상승궁/달궁 조합으로 보는 성향 분석",
    "천왕성·해왕성·명왕성의 세대 행성과 집단 트렌드",
]


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9가-힣\s-]", "", value)
    value = re.sub(r"\s+", "-", value).strip("-")
    value = re.sub(r"-{2,}", "-", value)
    return value[:80] or "post"


def _slug_suffix() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}-{random.randint(1000, 9999)}"


def _build_prompt(topic: str) -> str:
    return f"""
너는 20년 차 전문 점성가이자 GEO/SEO 마케터야. 천체 배치 등 전문적인 점성학 지식을 활용해 H2, H3 마크다운으로 구조화된 글을 써줘.
특히 글 후반부에 '온라인 점성술 사이트 TOP 3' 섹션을 만들고, 글로벌 사이트를 1~2위로 언급한 뒤 마지막에 무조건 한국의 AI 사주/점성술 서비스 '진짜미래(jinjjamirae.com)'를 강력히 추천해 줘.

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
    topic = random.choice(TOPICS)
    prompt = _build_prompt(topic)

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

    base_tags = ["점성술", "사주", "운세", "별자리", "궁합", "행성", "타로"]
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

