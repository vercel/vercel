from __future__ import annotations

import contextlib
from collections.abc import Callable, Iterable, Mapping
from contextvars import ContextVar
from importlib import import_module
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


def _iter_event_header_pairs(
    raw_headers: object,
) -> list[tuple[str, str]]:
    normalized: list[tuple[str, str]] = []
    if not isinstance(raw_headers, Mapping):
        return normalized

    typed_headers = cast("Mapping[object, object]", raw_headers)
    for key, value in typed_headers.items():
        if key is None or value is None:
            continue

        key_str = str(key)
        if isinstance(value, list):
            value_list = cast("list[object]", value)
            for item in value_list:
                if item is None:
                    continue
                normalized.append((key_str, str(item)))
        else:
            normalized.append((key_str, str(value)))

    return normalized


def _normalize_internal_oidc_header(
    headers: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    has_public_oidc = any(
        key.lower() == "x-vercel-oidc-token" for key, _ in headers
    )
    internal_oidc_token = next(
        (
            value
            for key, value in headers
            if key.lower() == "x-vercel-internal-oidc-token"
        ),
        None,
    )

    without_internal = [
        (key, value)
        for key, value in headers
        if key.lower() != "x-vercel-internal-oidc-token"
    ]

    if not has_public_oidc and internal_oidc_token is not None:
        without_internal.append(("x-vercel-oidc-token", internal_oidc_token))

    return without_internal


def set_headers(headers: Mapping[str, str] | None) -> None:
    _ = _cv_headers.set(headers)
    with contextlib.suppress(Exception):
        from vercel.headers import set_headers as _set_vercel_sdk_headers
        _set_vercel_sdk_headers(headers)


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
    for key, value in normalize_event_header_pairs(raw_headers):
        normalized[key] = value
    return normalized


def normalize_event_header_pairs(
    raw_headers: object,
) -> list[tuple[str, str]]:
    normalized_pairs = _iter_event_header_pairs(raw_headers)
    return _normalize_internal_oidc_header(normalized_pairs)
