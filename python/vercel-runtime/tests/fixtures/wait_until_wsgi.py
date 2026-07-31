"""WSGI fixture proving wait_until sees request-scoped headers."""

import asyncio
import json
import os

from vercel.cache.context import get_context
from vercel.headers import get_headers

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


def app(environ, start_response):
    del environ
    callback = get_context().wait_until
    assert callback is not None
    callback(capture_oidc_token())
    body = json.dumps(observed_tokens).encode()
    start_response("200 OK", [("Content-Type", "application/json")])
    return [body]
