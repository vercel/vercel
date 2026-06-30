"""A WSGI application that echoes the request body and path as JSON."""

import json


def app(environ, start_response):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        length = 0
    body = environ["wsgi.input"].read(length) if length else b""
    payload = {
        "received": body.decode("utf-8", "replace"),
        "path": environ.get("PATH_INFO", "/"),
    }
    data = json.dumps(payload).encode()
    start_response(
        "200 OK",
        [
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(data))),
        ],
    )
    return [data]
