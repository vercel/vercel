"""ASGI app that echoes repeated Accept headers."""

from __future__ import annotations


async def app(scope, receive, send):
    if scope.get("type") != "http":
        return

    accept_values: list[str] = []
    for raw_key, raw_value in scope.get("headers", []):
        key = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
        if key.lower() != "accept":
            continue

        if isinstance(raw_value, list):
            for item in raw_value:
                if isinstance(item, bytes):
                    accept_values.append(item.decode())
                else:
                    accept_values.append(str(item))
        elif isinstance(raw_value, bytes):
            accept_values.append(raw_value.decode())
        else:
            accept_values.append(str(raw_value))

    body = ",".join(accept_values).encode()

    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"text/plain")],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": body,
            "more_body": False,
        }
    )
