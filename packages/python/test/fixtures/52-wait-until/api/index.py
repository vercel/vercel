import json
import logging
import os
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from vercel import wait_until


logger = logging.getLogger(__name__)


def _token_path(ns: str, token: str) -> str:
    return os.path.join("/tmp", "vercel-python-wait-until", ns, token)


def _background_write(ns: str, token: str) -> None:
    time.sleep(1.0)
    path = _token_path(ns, token)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(token)
    logger.info("waitUntil wrote token %s", token)


def _background_error(token: str) -> None:
    time.sleep(0.2)
    raise RuntimeError(f"waitUntil fixture error for token {token}")


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        action = params.get("action", [""])[0]
        ns = params.get("ns", ["default"])[0]
        token = params.get("token", ["default"])[0]

        if action == "enqueue":
            wait_until(lambda: _background_write(ns, token))
            self._send_json(
                {
                    "status": "queued",
                    "ns": ns,
                    "token": token,
                }
            )
            return

        if action == "status":
            path = _token_path(ns, token)
            exists = os.path.exists(path)
            self._send_json(
                {
                    "status": "done" if exists else "pending",
                    "exists": exists,
                    "ns": ns,
                    "token": token,
                }
            )
            return

        if action == "error":
            wait_until(lambda: _background_error(token))
            self._send_json(
                {
                    "status": "queued-error",
                    "token": token,
                }
            )
            return

        self._send_json(
            {
                "usage": [
                    "/api?action=enqueue&ns=<ns>&token=<token>",
                    "/api?action=status&ns=<ns>&token=<token>",
                    "/api?action=error&token=<token>",
                ]
            }
        )

    def _send_json(self, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
