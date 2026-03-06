import asyncio
import json
import logging
import os
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from vercel import wait_until


logger = logging.getLogger(__name__)


def _state_dir(ns: str) -> str:
    return os.path.join("/tmp", "vercel-python-wait-until", ns)


def _token_path(ns: str, state: str, token: str) -> str:
    return os.path.join(
        _state_dir(ns),
        state,
        token,
    )


async def _background_write_ok(ns: str, token: str) -> None:
    await asyncio.sleep(1.0)
    path = _token_path(ns, "ok", token)
    await asyncio.to_thread(
        os.makedirs, os.path.dirname(path), exist_ok=True
    )
    await asyncio.to_thread(Path(path).write_text, token)
    logger.info("waitUntil wrote token %s", token)


async def _background_write_error(ns: str, token: str) -> None:
    await asyncio.sleep(0.2)
    message = f"waitUntil fixture error for token {token}"
    error_path = _token_path(ns, "error", token)
    await asyncio.to_thread(
        os.makedirs, os.path.dirname(error_path), exist_ok=True
    )
    await asyncio.to_thread(Path(error_path).write_text, token)
    print(message, flush=True)
    logger.error(message)
    raise RuntimeError(message)


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        action = params.get("action", [""])[0]
        ns = params.get("ns", ["default"])[0]
        token = params.get("token", ["default"])[0]

        if action == "enqueue-ok":
            wait_until(_background_write_ok(ns, token))
            self._send_json(
                {
                    "status": "queued",
                    "action": action,
                    "ns": ns,
                    "token": token,
                }
            )
            return

        if action == "status":
            ok_exists = os.path.exists(_token_path(ns, "ok", token))
            error_exists = os.path.exists(_token_path(ns, "error", token))
            self._send_json(
                {
                    "status": (
                        "ok"
                        if ok_exists
                        else "error"
                        if error_exists
                        else "pending"
                    ),
                    "ok": ok_exists,
                    "error": error_exists,
                    "ns": ns,
                    "token": token,
                }
            )
            return

        if action == "enqueue-error":
            wait_until(_background_write_error(ns, token))
            self._send_json(
                {
                    "status": "queued",
                    "action": action,
                    "ns": ns,
                    "token": token,
                }
            )
            return

        self._send_json(
            {
                "usage": [
                    "/api?action=enqueue-ok&ns=<ns>&token=<token>",
                    "/api?action=enqueue-error&ns=<ns>&token=<token>",
                    "/api?action=status&ns=<ns>&token=<token>",
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
