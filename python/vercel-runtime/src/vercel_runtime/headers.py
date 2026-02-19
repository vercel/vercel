from __future__ import annotations

import contextlib


def set_vercel_headers(headers: dict[str, str] | None) -> None:
    with contextlib.suppress(Exception):
        from vercel.headers import set_headers  # type: ignore[import-not-found]
        set_headers(headers)


def decode_header_bytes(value: bytes) -> str:
    try:
        return value.decode()
    except Exception:
        return ''


def set_vercel_headers_from_asgi_pairs(headers_list: list[tuple[bytes, bytes]]) -> None:
    normalized: dict[str, str] = {}
    for key_bytes, value_bytes in headers_list:
        key = decode_header_bytes(key_bytes).lower()
        if not key:
            continue
        value = decode_header_bytes(value_bytes)
        normalized[key] = value

    set_vercel_headers(normalized if normalized else None)


def set_vercel_headers_from_http_headers(headers: object) -> None:
    normalized: dict[str, str] = {}
    with contextlib.suppress(Exception):
        for key, value in headers.items():  # type: ignore[attr-defined]
            if not key:
                continue
            normalized[str(key).lower()] = str(value)

    set_vercel_headers(normalized if normalized else None)


def clear_vercel_headers_context() -> None:
    set_vercel_headers(None)


def normalize_event_headers(raw_headers: object) -> dict[str, str]:
    normalized: dict[str, str] = {}
    if isinstance(raw_headers, dict):
        for key, value in raw_headers.items():
            if key is None or value is None:
                continue
            if isinstance(value, list):
                if not value:
                    continue
                normalized[str(key)] = str(value[0])
            else:
                normalized[str(key)] = str(value)

    has_public_oidc = any(k.lower() == 'x-vercel-oidc-token' for k in normalized.keys())
    internal_oidc_key = next(
        (k for k in normalized.keys() if k.lower() == 'x-vercel-internal-oidc-token'),
        None,
    )
    if not has_public_oidc and internal_oidc_key:
        normalized['x-vercel-oidc-token'] = normalized[internal_oidc_key]

    for key in [k for k in normalized.keys() if k.lower() == 'x-vercel-internal-oidc-token']:
        del normalized[key]

    return normalized
