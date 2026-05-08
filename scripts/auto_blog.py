import json
import os
import random
import re
import sys
from datetime import datetime, timezone

import google.generativeai as genai
import requests
from supabase import create_client


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
    return value[:80] or f"post-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

def _slug_suffix() -> str:
    # 예: 20260508-1842-3812 (짧고 충돌 확률 낮게)
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y%m%d')}-{now.strftime('%H%M')}-{random.randint(1000, 9999)}"


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
    # 혹시라도 코드펜스가 섞이면 제거 시도
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except Exception:
        # 마지막 방어: 텍스트 내 첫 JSON 객체만 추출 시도
        m = re.search(r"\{[\s\S]*\}\s*$", t)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None


def generate_post(gemini_api_key: str) -> dict:
    genai.configure(api_key=gemini_api_key)

    topic = random.choice(TOPICS)
    prompt = _build_prompt(topic)

    model = genai.GenerativeModel("gemini-3.1-pro-preview")

    resp = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.9,
            max_output_tokens=10000,
        ),
    )

    text = getattr(resp, "text", None) or ""
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

    if not slug:
        slug = _slugify(title)
    else:
        slug = _slugify(slug)

    if not excerpt:
        excerpt = (re.sub(r"\s+", " ", re.sub(r"[#*_>`-]+", " ", content)).strip())[:160]

    if isinstance(tags, list):
        tags = [str(t).strip() for t in tags if str(t).strip()]
    else:
        tags = []

    # 3~5개 권장. 부족하면 최소 보정.
    base = ["점성술", "사주", "운세", "별자리", "궁합", "행성", "타로"]
    if len(tags) < 3:
        for t in base:
            if t not in tags:
                tags.append(t)
            if len(tags) >= 3:
                break
    tags = tags[:5]

    return {
        "title": title,
        "content": content,
        "slug": slug,
        "excerpt": excerpt,
        "tags": tags,
    }

def _trigger_cloudflare_hook(hook_url: str | None) -> None:
    if not hook_url:
        return
    try:
        requests.post(hook_url, timeout=15)
    except Exception:
        pass


def insert_post_to_supabase(supabase_url: str, service_role_key: str, post: dict) -> dict:
    sb = create_client(supabase_url, service_role_key)

    base_payload = {
        "title": post["title"],
        "content": post["content"],
        "excerpt": post["excerpt"],
        "tags": post.get("tags", []),
    }

    # slug 중복 대응: insert 실패(중복 등) 시 suffix 붙여 재시도 → 항상 "새 글"로 누적
    desired_slug = post.get("slug") or _slugify(post.get("title", ""))
    desired_slug = _slugify(desired_slug)

    last_err = None
    for attempt in range(6):
        slug = desired_slug if attempt == 0 else f"{desired_slug}-{_slug_suffix()}"
        payload = {
            **base_payload,
            "slug": slug,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            res = sb.table("posts").insert(payload).execute()
            return {"inserted": True, "data": getattr(res, "data", None), "slug": slug}
        except Exception as e:
            last_err = e
            # 다음 시도로 넘어감
            continue

    raise RuntimeError(f"Supabase insert 재시도 실패: {last_err}")


def main() -> int:
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
        msg = f"[auto_blog] 환경변수 누락: {', '.join(missing)}"
        print(msg, file=sys.stderr)
        return 0  # 워크플로우에서 실패로 간주하지 않도록 0 리턴

    try:
        post = generate_post(gemini_api_key)
        print(f"[auto_blog] generated slug={post.get('slug')} tags={post.get('tags')}")
    except Exception as e:
        msg = f"[auto_blog] Gemini 호출/파싱 실패: {e}"
        print(msg, file=sys.stderr)
        return 0

    try:
        result = insert_post_to_supabase(supabase_url, supabase_service_role_key, post)
        print(
            f"[auto_blog] inserted={result.get('inserted')} slug={result.get('slug')} rows={len(result.get('data') or [])}"
        )
        _trigger_cloudflare_hook(cloudflare_hook_url)
        return 0
    except Exception as e:
        msg = f"[auto_blog] Supabase insert 실패: {e}"
        print(msg, file=sys.stderr)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

