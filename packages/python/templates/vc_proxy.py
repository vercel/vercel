"""Adapt a configured ``proxy.py`` function into a routing middleware ASGI app."""

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


async def app(scope, receive, send):
    if scope.get("type") != "http":
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
