from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlsplit


def normalize_service_route_prefix(raw_prefix: str | None) -> str:
    """
    Normalize a configured service prefix into canonical mount-path form.

    Returns an empty string when unset/blank/root ("/"), otherwise:
      - always starts with "/"
      - has no trailing slash
    """
    if not raw_prefix:
        return ""

    prefix = raw_prefix.strip()
    if not prefix:
        return ""

    if not prefix.startswith("/"):
        prefix = f"/{prefix}"

    # Treat "/" as an unset mount prefix.
    return "" if prefix == "/" else prefix.rstrip("/")


def is_service_route_prefix_strip_enabled() -> bool:
    raw = os.environ.get("VERCEL_SERVICE_ROUTE_PREFIX_STRIP")
    if not raw:
        return False
    return raw.lower() in ("1", "true")


def get_service_route_prefix() -> str:
    if not is_service_route_prefix_strip_enabled():
        return ""

    return normalize_service_route_prefix(
        os.environ.get("VERCEL_SERVICE_ROUTE_PREFIX")
    )


_service_route_prefix = get_service_route_prefix()


def split_request_target(target: str) -> tuple[str, str]:
    """
    Split an HTTP request-target into (path, query).

    Supports:
      - origin-form: "/a/b?x=1"
      - absolute-form: "https://example.com/a/b?x=1"
      - asterisk-form: "*"
    """
    if not target:
        return "/", ""

    parsed = urlsplit(target)
    path = parsed.path
    query = parsed.query

    # Absolute-form request-target (RFC 7230 section 5.3.2).
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return path or "/", query

    # Asterisk-form request-target (RFC 7230 section 5.3.4).
    if path == "*":
        return "*", query

    if not path:
        path = "/"
    elif not path.startswith("/"):
        path = f"/{path}"

    return path, query


def strip_service_route_prefix(
    path: str, prefix: str | None = None
) -> tuple[str, str]:
    """
    Strip a service route prefix from a request path.

    Returns a tuple of:
      - stripped path passed to the user app
      - matched mount prefix (empty string when no prefix matched)

    When *prefix* is ``None`` (the default), reads the current value
    from ``get_service_route_prefix()``.

    Example with prefix "/_/backend":
      "/_/backend/ping" -> ("/ping", "/_/backend")
      "/foo"            -> ("/foo", "")
    """
    if prefix is None:
        prefix = _service_route_prefix

    if path == "*":
        return path, ""
    if not path:
        path = "/"
    elif not path.startswith("/"):
        path = f"/{path}"

    if not prefix:
        return path, ""

    if path == prefix:
        return "/", prefix

    if path.startswith(f"{prefix}/"):
        stripped = path[len(prefix) :]
        return stripped if stripped else "/", prefix

    return path, ""


def apply_service_route_prefix_to_asgi_scope(
    scope: dict[str, Any], prefix: str | None = None
) -> None:
    if prefix is None:
        prefix = _service_route_prefix

    if not prefix:
        return

    path = scope.get("path", "/") or "/"
    stripped_path, matched_prefix = strip_service_route_prefix(path, prefix)
    if not matched_prefix:
        return

    scope["path"] = stripped_path

    raw_path = scope.get("raw_path")
    if isinstance(raw_path, (bytes, bytearray)):
        try:
            decoded = bytes(raw_path).decode("utf-8", "surrogateescape")
            stripped_raw, _ = strip_service_route_prefix(decoded, prefix)
            scope["raw_path"] = stripped_raw.encode("utf-8", "surrogateescape")
        except Exception:
            pass

    existing_root = scope.get("root_path", "") or ""
    if existing_root and existing_root != "/":
        existing_root = existing_root.rstrip("/")
    else:
        existing_root = ""

    scope["root_path"] = f"{existing_root}{matched_prefix}"


def apply_service_route_prefix_to_target(
    target: str,
    prefix: str | None = None,
) -> tuple[str, str]:
    """
    Apply service-prefix stripping to a full request target.

    When *prefix* is ``None`` (the default), reads the current value
    from ``get_service_route_prefix()``.

    Returns:
      - updated request target (path + optional query)
      - matched mount prefix for framework metadata (or "")
    """
    if prefix is None:
        prefix = _service_route_prefix

    path, query = split_request_target(target)
    path, root_path = strip_service_route_prefix(path, prefix)
    if query:
        return f"{path}?{query}", root_path

    return path, root_path
