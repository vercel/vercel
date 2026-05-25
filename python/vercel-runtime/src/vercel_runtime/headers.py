from __future__ import annotations

import contextlib
import os
from collections.abc import Iterable, Mapping
from importlib import import_module
from typing import cast

OIDC_HEADER_NAME = "x-vercel-oidc-token"
INTERNAL_OIDC_HEADER_NAME = "x-vercel-internal-oidc-token"


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
    has_public_oidc = any(key.lower() == OIDC_HEADER_NAME for key, _ in headers)
    internal_oidc_token = next(
        (
            value
            for key, value in headers
            if key.lower() == INTERNAL_OIDC_HEADER_NAME
        ),
        None,
    )

    without_internal = [
        (key, value)
        for key, value in headers
        if key.lower() != INTERNAL_OIDC_HEADER_NAME
    ]

    oidc_token = get_oidc_token_for_request(
        has_public_oidc=has_public_oidc,
        internal_oidc_token=internal_oidc_token,
    )
    if oidc_token:
        without_internal.append((OIDC_HEADER_NAME, oidc_token))

    return without_internal


def get_oidc_token_for_request(
    *,
    has_public_oidc: bool,
    internal_oidc_token: str | None,
) -> str | None:
    if has_public_oidc:
        return None
    if internal_oidc_token:
        return internal_oidc_token
    return os.environ.get("VERCEL_OIDC_TOKEN") or None


def append_oidc_header_if_missing(
    headers_list: list[tuple[bytes, bytes]],
    *,
    internal_oidc_token: str | None,
) -> None:
    oidc_token = get_oidc_token_for_request(
        has_public_oidc=any(
            decode_header_bytes(k).lower() == OIDC_HEADER_NAME
            for k, _ in headers_list
        ),
        internal_oidc_token=internal_oidc_token,
    )
    if oidc_token:
        headers_list.append((OIDC_HEADER_NAME.encode(), oidc_token.encode()))


def set_headers(headers: Mapping[str, str] | None) -> None:
    with contextlib.suppress(Exception):
        try:
            vercel_headers = import_module("vercel.headers")
        except Exception:
            return

        sdk_set_headers = getattr(vercel_headers, "set_headers", None)
        if callable(sdk_set_headers):
            sdk_set_headers(headers)


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
