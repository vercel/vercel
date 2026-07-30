"""WSGI fixture proving deferred tasks see request-scoped headers."""

import json

from vercel.headers import get_headers

from vercel_runtime.request_tasks import register_request_task

observed_tokens: list[str | None] = []


def capture_oidc_token() -> None:
    headers = get_headers() or {}
    observed_tokens.append(headers.get("x-vercel-oidc-token"))


register_request_task("capture-oidc", capture_oidc_token)


def app(environ, start_response):
    del environ
    body = json.dumps(observed_tokens).encode()
    start_response("200 OK", [("Content-Type", "application/json")])
    return [body]
