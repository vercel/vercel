"""Adapt a configured Python proxy entrypoint into a routing middleware ASGI app."""

from __future__ import annotations

import importlib
import inspect
import json
import os
from urllib.parse import quote, quote_from_bytes

_proxy_module_name = os.environ["__VC_PROXY_MODULE_NAME"]
_proxy_variable_name = os.environ.get("__VC_PROXY_VARIABLE_NAME", "proxy")
_proxy_module = importlib.import_module(_proxy_module_name)
proxy = getattr(_proxy_module, _proxy_variable_name)
_fastapi_frontend_auto = os.environ.get("__VC_FASTAPI_FRONTEND_AUTO") == "1"
_fastapi_frontend_paths = frozenset()
if _fastapi_frontend_auto:
    with open(os.path.join(os.path.dirname(__file__), "vc_fastapi_frontend.json")) as f:
        _fastapi_frontend_paths = frozenset(json.load(f)["requestPaths"])

if not callable(proxy):
    raise TypeError(
        f'The Python proxy entrypoint "{_proxy_module_name}:{_proxy_variable_name}" '
        "must be callable."
    )

_starlette_middleware_app = None
_starlette_middleware_checked = False
_original_path_scope_key = "vercel.proxy.original_path"
_original_query_string_scope_key = "vercel.proxy.original_query_string"


def _set_original_url(scope):
    scope[_original_path_scope_key] = scope.get("path", "")
    scope[_original_query_string_scope_key] = scope.get("query_string", b"")


def _routing_header(scope):
    original_path = scope.get(_original_path_scope_key, scope.get("path", ""))
    original_query_string = scope.get(
        _original_query_string_scope_key,
        scope.get("query_string", b""),
    )
    path = scope.get("path", "")
    query_string = scope.get("query_string", b"")

    if path == original_path and query_string == original_query_string:
        return b"x-middleware-next", b"1"

    if not isinstance(path, str) or not path.startswith("/"):
        raise ValueError(
            'request.scope["path"] must be an origin-form path starting with "/"'
        )

    destination = quote(path, safe="/%:@!$&'()*+,;=-._~")
    if query_string:
        destination += "?" + quote_from_bytes(
            query_string,
            safe="/%:@!$&'()*+,;=-._~?",
        )
    return b"x-middleware-rewrite", destination.encode("ascii")


async def _continue_routing(scope, receive, send):
    scope_type = scope.get("type")
    if scope_type == "lifespan":
        while True:
            message = await receive()
            message_type = message.get("type")
            if message_type == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message_type == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return
    elif scope_type == "http":
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [_routing_header(scope)],
            }
        )
        await send({"type": "http.response.body", "body": b""})
    else:
        raise RuntimeError(
            f'Python Routing Middleware does not support ASGI scope type "{scope_type}".'
        )


def _update_scope(scope, child_scope):
    fastapi_child_scope = child_scope.get("fastapi")
    for key, value in child_scope.items():
        if key != "fastapi":
            scope[key] = value
    if isinstance(fastapi_child_scope, dict):
        fastapi_scope = scope.setdefault("fastapi", {})
        if isinstance(fastapi_scope, dict):
            fastapi_scope.update(fastapi_child_scope)


async def _continue_fastapi_frontend(scope, receive, send):
    """Run the dependencies for the concrete app.frontend() selection."""
    router = proxy.router
    match, child_scope, low_priority_route, effective_context = (
        router._match_low_priority(scope)
    )
    try:
        from starlette.routing import Match
    except ImportError:
        return await _continue_routing(scope, receive, send)

    if match == Match.NONE or low_priority_route is None:
        return await _continue_routing(scope, receive, send)

    _update_scope(scope, child_scope)
    group = getattr(effective_context, "original_route", low_priority_route)
    prefix = getattr(effective_context, "frontend_prefix", "")
    match_group = getattr(group, "_match", None)
    if not callable(match_group):
        return await _continue_routing(scope, receive, send)

    group_match, group_scope, route = match_group(scope, prefix=prefix)
    if group_match == Match.NONE or route is None:
        return await _continue_routing(scope, receive, send)
    _update_scope(scope, group_scope)
    if group_match == Match.PARTIAL:
        from starlette.exceptions import HTTPException

        raise HTTPException(status_code=405)

    if effective_context is not None:
        fastapi_scope = scope.setdefault("fastapi", {})
        if isinstance(fastapi_scope, dict):
            fastapi_scope["effective_route_context"] = effective_context
        dependant = effective_context.dependant
        dependency_overrides_provider = effective_context.dependency_overrides_provider
        embed_body_fields = effective_context._embed_body_fields
    else:
        dependant = group.dependant
        dependency_overrides_provider = group.dependency_overrides_provider
        embed_body_fields = group._embed_body_fields

    if dependant and dependant.dependencies:
        async with group._solve_dependencies(
            scope,
            receive,
            send,
            dependant=dependant,
            dependency_overrides_provider=dependency_overrides_provider,
            embed_body_fields=embed_body_fields,
        ):
            return await _continue_routing(scope, receive, send)
    return await _continue_routing(scope, receive, send)


def _get_starlette_middleware_app():
    global _starlette_middleware_app
    global _starlette_middleware_checked

    if _starlette_middleware_checked:
        return _starlette_middleware_app

    _starlette_middleware_checked = True
    try:
        from starlette.applications import Starlette
    except ModuleNotFoundError as error:
        if not error.name or (
            error.name != "starlette" and not error.name.startswith("starlette.")
        ):
            raise
        return None

    if not isinstance(proxy, Starlette):
        return None

    # FastAPI inherits from Starlette. Rebuild only the middleware explicitly
    # registered by the user, replacing the framework router with Vercel's
    # routing continuation response.
    middleware_app = (
        _continue_fastapi_frontend if _fastapi_frontend_auto else _continue_routing
    )
    if _fastapi_frontend_auto:
        from starlette.middleware.exceptions import ExceptionMiddleware

        exception_handlers = {
            key: value
            for key, value in proxy.exception_handlers.items()
            if key not in (500, Exception)
        }
        middleware_app = ExceptionMiddleware(
            middleware_app,
            handlers=exception_handlers,
            debug=proxy.debug,
        )
    for middleware in reversed(proxy.user_middleware):
        middleware_app = middleware.cls(
            middleware_app,
            *middleware.args,
            **middleware.kwargs,
        )
    if _fastapi_frontend_auto:
        from starlette.middleware.errors import ServerErrorMiddleware

        error_handler = proxy.exception_handlers.get(
            500, proxy.exception_handlers.get(Exception)
        )
        middleware_app = ServerErrorMiddleware(
            middleware_app,
            handler=error_handler,
            debug=proxy.debug,
        )

    _starlette_middleware_app = middleware_app
    return _starlette_middleware_app


async def app(scope, receive, send):
    # ``vercel.proxy.Proxy`` is already a complete ASGI application. Its
    # terminal response implements the Vercel routing continuation protocol,
    # so it must receive the original ASGI arguments rather than a Request.
    if getattr(proxy, "__vercel_proxy__", False):
        return await proxy(scope, receive, send)

    scope_type = scope.get("type")
    if _fastapi_frontend_auto:
        if scope_type == "lifespan":
            # Importing the app is required to reuse its middleware and route
            # graph, but the main application's lifespan belongs to the server
            # function and must not run a second time in Routing Middleware.
            return await _continue_routing(scope, receive, send)
        if scope_type != "http" or scope.get("path") not in _fastapi_frontend_paths:
            return await _continue_routing(scope, receive, send)

    starlette_middleware_app = _get_starlette_middleware_app()
    if starlette_middleware_app is not None:
        if scope_type == "lifespan":
            # Let FastAPI/Starlette initialize app.state and lifespan context.
            return await proxy(scope, receive, send)
        if scope_type != "http":
            return await _continue_routing(scope, receive, send)

        middleware_scope = dict(scope)
        _set_original_url(middleware_scope)
        middleware_scope["app"] = proxy
        return await starlette_middleware_app(
            middleware_scope,
            receive,
            send,
        )

    if scope_type != "http":
        return await _continue_routing(scope, receive, send)

    try:
        from starlette.requests import Request
    except ImportError as error:
        raise RuntimeError(
            "Python Routing Middleware requires Starlette. Add `starlette` or "
            "`vercel-proxy` to the `proxy` dependency group in pyproject.toml."
        ) from error

    request_scope = dict(scope)
    _set_original_url(request_scope)
    request = Request(request_scope, receive=receive)
    response = proxy(request)
    if inspect.isawaitable(response):
        response = await response

    if response is None:
        return await _continue_routing(request_scope, receive, send)

    if not callable(response):
        raise TypeError(
            "The Python proxy function must return an ASGI response or None."
        )

    return await response(request_scope, receive, send)
