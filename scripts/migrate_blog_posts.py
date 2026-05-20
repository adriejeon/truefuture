"""기존 블로그 글 본문에 신규 sanitize/normalize 후처리를 적용한다.

기본은 dry-run 모드. 변경될 행 개수와 슬러그를 출력만 하고 DB에는 손대지 않는다.
실제 반영하려면 `--apply` 옵션을 붙여서 실행.

사용 예:
  python scripts/migrate_blog_posts.py            # dry-run, 전체
  python scripts/migrate_blog_posts.py --limit 5  # dry-run, 앞 5개만
  python scripts/migrate_blog_posts.py --apply    # 실제 업데이트

환경변수:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto_blog.py와 동일)
  CLOUDFLARE_DEPLOY_HOOK_URL (옵션, --apply 후 배포 트리거)
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from difflib import unified_diff

from supabase import create_client

from auto_blog import (
    _normalize_paragraph_breaks,
    _sanitize_markdown,
    _trigger_cloudflare_hook,
)


def _clean_title(raw: str) -> str:
    title = re.sub(r"\*\*(.+?)\*\*", r"\1", raw or "", flags=re.DOTALL)
    return re.sub(r"[*_]", "", title).strip()


def _clean_excerpt(raw: str) -> str:
    excerpt = re.sub(r"\*\*(.+?)\*\*", r"\1", raw or "", flags=re.DOTALL)
    return re.sub(r"[*_`#>]+", "", excerpt).strip()


def _clean_content(raw: str) -> str:
    return _normalize_paragraph_breaks(_sanitize_markdown(raw or ""))


def _short_diff(old: str, new: str, label: str, context: int = 1) -> str:
    diff = unified_diff(
        old.splitlines(),
        new.splitlines(),
        fromfile=f"{label}.old",
        tofile=f"{label}.new",
        lineterm="",
        n=context,
    )
    return "\n".join(diff)


def fetch_all_posts(sb) -> list[dict]:
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        res = (
            sb.table("posts")
            .select("id, slug, title, content, excerpt")
            .order("created_at", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Sanitize/normalize existing blog posts.")
    parser.add_argument("--apply", action="store_true", help="실제 DB 업데이트(미지정 시 dry-run)")
    parser.add_argument("--limit", type=int, default=0, help="처리할 행 수 제한(0=전체)")
    parser.add_argument("--show-diff", action="store_true", help="변경된 행마다 unified diff 출력")
    parser.add_argument(
        "--trigger-deploy",
        action="store_true",
        help="--apply 성공 후 CLOUDFLARE_DEPLOY_HOOK_URL을 호출",
    )
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        print("환경변수 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.", file=sys.stderr)
        return 1

    sb = create_client(supabase_url, service_role_key)
    posts = fetch_all_posts(sb)
    if args.limit > 0:
        posts = posts[: args.limit]

    print(f"[migrate] 대상 글: {len(posts)}개 (apply={args.apply})")

    changed = 0
    failed = 0
    unchanged = 0

    for post in posts:
        post_id = post.get("id")
        slug = post.get("slug") or "(no-slug)"
        old_title = post.get("title") or ""
        old_content = post.get("content") or ""
        old_excerpt = post.get("excerpt") or ""

        new_title = _clean_title(old_title)
        new_content = _clean_content(old_content)
        new_excerpt = _clean_excerpt(old_excerpt)

        title_changed = new_title != old_title
        content_changed = new_content != old_content
        excerpt_changed = new_excerpt != old_excerpt

        if not (title_changed or content_changed or excerpt_changed):
            unchanged += 1
            continue

        changed += 1
        marks = []
        if title_changed:
            marks.append("title")
        if content_changed:
            marks.append("content")
        if excerpt_changed:
            marks.append("excerpt")
        print(f"  - {slug} :: 변경필드={','.join(marks)}")

        if args.show_diff and content_changed:
            diff_text = _short_diff(old_content, new_content, "content", context=1)
            if diff_text:
                print(diff_text)
                print()

        if not args.apply:
            continue

        update_payload = {}
        if title_changed:
            update_payload["title"] = new_title
        if content_changed:
            update_payload["content"] = new_content
        if excerpt_changed:
            update_payload["excerpt"] = new_excerpt

        try:
            sb.table("posts").update(update_payload).eq("id", post_id).execute()
        except Exception as e:
            failed += 1
            print(f"    ! update 실패 ({slug}): {e}", file=sys.stderr)

    print()
    print(f"[migrate] 요약: 변경 {changed} / 무변경 {unchanged} / 실패 {failed}")

    if args.apply and args.trigger_deploy and changed > 0 and failed == 0:
        hook = os.getenv("CLOUDFLARE_DEPLOY_HOOK_URL")
        if hook:
            print("[migrate] Cloudflare deploy hook 호출")
            _trigger_cloudflare_hook(hook)
        else:
            print("[migrate] CLOUDFLARE_DEPLOY_HOOK_URL 미설정 — 배포 훅 건너뜀")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
