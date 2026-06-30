from __future__ import annotations

import contextlib
import json
from typing import TYPE_CHECKING, Any, Protocol, cast

from vercel_runtime.headers import decode_header_bytes

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping


# Needed to type HTTP-handler/WSGI paths
class _HeadersLike(Protocol):
    def items(self) -> Iterable[tuple[object, object]]: ...


_SC_HEADERS_NAME = "x-vercel-sc-headers"
_SC_HOST_NAME = "x-vercel-sc-host"
_SC_BASEPATH_NAME = "x-vercel-sc-basepath"
_SC_PROTOCOL_NAME = "x-vercel-sc-protocol"
_SC_RUNTIME_CACHE_NAME = "x-vercel-sc-runtime-cache"

# If this header is set, then we should strip some extra headers
# before passing them to the client code
SC_NO_HEADER_LEAK_HEADER: str = "x-vercel-sc-no-header-leak"

# Special cache headers that determine which cache should be used,
# in this case to tell the API to use the runtime cache
_SC_CLIENT_ORIGIN_NAME = "x-vercel-internal-sc-client-origin"
_SC_CLIENT_NAME_NAME = "x-vercel-internal-sc-client-name"
_SC_CLIENT_VALUE = "RUNTIME_CACHE"

# Headers always stripped
SC_HEADERS_ALWAYS_STRIP: frozenset[str] = frozenset({_SC_RUNTIME_CACHE_NAME})

# Headers stripped only when x-vercel-sc-no-header-leak is set
SC_HEADERS_STRIP_ON_NO_LEAK: frozenset[str] = frozenset(
    {
        _SC_HEADERS_NAME,
        _SC_HOST_NAME,
        _SC_BASEPATH_NAME,
        _SC_PROTOCOL_NAME,
        SC_NO_HEADER_LEAK_HEADER,
    }
)


def set_runtime_cache_from_asgi_pairs(
    headers_list: list[tuple[bytes, bytes]],
) -> None:
    _set_runtime_cache_from_pairs(
        (decode_header_bytes(k).lower(), decode_header_bytes(v))
        for k, v in headers_list
    )


def set_runtime_cache_from_http_headers(headers: _HeadersLike | None) -> None:
    if headers is None:
        return
    _set_runtime_cache_from_pairs(
        (str(k).lower(), str(v))
        for k, v in headers.items()
        if k is not None and v is not None
    )


def _set_runtime_cache_from_pairs(
    pairs: Iterable[tuple[str, str]],
) -> None:
    sc_headers_raw: str | None = None
    sc_host: str | None = None
    sc_basepath: str | None = None
    sc_protocol: str | None = None

    for key, value in pairs:
        if not key:
            continue
        if key == _SC_HEADERS_NAME:
            sc_headers_raw = value
        elif key == _SC_HOST_NAME:
            sc_host = value
        elif key == _SC_BASEPATH_NAME:
            sc_basepath = value
        elif key == _SC_PROTOCOL_NAME:
            sc_protocol = value

    _apply_cache_context(
        sc_headers_raw=sc_headers_raw,
        sc_host=sc_host,
        sc_basepath=sc_basepath,
        sc_protocol=sc_protocol,
    )


def _apply_cache_context(
    *,
    sc_headers_raw: str | None,
    sc_host: str | None,
    sc_basepath: str | None,
    sc_protocol: str | None,
) -> None:
    if not sc_headers_raw or not sc_host:
        return

    modules = _load_vercel_cache_modules()
    if modules is None:
        return
    cache_build, context = modules

    try:
        parsed = json.loads(sc_headers_raw)
    except (TypeError, ValueError):
        return
    if not isinstance(parsed, dict):
        return

    parsed_mapping = cast("Mapping[object, object]", parsed)
    headers: dict[str, str] = {
        str(k): str(v) for k, v in parsed_mapping.items()
    }
    headers[_SC_CLIENT_ORIGIN_NAME] = _SC_CLIENT_VALUE
    headers[_SC_CLIENT_NAME_NAME] = _SC_CLIENT_VALUE

    endpoint = _build_endpoint(
        host=sc_host,
        basepath=sc_basepath,
        protocol=sc_protocol,
    )

    # Build and try to inject both caches into the context,
    # so any request handler can use a cache
    sync_cache = cache_build.BuildCache(endpoint=endpoint, headers=headers)
    async_cache = cache_build.AsyncBuildCache(
        endpoint=endpoint,
        headers=headers,
    )

    try:
        context.set_context(cache=sync_cache, async_cache=async_cache)
    except TypeError:
        # For older `vercel` release (before 0.5.9) set only sync cache
        context.set_context(cache=sync_cache)


def clear_runtime_cache_context() -> None:
    modules = _load_vercel_cache_modules()
    if modules is None:
        return

    _, context = modules
    try:
        context.set_context(cache=None, async_cache=None)
    except TypeError:
        # Older `vercel` SDK without the async_cache kwarg.
        context.set_context(cache=None)


# We don't depend on `vercel` package directly, so
# use an optional import here. If we can import the modules -
# we'll configure caches, otherwise we skip the behaviour
def _load_vercel_cache_modules() -> Any | None:
    with contextlib.suppress(ImportError):
        import vercel.cache.cache_build as cache_build  # type: ignore[import-not-found]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]
        import vercel.cache.context as context  # type: ignore[import-not-found]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]

        return cache_build, context
    return None


def _build_endpoint(
    *,
    host: str,
    basepath: str | None,
    protocol: str | None,
) -> str:
    proto = protocol or "https"
    return f"{proto}://{host}{basepath or ''}/v1/suspense-cache/"
