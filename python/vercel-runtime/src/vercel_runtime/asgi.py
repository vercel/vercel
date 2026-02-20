from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

ASGI = Callable[
    [
        dict[str, Any],
        Callable[[], Awaitable[dict[str, Any]]],
        Callable[[dict[str, Any]], Awaitable[None]],
    ],
    Awaitable[None],
]


def get_header(scope: dict[str, Any], name: str) -> str | None:
    headers = scope.get("headers") or []
    target = name.lower().encode("latin1")
    try:
        for key, value in headers:
            if isinstance(key, (bytes, bytearray)) and bytes(key).lower() == target:
                if isinstance(value, (bytes, bytearray)):
                    return bytes(value).decode("latin1")
                return str(value)
    except Exception:
        return None
    return None


async def drain_body(
    receive: Callable[[], Awaitable[dict[str, Any]]],
) -> None:
    while True:
        message = await receive()
        message_type = message.get("type")
        if message_type == "http.disconnect":
            return
        if message_type != "http.request":
            continue
        if not message.get("more_body", False):
            return


async def send_json_response(
    send: Callable[[dict[str, Any]], Awaitable[None]],
    status_code: int,
    payload: dict[str, Any],
) -> None:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": status_code,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
