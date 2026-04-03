from __future__ import annotations

import asyncio
import json
import unittest
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import patch

import vercel.workers.celery as vwc
import vercel.workers.celery.transport as vwc_transport
import vercel.workers.celery.utils as vwc_utils
from vercel.workers.client import QueueClient


def _v2beta_headers(
    *,
    queue_name: str = "q",
    consumer_group: str = "c",
    message_id: str = "m",
    receipt_handle: str = "receipt-123",
    delivery_count: int = 1,
    created_at: str = "2025-01-01T00:00:00Z",
    content_type: str = "application/json",
) -> list[tuple[bytes, bytes]]:
    return [
        (b"ce-type", b"com.vercel.queue.v2beta"),
        (b"ce-vqsqueuename", queue_name.encode()),
        (b"ce-vqsconsumergroup", consumer_group.encode()),
        (b"ce-vqsmessageid", message_id.encode()),
        (b"ce-vqsreceipthandle", receipt_handle.encode()),
        (b"ce-vqsdeliverycount", str(delivery_count).encode()),
        (b"ce-vqscreatedat", created_at.encode()),
        (b"content-type", content_type.encode()),
    ]


class TestCeleryAdapter(unittest.TestCase):
    def test_install_kombu_transport_alias_registers_vercel_alias(self) -> None:
        from kombu.transport import TRANSPORT_ALIASES  # type: ignore[import-untyped]

        with patch.dict(TRANSPORT_ALIASES, {}, clear=True):
            vwc_transport.install_kombu_transport_alias()
            self.assertIn("vercel", TRANSPORT_ALIASES)

    def test_extract_task_from_kombu_message_supports_common_shapes(self) -> None:
        cases = [
            (
                "protocol-v2-minimal",
                {
                    "headers": {
                        "task": "tasks.add",
                        "id": "task-123",
                        "retries": 2,
                        "eta": "2025-01-01T00:00:10Z",
                        "expires": "2025-01-01T00:10:00Z",
                    },
                    "body": [[1, 2], {"k": "v"}, None],
                    "properties": {"correlation_id": "task-123"},
                },
                {
                    "task": "tasks.add",
                    "id": "task-123",
                    "args": [1, 2],
                    "kwargs": {"k": "v"},
                    "retries": 2,
                    "eta": "2025-01-01T00:00:10Z",
                    "expires": "2025-01-01T00:10:00Z",
                },
            ),
            (
                "protocol-v1-like-body-dict",
                {
                    "headers": {},
                    "body": {
                        "task": "tasks.add",
                        "id": "task-456",
                        "args": [3],
                        "kwargs": {"y": 4},
                    },
                    "properties": {},
                },
                {
                    "task": "tasks.add",
                    "id": "task-456",
                    "args": [3],
                    "kwargs": {"y": 4},
                    "retries": 0,
                },
            ),
        ]

        for name, message, expected in cases:
            with self.subTest(name=name):
                env = vwc_utils._extract_task_from_kombu_message(message)
                vercel_info = env.get("vercel")
                self.assertIsInstance(vercel_info, dict)
                self.assertEqual(cast(dict[str, Any], vercel_info).get("kind"), "celery")
                self.assertEqual(cast(dict[str, Any], vercel_info).get("version"), 1)
                for k, v in expected.items():
                    self.assertEqual(env.get(k), v)
                self.assertNotIn("raw", env)

    def test_get_asgi_app_healthcheck(self) -> None:
        async def run() -> list[dict]:
            app = vwc.get_asgi_app(cast(Any, object()))
            sent: list[dict] = []

            async def receive() -> dict:
                raise AssertionError("receive() should not be called for GET / healthcheck")

            async def send(message: dict) -> None:
                sent.append(message)

            scope = {"type": "http", "method": "GET", "path": "/"}
            await app(scope, receive, send)
            return sent

        sent = asyncio.run(run())
        self.assertGreaterEqual(len(sent), 2)
        self.assertEqual(sent[0]["type"], "http.response.start")
        self.assertEqual(sent[0]["status"], 200)
        self.assertEqual(sent[1]["type"], "http.response.body")
        self.assertEqual(sent[1]["body"], b"ok")

    @staticmethod
    async def _asgi_request(
        app,
        *,
        method: str,
        path: str,
        headers: list[tuple[bytes, bytes]] | None = None,
        body: bytes = b"",
    ) -> list[dict]:
        sent: list[dict] = []
        receive_messages = [{"type": "http.request", "body": body, "more_body": False}]

        async def receive() -> dict:
            return receive_messages.pop(0) if receive_messages else {"type": "http.disconnect"}

        async def send(message: dict) -> None:
            sent.append(message)

        scope = {
            "type": "http",
            "method": method,
            "path": path,
            "headers": headers or [],
        }
        await app(scope, receive, send)
        return sent

    def test_get_asgi_app_rejects_non_cloudevents_json(self) -> None:
        sent = asyncio.run(
            self._asgi_request(
                vwc.get_asgi_app(cast(Any, object())),
                method="POST",
                path="/anything",
                headers=[(b"content-type", b"application/json")],
                body=b"{}",
            ),
        )
        self.assertEqual(sent[0]["type"], "http.response.start")
        self.assertEqual(sent[0]["status"], 400)
        self.assertIn(b"Invalid CloudEvent type", sent[1]["body"])

    def test_get_asgi_app_post_callback_executes_task_and_deletes_message(self) -> None:
        payload = {
            "vercel": {"kind": "celery", "version": 1},
            "task": "tasks.add",
            "id": "task-123",
            "args": [1, 2],
            "kwargs": {"x": 9},
        }

        class DummyTask:
            def __init__(self):
                self.calls: list[tuple] = []

            def apply(self, *, args, kwargs, task_id, throw):
                self.calls.append((list(args), dict(kwargs), str(task_id), bool(throw)))

        task = DummyTask()

        class DummyConf:
            broker_transport_options: dict = {}

        class DummyCelery:
            conf = DummyConf()
            tasks = {"tasks.add": task}

        with (
            patch.object(QueueClient, "acknowledge") as mock_ack,
            patch.object(QueueClient, "change_visibility") as mock_cv,
        ):
            sent = asyncio.run(
                self._asgi_request(
                    vwc.get_asgi_app(cast(Any, DummyCelery())),
                    method="POST",
                    path="/anything",
                    headers=_v2beta_headers(),
                    body=json.dumps(payload).encode(),
                ),
            )

        self.assertEqual(task.calls, [([1, 2], {"x": 9}, "task-123", True)])
        mock_ack.assert_called_once()
        mock_cv.assert_not_called()

        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertTrue(body["ok"])

    def test_get_asgi_app_post_callback_delays_until_eta_by_changing_visibility(self) -> None:
        fixed_now = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
        eta = fixed_now + timedelta(seconds=123)

        payload = {
            "vercel": {"kind": "celery", "version": 1},
            "task": "tasks.add",
            "id": "task-eta",
            "args": [1, 2],
            "kwargs": {},
            "eta": eta.isoformat().replace("+00:00", "Z"),
        }

        class DummyTask:
            def __init__(self):
                self.calls: list[tuple] = []

            def apply(self, *, args, kwargs, task_id, throw):
                self.calls.append((args, kwargs, task_id, throw))

        task = DummyTask()

        class DummyConf:
            broker_transport_options: dict = {}

        class DummyCelery:
            conf = DummyConf()
            tasks = {"tasks.add": task}

        with (
            patch.object(vwc_utils, "_now_utc", return_value=fixed_now),
            patch.object(QueueClient, "acknowledge") as mock_ack,
            patch.object(QueueClient, "change_visibility") as mock_cv,
        ):
            sent = asyncio.run(
                self._asgi_request(
                    vwc.get_asgi_app(cast(Any, DummyCelery())),
                    method="POST",
                    path="/anything",
                    headers=_v2beta_headers(),
                    body=json.dumps(payload).encode(),
                ),
            )

        self.assertEqual(task.calls, [])
        mock_cv.assert_called()
        mock_ack.assert_not_called()

        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertTrue(body["ok"])
        self.assertTrue(body["delayed"])
        self.assertEqual(body["timeoutSeconds"], 123)


if __name__ == "__main__":
    unittest.main()
