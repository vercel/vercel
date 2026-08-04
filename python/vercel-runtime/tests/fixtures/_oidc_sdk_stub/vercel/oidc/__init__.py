"""Minimal stand-in for ``vercel.oidc.get_vercel_oidc_token`` (test fixture).

Resolves the OIDC token the way the real SDK does: the per-request
``x-vercel-oidc-token`` header (published into the context by the runtime),
falling back to the ``VERCEL_OIDC_TOKEN`` env var.
"""

from __future__ import annotations

import os

from vercel.headers import get_headers


def get_vercel_oidc_token() -> str:
    headers = get_headers() or {}
    token = headers.get("x-vercel-oidc-token")
    if token:
        return token
    return os.environ.get("VERCEL_OIDC_TOKEN", "")
