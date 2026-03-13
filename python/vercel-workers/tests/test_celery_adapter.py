from __future__ import annotations

import asyncio
import json
import unittest
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import patch

import vercel.workers.celery as vwc
import vercel.workers.celery.app as vwc_app
import vercel.workers.celery.utils as vwc_utils


class TestCeleryAdapter(unittest.TestCase):
    def test_extract_task_from_kombu_message_supports_common_shapes(self) -> None:
        # Publishing relies on converting Kombu/Celery messages into a safe, JSON envelope

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
                self.assertNotIn("raw", env)  # default: no raw kombu message

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
        self.assertIn(b"Invalid content type", sent[1]["body"])

    def test_get_asgi_app_post_callback_executes_task_and_deletes_message(self) -> None:
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"q","consumerGroup":"c","messageId":"m"}}'
        )

        class FakeVisibilityExtender:
            instances: list[FakeVisibilityExtender] = []

            def __init__(self, *args, **kwargs):
                self.started = False
                self.finalized = False
                self.stopped = False
                FakeVisibilityExtender.instances.append(self)

            def start(self) -> None:
                self.started = True

            def finalize(self, fn) -> None:
                self.finalized = True
                fn()

            def stop(self) -> None:
                self.stopped = True

        class DummyTask:
            def __init__(self):
                self.calls = []

            def apply(self, *, args, kwargs, task_id, throw):
                self.calls.append((list(args), dict(kwargs), str(task_id), bool(throw)))

        task = DummyTask()

        class DummyConf:
            broker_transport_options: dict = {}

        class DummyCelery:
            conf = DummyConf()
            tasks = {"tasks.add": task}

        payload = {
            "vercel": {"kind": "celery", "version": 1},
            "task": "tasks.add",
            "id": "task-123",
            "args": [1, 2],
            "kwargs": {"x": 9},
        }

        with patch.object(vwc_app.queue_callback, "parse_cloudevent", return_value=("q", "c", "m")):
            with patch.object(
                vwc_app.queue_callback,
                "receive_message_by_id",
                return_value=(payload, 1, "t", "ticket"),
            ):
                with patch.object(
                    vwc_app.queue_callback,
                    "VisibilityExtender",
                    FakeVisibilityExtender,
                ):
                    with patch.object(vwc_app.queue_callback, "delete_message") as delete_message:
                        with patch.object(
                            vwc_app.queue_callback,
                            "change_visibility",
                        ) as change_visibility:
                            sent = asyncio.run(
                                self._asgi_request(
                                    vwc.get_asgi_app(cast(Any, DummyCelery())),
                                    method="POST",
                                    path="/anything",
                                    headers=[(b"content-type", b"application/cloudevents+json")],
                                    body=raw_body,
                                ),
                            )

        self.assertEqual(task.calls, [([1, 2], {"x": 9}, "task-123", True)])
        delete_message.assert_called_once()
        change_visibility.assert_not_called()

        self.assertGreaterEqual(len(FakeVisibilityExtender.instances), 1)
        ext = FakeVisibilityExtender.instances[-1]
        self.assertTrue(ext.started)
        self.assertTrue(ext.finalized)
        self.assertTrue(ext.stopped)

        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertTrue(body["ok"])
        self.assertFalse(body["delayed"])

    def test_get_asgi_app_post_callback_delays_until_eta_by_changing_visibility(self) -> None:
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"q","consumerGroup":"c","messageId":"m"}}'
        )
        fixed_now = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
        eta = fixed_now + timedelta(seconds=123)

        class FakeVisibilityExtender:
            def __init__(self, *args, **kwargs):
                self.started = False
                self.stopped = False

            def start(self) -> None:
                self.started = True

            def finalize(self, fn) -> None:
                fn()

            def stop(self) -> None:
                self.stopped = True

        class DummyTask:
            def __init__(self):
                self.calls = []

            def apply(self, *, args, kwargs, task_id, throw):
                self.calls.append((args, kwargs, task_id, throw))

        task = DummyTask()

        class DummyConf:
            broker_transport_options: dict = {}

        class DummyCelery:
            conf = DummyConf()
            tasks = {"tasks.add": task}

        payload = {
            "vercel": {"kind": "celery", "version": 1},
            "task": "tasks.add",
            "id": "task-eta",
            "args": [1, 2],
            "kwargs": {},
            "eta": eta.isoformat().replace("+00:00", "Z"),
        }

        with patch.object(vwc_utils, "_now_utc", return_value=fixed_now):
            with patch.object(
                vwc_app.queue_callback,
                "parse_cloudevent",
                return_value=("q", "c", "m"),
            ):
                with patch.object(
                    vwc_app.queue_callback,
                    "receive_message_by_id",
                    return_value=(payload, 1, "t", "ticket"),
                ):
                    with patch.object(
                        vwc_app.queue_callback,
                        "VisibilityExtender",
                        FakeVisibilityExtender,
                    ):
                        with patch.object(
                            vwc_app.queue_callback,
                            "change_visibility",
                        ) as change_visibility:
                            with patch.object(
                                vwc_app.queue_callback,
                                "delete_message",
                            ) as delete_message:
                                sent = asyncio.run(
                                    self._asgi_request(
                                        vwc.get_asgi_app(cast(Any, DummyCelery())),
                                        method="POST",
                                        path="/anything",
                                        headers=[
                                            (b"content-type", b"application/cloudevents+json"),
                                        ],
                                        body=raw_body,
                                    ),
                                )

        self.assertEqual(task.calls, [])  # eta scheduling should not execute the task
        change_visibility.assert_called()
        delete_message.assert_not_called()

        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertTrue(body["ok"])
        self.assertTrue(body["delayed"])
        self.assertEqual(body["timeoutSeconds"], 123)


if __name__ == "__main__":
    unittest.main()
