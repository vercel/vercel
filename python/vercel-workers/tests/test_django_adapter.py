from __future__ import annotations

import asyncio
import json
import unittest
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch

# Skip all tests if Django is not available (optional dependency)
try:
    import vercel.workers.django.app as vwd_app
    import vercel.workers.django.backend as vwd_backend

    DJANGO_AVAILABLE = True
except (ImportError, RuntimeError):
    vwd_app: Any = None  # type: ignore[assignment]
    vwd_backend: Any = None  # type: ignore[assignment]
    DJANGO_AVAILABLE = False


_skip_without_django = unittest.skipUnless(DJANGO_AVAILABLE, "Django is not installed")


@_skip_without_django
class TestDjangoTaskEnvelopeParsing(unittest.TestCase):
    """Tests for envelope parsing and validation."""

    def test_parse_envelope_valid(self) -> None:
        payload = {
            "vercel": {"kind": "django-tasks", "version": 1},
            "task": {
                "module_path": "myapp.tasks.my_task",
                "takes_context": False,
                "backend": "default",
                "queue_name": "default",
                "priority": 0,
                "run_after": None,
            },
            "args": [1, 2, 3],
            "kwargs": {"key": "value"},
        }
        result = vwd_app._parse_envelope(payload)
        self.assertEqual(result["task"]["module_path"], "myapp.tasks.my_task")
        self.assertEqual(result["args"], [1, 2, 3])
        self.assertEqual(result["kwargs"], {"key": "value"})

    def test_parse_envelope_invalid_not_dict(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            vwd_app._parse_envelope("not a dict")
        self.assertIn("expected object", str(ctx.exception))

    def test_parse_envelope_invalid_wrong_kind(self) -> None:
        payload = {
            "vercel": {"kind": "celery", "version": 1},
            "task": {},
            "args": [],
            "kwargs": {},
        }
        with self.assertRaises(ValueError) as ctx:
            vwd_app._parse_envelope(payload)
        self.assertIn("not a django-tasks envelope", str(ctx.exception))

    def test_parse_envelope_missing_vercel(self) -> None:
        payload: dict[str, Any] = {"task": {}, "args": [], "kwargs": {}}
        with self.assertRaises(ValueError) as ctx:
            vwd_app._parse_envelope(payload)
        self.assertIn("not a django-tasks envelope", str(ctx.exception))


@_skip_without_django
class TestDjangoTaskWorkerConfig(unittest.TestCase):
    """Tests for DjangoTaskWorkerConfig."""

    def test_default_values(self) -> None:
        cfg = vwd_app.DjangoTaskWorkerConfig()
        self.assertEqual(cfg.visibility_timeout_seconds, 30)
        self.assertEqual(cfg.visibility_refresh_interval_seconds, 10.0)
        self.assertEqual(cfg.timeout, 10.0)
        self.assertEqual(cfg.max_attempts, 3)
        self.assertEqual(cfg.retry_backoff_base_seconds, 5)
        self.assertEqual(cfg.retry_backoff_factor, 2.0)
        self.assertEqual(cfg.max_retry_delay_seconds, 60 * 60)

    def test_from_backend_options(self) -> None:
        options = {
            "visibility_timeout_seconds": 60,
            "visibility_refresh_interval_seconds": 15.0,
            "timeout": 20.0,
            "max_attempts": 5,
            "retry_backoff_base_seconds": 10,
            "retry_backoff_factor": 3.0,
            "max_retry_delay_seconds": 3600,
        }
        cfg = vwd_app.DjangoTaskWorkerConfig.from_backend_options(options)
        self.assertEqual(cfg.visibility_timeout_seconds, 60)
        self.assertEqual(cfg.visibility_refresh_interval_seconds, 15.0)
        self.assertEqual(cfg.timeout, 20.0)
        self.assertEqual(cfg.max_attempts, 5)
        self.assertEqual(cfg.retry_backoff_base_seconds, 10)
        self.assertEqual(cfg.retry_backoff_factor, 3.0)
        self.assertEqual(cfg.max_retry_delay_seconds, 3600)

    def test_from_backend_options_ignores_invalid(self) -> None:
        options = {
            "visibility_timeout_seconds": "invalid",
            "max_attempts": -1,
        }
        cfg = vwd_app.DjangoTaskWorkerConfig.from_backend_options(options)
        # Should keep defaults for invalid values
        self.assertEqual(cfg.visibility_timeout_seconds, 30)
        self.assertEqual(cfg.max_attempts, 3)


@_skip_without_django
class TestRetryDelayCalculation(unittest.TestCase):
    """Tests for retry delay calculation with exponential backoff."""

    def test_first_attempt_uses_base(self) -> None:
        cfg = vwd_app.DjangoTaskWorkerConfig(
            retry_backoff_base_seconds=5,
            retry_backoff_factor=2.0,
        )
        self.assertEqual(vwd_app._retry_delay_seconds(cfg, 1), 5)

    def test_second_attempt_applies_factor(self) -> None:
        cfg = vwd_app.DjangoTaskWorkerConfig(
            retry_backoff_base_seconds=5,
            retry_backoff_factor=2.0,
        )
        # base * factor^(attempt-1) = 5 * 2^1 = 10
        self.assertEqual(vwd_app._retry_delay_seconds(cfg, 2), 10)

    def test_third_attempt(self) -> None:
        cfg = vwd_app.DjangoTaskWorkerConfig(
            retry_backoff_base_seconds=5,
            retry_backoff_factor=2.0,
        )
        # base * factor^(attempt-1) = 5 * 2^2 = 20
        self.assertEqual(vwd_app._retry_delay_seconds(cfg, 3), 20)

    def test_respects_max_delay(self) -> None:
        cfg = vwd_app.DjangoTaskWorkerConfig(
            retry_backoff_base_seconds=100,
            retry_backoff_factor=10.0,
            max_retry_delay_seconds=500,
        )
        # Would be 100 * 10^5 = huge, but capped at 500
        self.assertEqual(vwd_app._retry_delay_seconds(cfg, 6), 500)


@_skip_without_django
class TestVercelQueuesBackendOptions(unittest.TestCase):
    """Tests for VercelQueuesBackendOptions."""

    def test_default_values(self) -> None:
        cfg = vwd_backend.VercelQueuesBackendOptions()
        self.assertIsNone(cfg.token)
        self.assertIsNone(cfg.base_url)
        self.assertIsNone(cfg.base_path)
        self.assertIsNone(cfg.retention_seconds)
        self.assertIsNone(cfg.deployment_id)
        self.assertEqual(cfg.timeout, 10.0)
        self.assertEqual(cfg.cache_alias, "default")
        self.assertEqual(cfg.cache_key_prefix, "vercel-workers:django-tasks")
        self.assertEqual(cfg.result_ttl_seconds, 24 * 60 * 60)

    def test_from_options_dict(self) -> None:
        options = {
            "token": "test-token",
            "base_url": "https://example.com",
            "base_path": "/api/v3",
            "retention_seconds": 86400,
            "deployment_id": "deploy-123",
            "timeout": 30.0,
            "cache_alias": "redis",
            "cache_key_prefix": "custom-prefix",
            "result_ttl_seconds": 3600,
        }
        cfg = vwd_backend.VercelQueuesBackendOptions.from_options_dict(options)
        self.assertEqual(cfg.token, "test-token")
        self.assertEqual(cfg.base_url, "https://example.com")
        self.assertEqual(cfg.base_path, "/api/v3")
        self.assertEqual(cfg.retention_seconds, 86400)
        self.assertEqual(cfg.deployment_id, "deploy-123")
        self.assertEqual(cfg.timeout, 30.0)
        self.assertEqual(cfg.cache_alias, "redis")
        self.assertEqual(cfg.cache_key_prefix, "custom-prefix")
        self.assertEqual(cfg.result_ttl_seconds, 3600)


@_skip_without_django
class TestParseIsoDatetime(unittest.TestCase):
    """Tests for ISO datetime parsing."""

    def test_parse_valid_iso(self) -> None:
        result = vwd_backend._parse_iso_datetime("2025-01-15T10:30:00+00:00")
        self.assertIsNotNone(result)
        self.assertEqual(result.year, 2025)
        self.assertEqual(result.month, 1)
        self.assertEqual(result.day, 15)

    def test_parse_z_suffix(self) -> None:
        result = vwd_backend._parse_iso_datetime("2025-01-15T10:30:00Z")
        self.assertIsNotNone(result)
        self.assertEqual(result.tzinfo, UTC)

    def test_parse_naive_becomes_utc(self) -> None:
        result = vwd_backend._parse_iso_datetime("2025-01-15T10:30:00")
        self.assertIsNotNone(result)
        self.assertEqual(result.tzinfo, UTC)

    def test_parse_none(self) -> None:
        self.assertIsNone(vwd_backend._parse_iso_datetime(None))

    def test_parse_empty(self) -> None:
        self.assertIsNone(vwd_backend._parse_iso_datetime(""))

    def test_parse_invalid(self) -> None:
        self.assertIsNone(vwd_backend._parse_iso_datetime("not-a-date"))


@_skip_without_django
class TestDjangoAsgiApp(unittest.TestCase):
    """Tests for Django ASGI app behavior."""

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

    def test_healthcheck_returns_ok(self) -> None:
        """Test that GET / returns ok for healthcheck."""

        async def run() -> list[dict]:
            # Mock the backend resolution
            mock_backend = MagicMock()
            mock_backend.options = {}
            mock_backend.queues = None

            with patch.object(vwd_app, "_resolve_backend", return_value=mock_backend):
                app = vwd_app.get_asgi_app(backend_alias="default")
                return await self._asgi_request(app, method="GET", path="/")

        sent = asyncio.run(run())
        self.assertGreaterEqual(len(sent), 2)
        self.assertEqual(sent[0]["type"], "http.response.start")
        self.assertEqual(sent[0]["status"], 200)
        self.assertEqual(sent[1]["type"], "http.response.body")
        self.assertEqual(sent[1]["body"], b"ok")

    def test_rejects_non_cloudevents_json(self) -> None:
        """Test that non-CloudEvents content type is rejected."""

        async def run() -> list[dict]:
            mock_backend = MagicMock()
            mock_backend.options = {}
            mock_backend.queues = None

            with patch.object(vwd_app, "_resolve_backend", return_value=mock_backend):
                app = vwd_app.get_asgi_app(backend_alias="default")
                return await self._asgi_request(
                    app,
                    method="POST",
                    path="/callback",
                    headers=[(b"content-type", b"application/json")],
                    body=b"{}",
                )

        sent = asyncio.run(run())
        self.assertEqual(sent[0]["type"], "http.response.start")
        self.assertEqual(sent[0]["status"], 400)
        self.assertIn(b"Invalid content type", sent[1]["body"])

    def test_post_callback_executes_task_and_deletes_message(self) -> None:
        """Test that a valid callback executes the task and deletes the message."""
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

        # Track task execution
        task_executed = []

        def fake_task_func(*args, **kwargs):
            task_executed.append((args, kwargs))
            return "success"

        # Create mock Task and TaskResult
        mock_task = MagicMock()
        mock_task.module_path = "myapp.tasks.my_task"
        mock_task.takes_context = False
        mock_task.queue_name = "q"
        mock_task.priority = 0
        mock_task.call = fake_task_func

        mock_task_result = MagicMock()
        mock_task_result.task = mock_task
        mock_task_result.args = [1, 2]
        mock_task_result.kwargs = {"x": 9}
        mock_task_result.errors = []
        mock_task_result.worker_ids = []

        mock_backend = MagicMock()
        mock_backend.options = {}
        mock_backend.queues = None
        mock_backend.alias = "default"
        mock_backend.worker_id = "worker-123"
        mock_backend._load_or_init_result_from_envelope.return_value = mock_task_result
        mock_backend._task_from_module_path.return_value = mock_task

        payload: vwd_backend.DjangoTaskEnvelope = {
            "vercel": {"kind": "django-tasks", "version": 1},
            "task": {
                "module_path": "myapp.tasks.my_task",
                "takes_context": False,
                "backend": "default",
                "queue_name": "q",
                "priority": 0,
                "run_after": None,
            },
            "args": [1, 2],
            "kwargs": {"x": 9},
        }

        async def run():
            FakeVisibilityExtender.instances.clear()

            with patch.object(vwd_app, "_resolve_backend", return_value=mock_backend):
                with patch.object(
                    vwd_app.queue_callback,
                    "parse_cloudevent",
                    return_value=("q", "c", "m"),
                ):
                    with patch.object(
                        vwd_app.queue_callback,
                        "receive_message_by_id",
                        return_value=(payload, 1, "2025-01-01T00:00:00Z", "ticket"),
                    ):
                        with patch.object(
                            vwd_app.queue_callback,
                            "VisibilityExtender",
                            FakeVisibilityExtender,
                        ):
                            with patch.object(
                                vwd_app.queue_callback, "delete_message"
                            ) as delete_message:
                                with patch.object(
                                    vwd_app.queue_callback, "change_visibility"
                                ) as change_visibility:
                                    app = vwd_app.get_asgi_app(backend_alias="default")
                                    sent = await self._asgi_request(
                                        app,
                                        method="POST",
                                        path="/callback",
                                        headers=[
                                            (b"content-type", b"application/cloudevents+json")
                                        ],
                                        body=raw_body,
                                    )
                                    return sent, delete_message, change_visibility

        sent, delete_message, change_visibility = asyncio.run(run())

        # Verify task was executed
        self.assertEqual(len(task_executed), 1)
        self.assertEqual(task_executed[0], ((1, 2), {"x": 9}))

        # Verify message was deleted (not visibility changed)
        delete_message.assert_called_once()
        change_visibility.assert_not_called()

        # Verify visibility extender lifecycle
        self.assertGreaterEqual(len(FakeVisibilityExtender.instances), 1)
        ext = FakeVisibilityExtender.instances[-1]
        self.assertTrue(ext.started)
        self.assertTrue(ext.finalized)
        self.assertTrue(ext.stopped)

        # Verify response
        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertTrue(body["ok"])

    def test_post_callback_delays_until_run_after_by_changing_visibility(self) -> None:
        """Test that run_after in the future delays the message."""
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"q","consumerGroup":"c","messageId":"m"}}'
        )
        fixed_now = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
        run_after = fixed_now + timedelta(seconds=123)

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

        mock_backend = MagicMock()
        mock_backend.options = {}
        mock_backend.queues = None
        mock_backend.alias = "default"

        payload: vwd_backend.DjangoTaskEnvelope = {
            "vercel": {"kind": "django-tasks", "version": 1},
            "task": {
                "module_path": "myapp.tasks.my_task",
                "takes_context": False,
                "backend": "default",
                "queue_name": "q",
                "priority": 0,
                "run_after": run_after.isoformat().replace("+00:00", "Z"),
            },
            "args": [1, 2],
            "kwargs": {},
        }

        async def run():
            with patch.object(vwd_app, "_now_utc", return_value=fixed_now):
                with patch.object(vwd_app, "_resolve_backend", return_value=mock_backend):
                    with patch.object(
                        vwd_app.queue_callback,
                        "parse_cloudevent",
                        return_value=("q", "c", "m"),
                    ):
                        with patch.object(
                            vwd_app.queue_callback,
                            "receive_message_by_id",
                            return_value=(payload, 1, "2025-01-01T00:00:00Z", "ticket"),
                        ):
                            with patch.object(
                                vwd_app.queue_callback,
                                "VisibilityExtender",
                                FakeVisibilityExtender,
                            ):
                                with patch.object(
                                    vwd_app.queue_callback,
                                    "change_visibility",
                                ) as change_visibility:
                                    with patch.object(
                                        vwd_app.queue_callback,
                                        "delete_message",
                                    ) as delete_message:
                                        app = vwd_app.get_asgi_app(backend_alias="default")
                                        sent = await self._asgi_request(
                                            app,
                                            method="POST",
                                            path="/callback",
                                            headers=[
                                                (b"content-type", b"application/cloudevents+json"),
                                            ],
                                            body=raw_body,
                                        )
                                        return sent, change_visibility, delete_message

        sent, change_visibility, delete_message = asyncio.run(run())

        # Task should NOT have been executed (delayed)
        # Visibility should have been changed, not deleted
        change_visibility.assert_called()
        delete_message.assert_not_called()

        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertTrue(body["ok"])
        self.assertTrue(body["delayed"])
        self.assertEqual(body["timeoutSeconds"], 123)

    def test_rejects_wrong_queue(self) -> None:
        """Test that messages from unexpected queues are rejected."""
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"wrong-queue","consumerGroup":"c","messageId":"m"}}'
        )

        mock_backend = MagicMock()
        mock_backend.options = {}
        mock_backend.queues = ["expected-queue"]  # Only allow this queue
        mock_backend.alias = "default"

        async def run() -> list[dict]:
            with patch.object(vwd_app, "_resolve_backend", return_value=mock_backend):
                with patch.object(
                    vwd_app.queue_callback,
                    "parse_cloudevent",
                    return_value=("wrong-queue", "c", "m"),
                ):
                    app = vwd_app.get_asgi_app(backend_alias="default")
                    return await self._asgi_request(
                        app,
                        method="POST",
                        path="/callback",
                        headers=[(b"content-type", b"application/cloudevents+json")],
                        body=raw_body,
                    )

        sent = asyncio.run(run())
        self.assertEqual(sent[0]["status"], 500)
        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertEqual(body["error"], "invalid-queue")


@_skip_without_django
class TestDjangoTaskRetryBehavior(unittest.TestCase):
    """Tests for retry behavior on task failure."""

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

    def test_task_failure_retries_with_backoff(self) -> None:
        """Test that task failure triggers retry with visibility change."""
        raw_body = (
            b'{"type":"com.vercel.queue.v1beta","data":'
            b'{"queueName":"q","consumerGroup":"c","messageId":"m"}}'
        )

        class FakeVisibilityExtender:
            def __init__(self, *args, **kwargs):
                pass

            def start(self) -> None:
                pass

            def finalize(self, fn) -> None:
                fn()

            def stop(self) -> None:
                pass

        def failing_task(*args, **kwargs):
            raise ValueError("Task failed!")

        mock_task = MagicMock()
        mock_task.module_path = "myapp.tasks.failing_task"
        mock_task.takes_context = False
        mock_task.queue_name = "q"
        mock_task.priority = 0
        mock_task.call = failing_task

        mock_task_result = MagicMock()
        mock_task_result.task = mock_task
        mock_task_result.args = []
        mock_task_result.kwargs = {}
        mock_task_result.errors = []
        mock_task_result.worker_ids = []  # First attempt

        mock_backend = MagicMock()
        mock_backend.options = {"max_attempts": 3}
        mock_backend.queues = None
        mock_backend.alias = "default"
        mock_backend.worker_id = "worker-123"
        mock_backend._load_or_init_result_from_envelope.return_value = mock_task_result
        mock_backend._task_from_module_path.return_value = mock_task

        payload: vwd_backend.DjangoTaskEnvelope = {
            "vercel": {"kind": "django-tasks", "version": 1},
            "task": {
                "module_path": "myapp.tasks.failing_task",
                "takes_context": False,
                "backend": "default",
                "queue_name": "q",
                "priority": 0,
                "run_after": None,
            },
            "args": [],
            "kwargs": {},
        }

        async def run():
            with patch.object(vwd_app, "_resolve_backend", return_value=mock_backend):
                with patch.object(
                    vwd_app.queue_callback,
                    "parse_cloudevent",
                    return_value=("q", "c", "m"),
                ):
                    with patch.object(
                        vwd_app.queue_callback,
                        "receive_message_by_id",
                        return_value=(payload, 1, "2025-01-01T00:00:00Z", "ticket"),
                    ):
                        with patch.object(
                            vwd_app.queue_callback,
                            "VisibilityExtender",
                            FakeVisibilityExtender,
                        ):
                            with patch.object(
                                vwd_app.queue_callback,
                                "change_visibility",
                            ) as change_visibility:
                                with patch.object(
                                    vwd_app.queue_callback,
                                    "delete_message",
                                ) as delete_message:
                                    app = vwd_app.get_asgi_app(backend_alias="default")
                                    sent = await self._asgi_request(
                                        app,
                                        method="POST",
                                        path="/callback",
                                        headers=[
                                            (b"content-type", b"application/cloudevents+json"),
                                        ],
                                        body=raw_body,
                                    )
                                    return sent, change_visibility, delete_message

        result = asyncio.run(run())
        sent, change_visibility, delete_message = result

        # Should retry (change visibility), not delete
        change_visibility.assert_called()
        delete_message.assert_not_called()

        body = json.loads(sent[1]["body"].decode("utf-8"))
        self.assertTrue(body["ok"])
        self.assertTrue(body["delayed"])
        # First retry uses base delay (5 seconds by default)
        self.assertIn("timeoutSeconds", body)


if __name__ == "__main__":
    unittest.main()
