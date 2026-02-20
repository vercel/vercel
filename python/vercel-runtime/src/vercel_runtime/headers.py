from __future__ import annotations

import contextlib
from collections.abc import Iterable, Mapping
from contextvars import ContextVar
from typing import cast

_cv_headers: ContextVar[Mapping[str, str] | None] = ContextVar(
    "vercel_runtime_headers",
    default=None,
)


def _iter_header_items(headers: object) -> list[tuple[object, object]]:
    if isinstance(headers, Mapping):
        mapping_headers = cast("Mapping[object, object]", headers)
        return list(mapping_headers.items())

    items = getattr(headers, "items", None)
    if callable(items):
        with contextlib.suppress(Exception):
            return list(cast("Iterable[tuple[object, object]]", items()))

    return []


def set_headers(headers: Mapping[str, str] | None) -> None:
    _ = _cv_headers.set(headers)


def get_headers() -> Mapping[str, str] | None:
    return _cv_headers.get()


def decode_header_bytes(value: bytes) -> str:
    try:
        return value.decode()
    except Exception:
        return ""


def set_vercel_headers_from_asgi_pairs(
    headers_list: list[tuple[bytes, bytes]],
) -> None:
    normalized: dict[str, str] = {}
    for key_bytes, value_bytes in headers_list:
        key = decode_header_bytes(key_bytes).lower()
        if not key:
            continue
        value = decode_header_bytes(value_bytes)
        normalized[key] = value

    set_headers(normalized if normalized else None)


def set_vercel_headers_from_http_headers(
    headers: object,
) -> None:
    normalized: dict[str, str] = {}
    for key, value in _iter_header_items(headers):
        if key is None or value is None:
            continue
        normalized[str(key).lower()] = str(value)

    set_headers(normalized if normalized else None)


def clear_vercel_headers_context() -> None:
    set_headers(None)


def normalize_event_headers(
    raw_headers: object,
) -> dict[str, str]:
    normalized: dict[str, str] = {}
    if isinstance(raw_headers, Mapping):
        typed_headers = cast("Mapping[object, object]", raw_headers)
        for key, value in typed_headers.items():
            if key is None or value is None:
                continue
            if isinstance(value, list):
                value_list = cast("list[object]", value)
                if not value_list:
                    continue
                normalized[str(key)] = str(value_list[0])
            else:
                normalized[str(key)] = str(value)

    has_public_oidc = any(
        k.lower() == "x-vercel-oidc-token" for k in normalized
    )
    internal_oidc_key = next(
        (k for k in normalized if k.lower() == "x-vercel-internal-oidc-token"),
        None,
    )
    if not has_public_oidc and internal_oidc_key:
        normalized["x-vercel-oidc-token"] = normalized[internal_oidc_key]

    for key in [
        k for k in normalized if k.lower() == "x-vercel-internal-oidc-token"
    ]:
        del normalized[key]

    return normalized
