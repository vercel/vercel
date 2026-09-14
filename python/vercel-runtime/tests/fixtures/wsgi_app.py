"""A basic WSGI application for testing."""

import json

from vercel_runtime import get_deadline


def app(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")
    query = environ.get("QUERY_STRING", "")

    if path == "/headers":
        payload = {
            key[5:].lower().replace("_", "-"): value
            for key, value in environ.items()
            if key.startswith("HTTP_")
        }
        body = json.dumps(payload)
        start_response("200 OK", [("Content-Type", "application/json")])
        return [body.encode()]

    if path == "/deadline":
        deadline = get_deadline()
        body = json.dumps(
            {
                "deadline": deadline.isoformat() if deadline else None,
                "header": "HTTP_X_VERCEL_INTERNAL_DEADLINE" in environ,
                "unknown_header": ("HTTP_X_VERCEL_INTERNAL_UNKNOWN" in environ),
            }
        )
        start_response("200 OK", [("Content-Type", "application/json")])
        return [body.encode()]

    if path == "/deadline-stream":
        start_response("200 OK", [("Content-Type", "text/plain")])

        def stream():
            for _ in range(2):
                deadline = get_deadline()
                yield f"{deadline.isoformat() if deadline else None}\n".encode()

        return stream()

    body = f"{method} {path}"
    if query:
        body += f"?{query}"
    if path == "/oidc":
        body = environ.get("HTTP_X_VERCEL_OIDC_TOKEN", "")

    start_response("200 OK", [("Content-Type", "text/plain")])
    return [body.encode()]
