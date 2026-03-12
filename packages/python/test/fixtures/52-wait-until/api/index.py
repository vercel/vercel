import asyncio
import json
import logging
import os
from pathlib import Path
from urllib.parse import parse_qs

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
    await asyncio.to_thread(os.makedirs, os.path.dirname(path), exist_ok=True)
    await asyncio.to_thread(Path(path).write_text, token)
    logger.info("background task wrote token %s", token)


async def _background_write_error(ns: str, token: str) -> None:
    await asyncio.sleep(0.2)
    message = f"background task fixture error for token {token}"
    error_path = _token_path(ns, "error", token)
    await asyncio.to_thread(os.makedirs, os.path.dirname(error_path), exist_ok=True)
    await asyncio.to_thread(Path(error_path).write_text, token)
    print(message, flush=True)
    logger.error(message)
    raise RuntimeError(message)


def _send_json(send, payload):
    body = json.dumps(payload).encode()

    async def _do_send():
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": body,
                "more_body": False,
            }
        )

    return _do_send()


async def app(scope, receive, send):
    if scope["type"] != "http":
        return

    query_string = scope.get("query_string", b"").decode()
    params = parse_qs(query_string)
    action = params.get("action", [""])[0]
    ns = params.get("ns", ["default"])[0]
    token = params.get("token", ["default"])[0]

    if action == "enqueue-ok":
        asyncio.create_task(_background_write_ok(ns, token))
        await _send_json(
            send,
            {
                "status": "queued",
                "action": action,
                "ns": ns,
                "token": token,
            },
        )
        return

    if action == "status":
        ok_exists = os.path.exists(_token_path(ns, "ok", token))
        error_exists = os.path.exists(_token_path(ns, "error", token))
        await _send_json(
            send,
            {
                "status": (
                    "ok" if ok_exists else "error" if error_exists else "pending"
                ),
                "ok": ok_exists,
                "error": error_exists,
                "ns": ns,
                "token": token,
            },
        )
        return

    if action == "enqueue-error":
        asyncio.create_task(_background_write_error(ns, token))
        await _send_json(
            send,
            {
                "status": "queued",
                "action": action,
                "ns": ns,
                "token": token,
            },
        )
        return

    await _send_json(
        send,
        {
            "usage": [
                "/api?action=enqueue-ok&ns=<ns>&token=<token>",
                "/api?action=enqueue-error&ns=<ns>&token=<token>",
                "/api?action=status&ns=<ns>&token=<token>",
            ]
        },
    )
