"""A basic WSGI application for testing."""

import json


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

    body = f"{method} {path}"
    if query:
        body += f"?{query}"
    if path == "/oidc":
        body = environ.get("HTTP_X_VERCEL_OIDC_TOKEN", "")

    start_response("200 OK", [("Content-Type", "text/plain")])
    return [body.encode()]
