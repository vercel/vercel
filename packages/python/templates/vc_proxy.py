"""Adapt a configured Python proxy entrypoint into a routing middleware ASGI app."""

from __future__ import annotations

import importlib
import inspect
import os

_proxy_module_name = os.environ["__VC_PROXY_MODULE_NAME"]
_proxy_module = importlib.import_module(_proxy_module_name)
proxy = getattr(_proxy_module, "proxy")

if not callable(proxy):
    raise TypeError(
        f'The Python proxy entrypoint "{_proxy_module_name}:proxy" must be callable.'
    )

_starlette_middleware_app = None
_starlette_middleware_checked = False


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
                "headers": [(b"x-middleware-next", b"1")],
            }
        )
        await send({"type": "http.response.body", "body": b""})
    else:
        raise RuntimeError(
            f'Python Routing Middleware does not support ASGI scope type "{scope_type}".'
        )


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
            error.name != "starlette"
            and not error.name.startswith("starlette.")
        ):
            raise
        return None

    if not isinstance(proxy, Starlette):
        return None

    # FastAPI inherits from Starlette. Rebuild only the middleware explicitly
    # registered by the user, replacing the framework router with Vercel's
    # routing continuation response.
    middleware_app = _continue_routing
    for middleware in reversed(proxy.user_middleware):
        middleware_app = middleware.cls(
            middleware_app,
            *middleware.args,
            **middleware.kwargs,
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
    starlette_middleware_app = _get_starlette_middleware_app()
    if starlette_middleware_app is not None:
        if scope_type == "lifespan":
            # Let FastAPI/Starlette initialize app.state and lifespan context.
            return await proxy(scope, receive, send)
        if scope_type != "http":
            return await _continue_routing(scope, receive, send)

        middleware_scope = dict(scope)
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

    request = Request(scope, receive=receive)
    response = proxy(request)
    if inspect.isawaitable(response):
        response = await response

    if response is None:
        return await _continue_routing(scope, receive, send)

    if not callable(response):
        raise TypeError(
            "The Python proxy function must return an ASGI response or None."
        )

    return await response(scope, receive, send)
