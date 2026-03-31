from __future__ import annotations

import asyncio
import hmac
import inspect
import json
import os
import sys
import traceback
from typing import TYPE_CHECKING, Any, cast

from vercel_runtime.asgi import ASGI, drain_body, get_header, send_json_response
from vercel_runtime.resolver import import_module
from vercel_runtime.utils import (
    has_main_guard,
    run_entrypoint_as_main,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Coroutine
    from types import ModuleType

type SyncCronHandler = Callable[[], None]
type AsyncCronHandler = Callable[[], Coroutine[Any, Any, None]]
type CronHandler = SyncCronHandler | AsyncCronHandler


def is_cron_service() -> bool:
    svc_type = os.environ.get("VERCEL_SERVICE_TYPE") or ""
    return svc_type.strip().lower() == "cron"


def bootstrap_cron_service_app(module: ModuleType) -> ASGI:
    """Bootstrap the ASGI app for one or more cron services.

    When ``__VC_HANDLER_CRON_HANDLERS`` is set (grouped build), the JSON
    mapping is parsed and each handler is resolved eagerly.  Otherwise a
    single-entry mapping is built from the current env vars, so the same
    ASGI app handles both cases.
    """
    cron_handlers_raw = os.environ.get("__VC_HANDLER_CRON_HANDLERS")

    if cron_handlers_raw:
        configs: dict[str, dict[str, str]] = json.loads(cron_handlers_raw)
    else:
        # Cast single cron into a group of one.
        configs = {
            "_default": {
                "module": os.environ.get("__VC_HANDLER_MODULE_NAME", ""),
                "entry_abs": os.environ.get(
                    "__VC_HANDLER_ENTRYPOINT_ABS", ""
                ),
                "func": os.environ.get("__VC_HANDLER_FUNC_NAME", ""),
            }
        }

    # Eagerly import all modules and resolve handlers at startup.
    resolved: dict[str, tuple[CronHandler, bool]] = {}
    for name, info in configs.items():
        mod = sys.modules.get(info["module"]) or import_module(
            info["module"], info["entry_abs"]
        )
        resolved[name] = _resolve_handler(
            mod,
            info.get("func", ""),
            info.get("entry_abs", ""),
        )

    return _make_cron_asgi_app(resolved)


def _resolve_handler(
    module: ModuleType,
    func_name: str,
    entry_abs: str,
) -> tuple[CronHandler, bool]:
    """Resolve a cron handler from an imported module."""
    if func_name:
        func = getattr(module, func_name, None)
        if func is None:
            raise RuntimeError(
                f'cron handler function "{func_name}" '
                f'not found in module "{module.__name__}"'
            )
        if not callable(func):
            raise RuntimeError(
                f'cron handler "{func_name}" is not callable'
            )
        return cast("CronHandler", func), inspect.iscoroutinefunction(func)

    for var_name in ("app", "application", "handler"):
        obj = getattr(module, var_name, None)
        if obj is not None and callable(obj):
            return cast("CronHandler", obj), inspect.iscoroutinefunction(obj)

    if entry_abs and has_main_guard(entry_abs):
        return (
            lambda _p=entry_abs: run_entrypoint_as_main(_p),
            False,
        )

    raise RuntimeError(
        f'no callable handler found in module "{module.__name__}"; '
        f"define a top-level function or "
        f'an `if __name__ == "__main__"` block'
    )


def _extract_service_name(path: str) -> str | None:
    """Extract the service name from a cron invocation path.

    Expected format: ``/_svc/{serviceName}/crons/{entry}/{handler}``
    """
    parts = path.split("/")
    if len(parts) >= 4 and parts[1] == "_svc" and parts[3] == "crons":
        return parts[2]
    return None


def _make_cron_asgi_app(
    handlers: dict[str, tuple[CronHandler, bool]],
) -> ASGI:
    single = len(handlers) == 1
    default = next(iter(handlers.values())) if single else None

    async def app(
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
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

        if scope_type != "http":
            return

        method = str(scope.get("method") or "GET").upper()
        if method not in ("GET", "POST"):
            await drain_body(receive)
            await send_json_response(send, 405, {"error": "method not allowed"})
            return

        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret:
            authorization = get_header(scope, "authorization")
            expected = f"Bearer {cron_secret}"
            if not authorization or not hmac.compare_digest(
                authorization, expected
            ):
                await drain_body(receive)
                await send_json_response(send, 401, {"error": "unauthorized"})
                return

        await drain_body(receive)

        if single:
            handler = default
        else:
            service_name = _extract_service_name(
                str(scope.get("path") or "")
            )
            handler = handlers.get(service_name or "")
            if handler is None:
                await send_json_response(
                    send,
                    404,
                    {"error": f"unknown cron service: {service_name}"},
                )
                return

        assert handler is not None
        run_job, is_async = handler

        try:
            if is_async:
                await cast("AsyncCronHandler", run_job)()
            else:
                await asyncio.to_thread(cast("SyncCronHandler", run_job))
        except Exception:
            traceback.print_exc()
            await send_json_response(send, 500, {"error": "internal"})
            return

        await send_json_response(send, 200, {"ok": True})

    return app
