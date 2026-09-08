"""ASGI fixture proving wait_until runs after the response."""

import asyncio
import json
import os

from vercel.cache.context import get_context
from vercel.headers import get_headers

from vercel_runtime import get_deadline

observed_tokens: list[str | None] = []


async def capture_oidc_token() -> None:
    await asyncio.sleep(0)
    headers = get_headers() or {}
    token = headers.get("x-vercel-oidc-token")
    observed_tokens.append(token)
    output_path = os.environ.get("WAIT_UNTIL_OUTPUT")
    if output_path:
        with open(output_path, "a") as output:
            output.write(f"{token}\n")
    deadline_output_path = os.environ.get("WAIT_UNTIL_DEADLINE_OUTPUT")
    if deadline_output_path:
        deadline = get_deadline()
        with open(deadline_output_path, "a") as output:
            output.write(f"{deadline.isoformat() if deadline else None}\n")


async def app(scope, receive, send):
    del receive
    if scope["type"] != "http":
        return

    callback = get_context().wait_until
    assert callback is not None
    callback(capture_oidc_token())
    body = json.dumps(observed_tokens).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": body,
            "more_body": False,
        }
    )
