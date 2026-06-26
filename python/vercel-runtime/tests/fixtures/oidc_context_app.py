"""ASGI app that returns the OIDC token resolved from the request context.

Regression fixture for per-request contextvar propagation: the runtime
publishes the request's OIDC header into vercel's context before dispatching,
and this app reads it back the way the SDK does. If the per-request context
doesn't reach the app, ``get_vercel_oidc_token()`` falls back to the
``VERCEL_OIDC_TOKEN`` env var.
"""

from vercel.oidc import get_vercel_oidc_token


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    body = get_vercel_oidc_token().encode()
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"text/plain")],
        }
    )
    await send(
        {"type": "http.response.body", "body": body, "more_body": False}
    )
