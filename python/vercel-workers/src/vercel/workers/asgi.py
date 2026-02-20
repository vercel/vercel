from __future__ import annotations

import asyncio
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

Handler = Callable[[bytes], tuple[int, list[tuple[str, str]], bytes]]


def _get_header(scope: dict[str, Any], name: str) -> str | None:
    """
    Fetch an HTTP header value (case-insensitive) from an ASGI scope.
    """
    headers = scope.get("headers") or []
    target = name.lower().encode("latin1")
    try:
        for k, v in headers:
            if isinstance(k, (bytes, bytearray)) and bytes(k).lower() == target:
                if isinstance(v, (bytes, bytearray)):
                    return bytes(v).decode("latin1")
                return str(v)
    except Exception:
        return None
    return None


async def _read_body(receive: Callable[[], Awaitable[dict[str, Any]]]) -> bytes:
    chunks: list[bytes] = []
    while True:
        message = await receive()

        msg_type = message.get("type")
        if msg_type == "http.disconnect":
            break
        if msg_type != "http.request":
            continue

        body = message.get("body") or b""
        if body:
            chunks.append(body)
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


def build_asgi_app(handler: Handler) -> ASGI:
    """
    Build an ASGI application that:
      - responds to GET / with "ok" (healthcheck)
      - accepts POST with Content-Type application/cloudevents+json
      - delegates CloudEvent handling to `handler(raw_body)` on a thread
    """

    async def app(
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        scope_type = scope.get("type")

        # Minimal lifespan support so ASGI servers don't warn.
        if scope_type == "lifespan":
            while True:
                message = await receive()
                msg_type = message.get("type")
                if msg_type == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif msg_type == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return

        if scope_type != "http":
            return

        method = str(scope.get("method") or "GET").upper()
        path = str(scope.get("path") or "/")

        # Healthcheck
        if method == "GET" and path == "/":
            body = b"ok"
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [
                        (b"content-type", b"text/plain; charset=utf-8"),
                        (b"content-length", str(len(body)).encode("ascii")),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        # Queue callback
        if method == "POST":
            content_type = _get_header(scope, "content-type")
            if not content_type or "application/cloudevents+json" not in content_type:
                body = (
                    b'{"error":"Invalid content type: expected \\"application/cloudevents+json\\""}'
                )
                await send(
                    {
                        "type": "http.response.start",
                        "status": 400,
                        "headers": [
                            (b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode("ascii")),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": body})
                return

            raw_body = await _read_body(receive)
            status_code, headers, body = await asyncio.to_thread(handler, raw_body)
            asgi_headers: list[tuple[bytes, bytes]] = [
                (k.lower().encode("latin1"), v.encode("latin1")) for (k, v) in headers
            ]
            await send(
                {
                    "type": "http.response.start",
                    "status": int(status_code),
                    "headers": asgi_headers,
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        # Everything else: simple 404/405.
        body = b"not found" if path != "/" else b"method not allowed"
        status = 404 if path != "/" else 405
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"text/plain; charset=utf-8"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    return app
