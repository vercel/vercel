from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

WSGI = Callable[[dict[str, Any], Callable[..., Any]], list[bytes]]
Handler = Callable[[bytes], tuple[int, list[tuple[str, str]], bytes]]


_STATUS_REASONS: dict[int, str] = {
    200: "OK",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    423: "Locked",
    429: "Too Many Requests",
    500: "Internal Server Error",
}


def status_reason(status_code: int) -> str:
    return _STATUS_REASONS.get(int(status_code), "OK")


def _read_body(environ: dict[str, Any]) -> bytes:
    try:
        length = int(environ.get("CONTENT_LENGTH") or "0")
    except ValueError:
        length = 0
    wsgi_input = environ.get("wsgi.input")
    if not wsgi_input or length <= 0:
        return b""
    return wsgi_input.read(length)


def build_wsgi_app(handler: Handler) -> WSGI:
    """
    Build a WSGI application that:
      - responds to GET / with "ok" (healthcheck)
      - accepts POST with Content-Type application/cloudevents+json
      - delegates CloudEvent handling to `handler(raw_body)`
    """

    def app(environ: dict[str, Any], start_response: Callable[..., Any]):
        method = str(environ.get("REQUEST_METHOD") or "GET").upper()
        path = str(environ.get("PATH_INFO") or "/")

        # Healthcheck
        if method == "GET" and path == "/":
            body = b"ok"
            start_response(
                "200 OK",
                [
                    ("Content-Type", "text/plain; charset=utf-8"),
                    ("Content-Length", str(len(body))),
                ],
            )
            return [body]

        # Queue callback
        if method == "POST":
            content_type = str(environ.get("CONTENT_TYPE") or "")
            if "application/cloudevents+json" not in content_type:
                err = (
                    b'{"error":"Invalid content type: expected \\"application/cloudevents+json\\""}'
                )
                start_response(
                    "400 Bad Request",
                    [
                        ("Content-Type", "application/json"),
                        ("Content-Length", str(len(err))),
                    ],
                )
                return [err]

            raw_body = _read_body(environ)
            status_code, headers, body = handler(raw_body)
            start_response(f"{int(status_code)} {status_reason(int(status_code))}", headers)
            return [body]

        # Everything else: simple 404/405.
        body = b"not found" if path != "/" else b"method not allowed"
        status_code = 404 if path != "/" else 405
        start_response(
            f"{int(status_code)} {status_reason(int(status_code))}",
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(body))),
            ],
        )
        return [body]

    return app


def json_response(
    status_code: int,
    payload: dict[str, Any],
) -> tuple[int, list[tuple[str, str]], bytes]:
    body = json.dumps(payload).encode("utf-8")
    return (
        int(status_code),
        [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
        body,
    )
