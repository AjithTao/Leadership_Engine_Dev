"""Small environment-backed login provider for hosted proof-of-concept deployments."""

from __future__ import annotations

import hmac
import os
from typing import Dict, Optional


def local_auth_enabled() -> bool:
    return os.getenv("AUTH_MODE", "ldap").strip().lower() == "local"


def authenticate_local_user(username: str, password: str) -> Optional[Dict[str, str]]:
    """Validate the single hosted admin without storing credentials in the repository."""
    configured_username = os.getenv("APP_ADMIN_USERNAME", "").strip()
    configured_password = os.getenv("APP_ADMIN_PASSWORD", "")
    if not configured_username or not configured_password:
        raise RuntimeError(
            "Local authentication is enabled but APP_ADMIN_USERNAME or APP_ADMIN_PASSWORD is missing."
        )

    username_matches = hmac.compare_digest(username.strip(), configured_username)
    password_matches = hmac.compare_digest(password, configured_password)
    if not (username_matches and password_matches):
        return None

    return {
        "username": configured_username,
        "email": os.getenv("APP_ADMIN_EMAIL", f"{configured_username}@tao.local").strip(),
        "role": "admin",
    }
