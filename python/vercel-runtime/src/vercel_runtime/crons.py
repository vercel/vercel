from __future__ import annotations

import asyncio
import hmac
import inspect
import os
import traceback
from typing import TYPE_CHECKING, Any, cast

from vercel_runtime.asgi import ASGI, drain_body, get_header, send_json_response
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
    normalized_type = svc_type.strip().lower()
    if normalized_type == "cron":
        return True

    svc_trigger = os.environ.get("VERCEL_SERVICE_TRIGGER") or ""
    normalized_trigger = svc_trigger.strip().lower()
    return normalized_type == "job" and normalized_trigger == "schedule"


def bootstrap_cron_service_app(module: ModuleType) -> ASGI:
    # Check for a named handler function (module:function entrypoint)
    handler_func = _resolve_handler_function(module)
    if handler_func is not None:
        return _make_cron_asgi_app(
            handler_func,
            is_async=inspect.iscoroutinefunction(handler_func),
        )

    # Fall back to __main__ guard execution
    entrypoint_abs = os.environ.get("__VC_HANDLER_ENTRYPOINT_ABS")
    if not entrypoint_abs:
        raise RuntimeError(
            "Unable to bootstrap cron service. "
            "The entrypoint absolute path is not set."
        )

    if not has_main_guard(entrypoint_abs):
        raise RuntimeError(
            "Unable to bootstrap cron service. "
            'The entrypoint must define an `if __name__ == "__main__"` block.'
        )

    return _make_cron_asgi_app(
        lambda: run_entrypoint_as_main(entrypoint_abs),
        is_async=False,
    )


def _resolve_handler_function(module: ModuleType) -> CronHandler | None:
    func_name = os.environ.get("__VC_HANDLER_FUNC_NAME")
    if not func_name:
        return None

    func = getattr(module, func_name, None)
    if func is None:
        raise RuntimeError(
            f'cron handler function "{func_name}" not found in module'
        )

    if not callable(func):
        raise RuntimeError(f'cron handler "{func_name}" is not callable')

    return cast("CronHandler", func)


def _make_cron_asgi_app(
    run_job: CronHandler,
    *,
    is_async: bool,
) -> ASGI:
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
