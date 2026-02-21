from __future__ import annotations

import asyncio
import hmac
import os
import traceback
from typing import TYPE_CHECKING, Any

from vercel_runtime.asgi import ASGI, drain_body, get_header, send_json_response
from vercel_runtime.utils import (
    has_main_guard,
    run_entrypoint_as_main,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


def is_cron_service() -> bool:
    svc_type = os.environ.get("VERCEL_SERVICE_TYPE") or ""
    return svc_type.strip().lower() == "cron"


def bootstrap_cron_service_app(module: object) -> ASGI:
    entrypoint_abs = os.environ.get("__VC_HANDLER_ENTRYPOINT_ABS")

    if not has_main_guard(entrypoint_abs):
        raise RuntimeError(
            "Unable to bootstrap cron service. "
            'The entrypoint must define an `if __name__ == "__main__"` block.'
        )

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
            await asyncio.to_thread(run_entrypoint_as_main, entrypoint_abs)
        except Exception:
            traceback.print_exc()
            await send_json_response(send, 500, {"error": "internal"})
            return

        await send_json_response(send, 200, {"ok": True})

    return app
