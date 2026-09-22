from __future__ import annotations

import asyncio
import contextlib
import os
import sys
import types
import unittest
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import Mock, patch

import vercel_runtime.workers as vrw

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Mapping


class TestIsWorkerService(unittest.TestCase):
    def test_detects_legacy_worker_service_type(self) -> None:
        with patch.dict(
            os.environ,
            {"VERCEL_SERVICE_TYPE": "worker"},
            clear=True,
        ):
            self.assertTrue(vrw.is_worker_service())

    def test_detects_queue_triggered_job_service(self) -> None:
        with patch.dict(
            os.environ,
            {
                "VERCEL_SERVICE_TYPE": "job",
                "VERCEL_SERVICE_TRIGGER": "queue",
            },
            clear=True,
        ):
            self.assertTrue(vrw.is_worker_service())


class TestPrepareWorkerEnvironment(unittest.TestCase):
    def test_prepare_worker_environment_delegates_to_workers_runtime(
        self,
    ) -> None:
        bridge = types.SimpleNamespace(prepare_environment=Mock())

        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(vrw, "_load_workers_runtime", return_value=bridge),
        ):
            vrw.prepare_worker_environment()

        bridge.prepare_environment.assert_called_once()
        self.assertIs(bridge.prepare_environment.call_args.args[0], os.environ)

    def test_prepare_worker_environment_skips_without_workers_runtime(
        self,
    ) -> None:
        with patch.object(vrw, "_load_workers_runtime", return_value=None):
            vrw.prepare_worker_environment()


class TestMaybeBootstrapWorkerServiceApp(unittest.TestCase):
    def test_delegates_to_workers_runtime(self) -> None:
        module = types.SimpleNamespace()
        expected_app = object()
        bridge = types.SimpleNamespace(
            maybe_bootstrap_worker_service_app=Mock(return_value=expected_app)
        )

        with patch.object(vrw, "_load_workers_runtime", return_value=bridge):
            app = vrw.maybe_bootstrap_worker_service_app(module)

        self.assertIs(app, expected_app)
        bridge.maybe_bootstrap_worker_service_app.assert_called_once_with(
            module
        )

    def test_raises_when_workers_runtime_is_missing(self) -> None:
        with (
            patch.object(vrw, "_load_workers_runtime", return_value=None),
            self.assertRaisesRegex(
                RuntimeError,
                "Unable to bootstrap worker service because "
                '"vercel-workers" is missing',
            ),
        ):
            vrw.maybe_bootstrap_worker_service_app(types.SimpleNamespace())


class TestIsDevQueueServing(unittest.TestCase):
    def test_enabled(self) -> None:
        with patch.dict(
            os.environ, {"VERCEL_DEV_QUEUE_SERVING": "1"}, clear=True
        ):
            self.assertTrue(vrw.is_dev_queue_serving())

    def test_disabled(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(vrw.is_dev_queue_serving())


class TestCreateQueueServiceApp(unittest.TestCase):
    def test_creates_runtime_callback_app_from_public_sdk_apis(self) -> None:
        async def accept_and_handle(
            body: AsyncIterator[bytes], headers: Mapping[str, str]
        ) -> None:
            del body, headers
            await asyncio.sleep(0)

        class ProtocolError(Exception):
            pass

        class HeadersContext:
            def __init__(self, headers: Mapping[str, str]) -> None:
                self.headers = headers

            def use(self) -> contextlib.AbstractContextManager[None]:
                return contextlib.nullcontext()

        queue_mod = types.ModuleType("vercel.queue")
        cast("Any", queue_mod).ProtocolError = ProtocolError
        cast("Any", queue_mod).accept_and_handle = accept_and_handle
        headers_mod = types.ModuleType("vercel.headers")
        cast("Any", headers_mod).HeadersContext = HeadersContext
        cast("Any", headers_mod).headers_from_asgi_scope = Mock(return_value={})

        with patch.dict(
            sys.modules,
            {
                "vercel.headers": headers_mod,
                "vercel.queue": queue_mod,
            },
        ):
            app = vrw.create_queue_service_app()

        self.assertIsInstance(app, vrw._QueueCallbackApp)

    def test_raises_when_vercel_queue_is_missing(self) -> None:
        with (
            patch.dict(
                sys.modules,
                {"vercel.headers": None, "vercel.queue": None},
            ),
            self.assertRaisesRegex(
                RuntimeError,
                "Unable to create queue service because "
                '"vercel-queue" is missing',
            ),
        ):
            vrw.create_queue_service_app()


class TestQueueCallbackApp(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.calls: list[tuple[list[bytes], dict[str, str]]] = []
        self.context_headers: list[dict[str, str]] = []

        async def accept_and_handle(
            body: AsyncIterator[bytes], headers: Mapping[str, str]
        ) -> None:
            self.calls.append(([chunk async for chunk in body], dict(headers)))

        @contextlib.contextmanager
        def headers_context(
            headers: Mapping[str, str],
        ) -> Any:
            self.context_headers.append(dict(headers))
            yield

        self.accept_and_handle = accept_and_handle
        self.headers_context = headers_context

    def make_app(self) -> vrw._QueueCallbackApp:
        return vrw._QueueCallbackApp(
            accept_and_handle=self.accept_and_handle,
            headers_from_scope=lambda scope: {
                key.decode("latin-1"): value.decode("latin-1")
                for key, value in scope.get("headers", [])
            },
            headers_context=self.headers_context,
            bad_request_exceptions=(ValueError, TypeError),
        )

    async def call_app(
        self,
        *,
        method: str = "POST",
        messages: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        received = list(
            messages
            or [
                {"type": "http.request", "body": b"payload"},
            ]
        )
        sent: list[dict[str, Any]] = []

        async def receive() -> dict[str, Any]:
            await asyncio.sleep(0)
            return received.pop(0)

        async def send(message: dict[str, Any]) -> None:
            await asyncio.sleep(0)
            sent.append(message)

        await self.make_app()(
            {
                "type": "http",
                "method": method,
                "headers": [(b"ce-type", b"com.vercel.queue.v2beta")],
            },
            receive,
            send,
        )
        return sent

    async def test_streams_body_and_headers_to_accept_and_handle(self) -> None:
        sent = await self.call_app(
            messages=[
                {
                    "type": "http.request",
                    "body": b"pay",
                    "more_body": True,
                },
                {"type": "http.request", "body": b"load"},
            ]
        )

        self.assertEqual(
            self.calls,
            [
                (
                    [b"pay", b"load"],
                    {"ce-type": "com.vercel.queue.v2beta"},
                )
            ],
        )
        self.assertEqual(self.context_headers, [self.calls[0][1]])
        self.assertEqual(sent[0]["status"], 204)

    async def test_rejects_non_post_requests(self) -> None:
        sent = await self.call_app(method="GET")

        self.assertEqual(sent[0]["status"], 405)
        self.assertEqual(sent[0]["headers"], [(b"allow", b"POST")])
        self.assertEqual(self.calls, [])

    async def test_returns_bad_request_for_invalid_callback(self) -> None:
        async def reject(
            body: AsyncIterator[bytes], headers: Mapping[str, str]
        ) -> None:
            del body, headers
            await asyncio.sleep(0)
            raise ValueError("bad callback")

        self.accept_and_handle = reject
        with self.assertLogs("vercel.queue", level="WARNING"):
            sent = await self.call_app()

        self.assertEqual(sent[0]["status"], 400)

    async def test_returns_server_error_for_handler_failure(self) -> None:
        async def fail(
            body: AsyncIterator[bytes], headers: Mapping[str, str]
        ) -> None:
            del body, headers
            await asyncio.sleep(0)
            raise RuntimeError("handler failed")

        self.accept_and_handle = fail
        with self.assertLogs("vercel.queue", level="ERROR"):
            sent = await self.call_app()

        self.assertEqual(sent[0]["status"], 500)

    async def test_handles_lifespan_startup_and_shutdown(self) -> None:
        received = [
            {"type": "lifespan.startup"},
            {"type": "lifespan.shutdown"},
        ]
        sent: list[dict[str, Any]] = []

        async def receive() -> dict[str, Any]:
            await asyncio.sleep(0)
            return received.pop(0)

        async def send(message: dict[str, Any]) -> None:
            await asyncio.sleep(0)
            sent.append(message)

        await self.make_app()({"type": "lifespan"}, receive, send)

        self.assertEqual(
            sent,
            [
                {"type": "lifespan.startup.complete"},
                {"type": "lifespan.shutdown.complete"},
            ],
        )


class TestBootstrapQueueServiceApp(unittest.TestCase):
    def test_activates_integrations_before_creating_app(self) -> None:
        expected_app = object()
        calls: list[str] = []

        def create_app() -> object:
            calls.append("create")
            return expected_app

        def install_integrations(*, queue_serving: bool) -> None:
            calls.append(f"install:{queue_serving}")

        with (
            patch.object(
                vrw,
                "install_queue_integrations",
                side_effect=install_integrations,
            ),
            patch.object(
                vrw,
                "create_queue_service_app",
                side_effect=create_app,
            ),
        ):
            app = vrw.bootstrap_queue_service_app()

        self.assertIs(app, expected_app)
        self.assertEqual(calls, ["install:True", "create"])


class TestInstallQueueIntegrations(unittest.TestCase):
    def test_noop_without_integration_env(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            vrw.install_queue_integrations(queue_serving=True)

    def test_activates_listed_integrations(self) -> None:
        installer = Mock()
        integration_mod = types.ModuleType("vercel.integrations.celery")
        cast("Any", integration_mod).install_it = installer

        with (
            patch.dict(
                os.environ,
                {
                    "VERCEL_QUEUE_INTEGRATIONS": (
                        "vercel.integrations.celery:install_it"
                    )
                },
                clear=True,
            ),
            patch.dict(
                sys.modules,
                {"vercel.integrations.celery": integration_mod},
            ),
        ):
            vrw.install_queue_integrations(queue_serving=True)

        installer.assert_called_once_with()

    def test_publish_only_activation_disables_queue_registration(self) -> None:
        calls: list[dict[str, object]] = []

        def install_it(*, register_queues: bool = True) -> None:
            calls.append({"register_queues": register_queues})

        integration_mod = types.ModuleType("vercel.integrations.celery")
        cast("Any", integration_mod).install_it = install_it

        with (
            patch.dict(
                os.environ,
                {
                    "VERCEL_QUEUE_INTEGRATIONS": (
                        "vercel.integrations.celery:install_it"
                    )
                },
                clear=True,
            ),
            patch.dict(
                sys.modules,
                {"vercel.integrations.celery": integration_mod},
            ),
        ):
            vrw.install_queue_integrations(queue_serving=False)

        self.assertEqual(calls, [{"register_queues": False}])

    def test_serving_activator_runs_only_when_serving(self) -> None:
        installer = Mock()
        activator = Mock()
        integration_mod = types.ModuleType("vercel.integrations.dramatiq")
        cast("Any", integration_mod).install_it = installer
        cast("Any", integration_mod).activate_serving = activator

        env = {
            "VERCEL_QUEUE_INTEGRATIONS": (
                "vercel.integrations.dramatiq:install_it:activate_serving"
            )
        }
        with (
            patch.dict(os.environ, env, clear=True),
            patch.dict(
                sys.modules,
                {"vercel.integrations.dramatiq": integration_mod},
            ),
        ):
            vrw.install_queue_integrations(queue_serving=False)
            activator.assert_not_called()
            vrw.install_queue_integrations(queue_serving=True)
            activator.assert_called_once_with()
        self.assertEqual(installer.call_count, 2)

    def test_activation_failure_is_a_hard_error(self) -> None:
        with (
            patch.dict(
                os.environ,
                {
                    "VERCEL_QUEUE_INTEGRATIONS": (
                        "vercel.integrations.nonexistent:install_it"
                    )
                },
                clear=True,
            ),
            self.assertRaisesRegex(
                RuntimeError,
                "Failed to activate the vercel.integrations.nonexistent "
                "integration",
            ),
        ):
            vrw.install_queue_integrations(queue_serving=True)

    def test_malformed_entry_is_a_hard_error(self) -> None:
        with (
            patch.dict(
                os.environ,
                {"VERCEL_QUEUE_INTEGRATIONS": "just-a-module"},
                clear=True,
            ),
            self.assertRaisesRegex(
                RuntimeError, "Invalid VERCEL_QUEUE_INTEGRATIONS entry"
            ),
        ):
            vrw.install_queue_integrations(queue_serving=True)
