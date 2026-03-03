"""
진짜미래(True Future) - 탈퇴/재가입 어뷰징 방지용 식별 해시 유틸

- 이메일 가입: 이메일 소문자/공백 제거 후 SHA-256 해시(hex)
- 소셜 가입(카카오/구글 등): "provider:provider_id" 문자열 SHA-256 해시(hex)
- Supabase auth.users / auth.identities 데이터와 동일 규칙으로 해시 생성
"""

from __future__ import annotations

import hashlib
from typing import Any


def hash_email(email: str) -> str:
    """
    이메일 가입자용 식별 해시.
    이메일을 소문자·공백 제거 후 SHA-256 hex 반환.
    """
    if not email or not isinstance(email, str):
        raise ValueError("email must be a non-empty string")
    payload = email.lower().strip()
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def hash_provider_id(provider: str, provider_id: str) -> str:
    """
    소셜 가입자용 식별 해시.
    "provider:provider_id" (예: kakao:123456789) 형태를 SHA-256 hex로 반환.
    """
    if not provider or not isinstance(provider, str):
        raise ValueError("provider must be a non-empty string")
    if provider_id is None:
        provider_id = ""
    if not isinstance(provider_id, str):
        provider_id = str(provider_id)
    payload = provider.strip() + ":" + provider_id.strip()
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def compute_identity_hash(
    *,
    email: str | None = None,
    provider: str | None = None,
    provider_id: str | None = None,
) -> str:
    """
    가입 유형에 맞게 식별 해시를 계산합니다.

    - provider/provider_id가 있고, provider가 'email', 'phone'이 아니면
      → provider:provider_id 로 해시 (소셜)
    - 그 외 이메일이 있으면
      → 이메일 소문자/공백 제거 후 해시 (이메일 가입)
    - 둘 다 없으면 ValueError

    Kwargs:
        email: auth.users.email 또는 identity_data의 이메일
        provider: auth.identities.provider (예: kakao, google, email)
        provider_id: auth.identities.identity_data->>'id' 또는 'sub', 'provider_id' 등

    Returns:
        SHA-256 해시 문자열 (hex)
    """
    # 소셜: provider + provider_id 우선 (이메일만 있는 소셜도 provider_id 있음)
    if provider and provider.strip().lower() not in ("email", "phone"):
        pid = (provider_id or "").strip() if provider_id is not None else ""
        return hash_provider_id(provider.strip(), pid)

    # 이메일 가입
    if email and str(email).strip():
        return hash_email(str(email).strip())

    raise ValueError(
        "identity could not be determined: provide (email) or (provider + provider_id) for social"
    )


def compute_identity_hash_from_supabase_user(user: dict[str, Any]) -> str:
    """
    Supabase auth user 객체 또는 auth.admin.getUserById 응답에서 식별 해시 계산.

    user: auth.users 행 또는 JS get user 응답 (id, email, identities 등)
    identities: list of { provider, id } 또는 identity_data 포함 객체
    """
    identities = user.get("identities") or []
    email = user.get("email") or ""

    # 소셜 identity 우선 (provider가 email/phone이 아닌 것)
    for ident in identities:
        if not ident:
            continue
        prov = (ident.get("provider") or "").strip().lower()
        if prov in ("email", "phone", ""):
            continue
        pid = ident.get("provider_id") or ident.get("id") or ""
        if ident.get("identity_data"):
            id_data = ident["identity_data"]
            if isinstance(id_data, dict):
                pid = id_data.get("provider_id") or id_data.get("id") or id_data.get("sub") or pid
        if prov and (pid or email):
            return hash_provider_id(prov, str(pid) if pid else "")

    if email:
        return hash_email(email)

    raise ValueError(
        "could not compute identity_hash: user has no identities and no email"
    )
