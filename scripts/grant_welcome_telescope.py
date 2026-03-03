"""
진짜미래(True Future) - 신규 가입 무료 망원경(쿠폰) 1개 지급

- 발급일(가입일) 기준 90일 후 만료(expiration_date) 적용
- Supabase public.user_wallets, public.star_transactions 스키마에 맞춰 INSERT
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경 변수 필요 (.env 또는 .dev.vars 참고)
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import UUID

# 프로젝트 루트를 path에 추가
_project_root = Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

# .dev.vars 또는 .env 로드
_dotenv_paths = [
    _project_root / ".dev.vars",
    _project_root / ".env",
    _project_root / "supabase" / ".env.local",
]
for _p in _dotenv_paths:
    if _p.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(_p)
            break
        except ImportError:
            pass


def _get_supabase_client():
    """Supabase 서비스 롤 클라이언트 생성 (RLS 우회)."""
    try:
        from supabase import create_client
    except ImportError:
        raise ImportError(
            "supabase 패키지가 필요합니다. 설치: pip install supabase"
        )
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError(
            "환경 변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. "
            ".env 또는 .dev.vars 에 설정하세요."
        )
    return create_client(url, key)


def grant_welcome_telescope(user_id: str | UUID) -> dict:
    """
    신규 가입 유저에게 무료 망원경(일반 운세권) 1개 지급.

    - user_wallets: 해당 user_id에 paid_stars +1 (없으면 1로 생성)
    - star_transactions: CHARGE 1건 기록, expires_at = 발급일 + 90일

    Args:
        user_id: auth.users.id (UUID 문자열 또는 UUID)

    Returns:
        {"success": True, "paid_stars": 1, "expires_at": "..."} 또는
        {"success": False, "error": "..."}
    """
    uid = str(user_id) if isinstance(user_id, UUID) else user_id
    try:
        UUID(uid)
    except (ValueError, TypeError):
        return {"success": False, "error": f"유효하지 않은 user_id: {user_id}"}

    supabase = _get_supabase_client()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=90)
    expires_at_iso = expires_at.isoformat()

    # 1) 이미 신규 가입 무료 지급 이력이 있는지 확인 (중복 지급 방지)
    existing = (
        supabase.table("star_transactions")
        .select("id")
        .eq("user_id", uid)
        .eq("type", "CHARGE")
        .eq("description", "신규 가입 무료 망원경 1개")
        .execute()
    )
    if existing.data and len(existing.data) > 0:
        return {
            "success": False,
            "error": "이미 신규 가입 무료 망원경이 지급된 사용자입니다.",
        }

    # 2) user_wallets 조회 후 upsert
    wallet_res = (
        supabase.table("user_wallets")
        .select("paid_stars, bonus_stars")
        .eq("user_id", uid)
        .execute()
    )
    current_paid = 0
    current_bonus = 0
    if wallet_res.data and len(wallet_res.data) > 0:
        row = wallet_res.data[0]
        current_paid = int(row.get("paid_stars") or 0)
        current_bonus = int(row.get("bonus_stars") or 0)
    new_paid = current_paid + 1

    upsert_payload = {
        "user_id": uid,
        "paid_stars": new_paid,
        "bonus_stars": current_bonus,
        "updated_at": now.isoformat(),
    }
    supabase.table("user_wallets").upsert(
        upsert_payload,
        on_conflict="user_id",
    ).execute()

    # 3) star_transactions에 CHARGE 기록 (90일 만료)
    tx_payload = {
        "user_id": uid,
        "type": "CHARGE",
        "amount": 1,
        "description": "신규 가입 무료 망원경 1개",
        "related_item_id": "welcome_telescope",
        "paid_amount": 1,
        "bonus_amount": 0,
        "expires_at": expires_at_iso,
        "is_expired": False,
    }
    supabase.table("star_transactions").insert(tx_payload).execute()

    return {
        "success": True,
        "paid_stars": 1,
        "expires_at": expires_at_iso,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python grant_welcome_telescope.py <user_id>")
        sys.exit(1)
    user_id = sys.argv[1].strip()
    result = grant_welcome_telescope(user_id)
    if result.get("success"):
        print("OK:", result)
    else:
        print("ERROR:", result.get("error", result))
        sys.exit(1)


if __name__ == "__main__":
    main()
