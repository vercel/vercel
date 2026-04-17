from __future__ import annotations

import asyncio
import hmac
import importlib
import inspect
import json
import os
import subprocess
import traceback
from typing import TYPE_CHECKING, Any, cast

from vercel_runtime.asgi import ASGI, drain_body, get_header, send_json_response
from vercel_runtime.utils import run_entrypoint_as_main

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Coroutine
    from types import ModuleType

type SyncCronHandler = Callable[[], None]
type AsyncCronHandler = Callable[[], Coroutine[Any, Any, None]]
type CronHandler = SyncCronHandler | AsyncCronHandler
type ResolvedCronHandler = tuple[CronHandler, bool]
type CronHandlerResolver = Callable[[str], ResolvedCronHandler | None]


def is_cron_service() -> bool:
    svc_type = os.environ.get("VERCEL_SERVICE_TYPE") or ""
    normalized_type = svc_type.strip().lower()
    if normalized_type == "cron":
        return True

    svc_trigger = os.environ.get("VERCEL_SERVICE_TRIGGER") or ""
    normalized_trigger = svc_trigger.strip().lower()
    return normalized_type == "job" and normalized_trigger == "schedule"


def bootstrap_cron_service_app(_module: ModuleType) -> ASGI:
    command = _resolve_command()
    if command is not None:
        command_handler: ResolvedCronHandler = (
            lambda: _run_command(command),
            False,
        )
        return _make_cron_asgi_app(
            lambda _path: command_handler,
        )

    routes_json = os.environ.get("__VC_CRON_ROUTES")
    if not routes_json:
        raise RuntimeError(
            "unable to bootstrap cron service: "
            '"__VC_CRON_ROUTES" environment variable is not set'
        )
    return _bootstrap_multi_cron(routes_json)


def _resolve_command() -> str | None:
    command = os.environ.get("__VC_CRON_COMMAND")
    if command is None or not command.strip():
        return None
    return command


def _run_command(command: str) -> None:
    cwd = os.environ.get("__VC_CRON_COMMAND_CWD") or os.getcwd()
    subprocess.run(command, shell=True, check=True, cwd=cwd)


def _bootstrap_multi_cron(routes_json: str) -> ASGI:
    """Build a path-routing ASGI app from a JSON route table.

    The route table maps full cron paths to handler specifiers.  A specifier
    is either ``module:function`` (calls the named callable) or a bare module
    name (runs the module's ``if __name__ == "__main__"`` block).
    """
    raw: dict[str, str] = json.loads(routes_json)
    route_table: dict[str, ResolvedCronHandler] = {}
    for path, module_function in raw.items():
        if ":" in module_function:
            colon_idx = module_function.index(":")
            module_name = module_function[:colon_idx]
            func_name = module_function[colon_idx + 1 :]
            mod = importlib.import_module(module_name)
            func = getattr(mod, func_name, None)
            if func is None:
                msg = (
                    f'cron handler function "{func_name}" '
                    f'not found in module "{module_name}"'
                )
                raise RuntimeError(msg)
            if not callable(func):
                msg = (
                    f'cron handler "{module_name}:{func_name}" is not callable'
                )
                raise RuntimeError(msg)
            handler = cast("CronHandler", func)
            route_table[path] = (handler, inspect.iscoroutinefunction(handler))
        else:
            # Bare module name — run as __main__
            mod = importlib.import_module(module_function)
            mod_file = getattr(mod, "__file__", None)
            if not mod_file:
                msg = (
                    "could not resolve file path for "
                    f'module "{module_function}"'
                )
                raise RuntimeError(msg)
            route_table[path] = (
                lambda ep=mod_file: run_entrypoint_as_main(ep),
                False,
            )
    return _make_cron_asgi_app(
        route_table.get,
        not_found_error=lambda path: f"no cron handler for path: {path}",
    )


def _make_cron_asgi_app(
    resolve_handler: CronHandlerResolver,
    *,
    not_found_error: Callable[[str], str] | None = None,
) -> ASGI:
    """Build an ASGI app that resolves and runs cron handlers."""

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

        path = str(scope.get("path") or "/")
        resolved = resolve_handler(path)
        if resolved is None:
            await drain_body(receive)
            if not_found_error is None:
                await send_json_response(send, 404, {"error": "not found"})
            else:
                await send_json_response(
                    send, 404, {"error": not_found_error(path)}
                )
            return

        run_job, is_async = resolved
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
