"""Minimal stand-in for the vercel SDK's header context (test fixture).

The runtime calls ``vercel.headers.set_headers()`` to publish a request's
headers into a contextvar; this stub mirrors that contract so a fixture app can
read the OIDC token back the way the real SDK does.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping

_headers: ContextVar[Mapping[str, str] | None] = ContextVar(
    "vercel_headers", default=None
)


def set_headers(headers: Mapping[str, str] | None) -> None:
    _headers.set(headers)


def get_headers() -> Mapping[str, str] | None:
    return _headers.get()
