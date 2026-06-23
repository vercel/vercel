from __future__ import annotations

import json


async def app(scope, receive, send):
    if scope["type"] != "websocket":
        return

    path = scope.get("path", "/")

    message = await receive()
    if message["type"] != "websocket.connect":
        return

    # /reject: decline the upgrade with an HTTP 403 response
    if path.endswith("/reject"):
        await send(
            {
                "type": "websocket.http.response.start",
                "status": 403,
                "headers": [(b"content-type", b"text/plain")],
            }
        )
        await send(
            {
                "type": "websocket.http.response.body",
                "body": b"forbidden",
                "more_body": False,
            }
        )
        return

    # /server-close: accept then immediately close from server side
    if path.endswith("/server-close"):
        await send({"type": "websocket.accept"})
        await send({"type": "websocket.close", "code": 1000})
        return

    headers = {
        key.decode("latin1").lower(): value.decode("latin1")
        for key, value in scope.get("headers", [])
    }

    await send({"type": "websocket.accept"})
    await send(
        {
            "type": "websocket.send",
            "text": json.dumps(
                {
                    "path": path,
                    "root_path": scope.get("root_path", ""),
                    "has_internal_invocation_id": (
                        "x-vercel-internal-invocation-id" in headers
                    ),
                    "has_internal_request_id": (
                        "x-vercel-internal-request-id" in headers
                    ),
                    "has_internal_span_id": (
                        "x-vercel-internal-span-id" in headers
                    ),
                    "has_internal_trace_id": (
                        "x-vercel-internal-trace-id" in headers
                    ),
                    "oidc_token": headers.get("x-vercel-oidc-token"),
                },
                sort_keys=True,
            ),
        }
    )

    while True:
        message = await receive()
        if message["type"] == "websocket.disconnect":
            return

        if message["type"] != "websocket.receive":
            continue

        text = message.get("text")
        if text is not None:
            await send({"type": "websocket.send", "text": f"echo:{text}"})
            continue

        data = message.get("bytes")
        if data is not None:
            await send({"type": "websocket.send", "bytes": data})
