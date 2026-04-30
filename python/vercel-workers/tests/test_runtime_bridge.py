from __future__ import annotations

import asyncio
import json
import types
import unittest
from typing import Any, cast
from unittest.mock import patch

import vercel.workers._runtime as vwr
import vercel.workers.client as queue_client


class TestPrepareEnvironment(unittest.TestCase):
    def test_defaults_celery_broker_url_for_worker_services(self) -> None:
        environ = {"VERCEL_HAS_WORKER_SERVICES": "1"}

        with patch.object(vwr, "_install_celery_transport_alias") as install_alias:
            vwr.prepare_environment(environ)

        self.assertEqual(
            environ.get("CELERY_BROKER_URL"),
            "vercel://",
        )
        install_alias.assert_called_once_with()

    def test_does_not_override_user_defined_celery_broker_url(self) -> None:
        environ = {
            "VERCEL_HAS_WORKER_SERVICES": "1",
            "CELERY_BROKER_URL": "redis://localhost:6379/0",
        }

        with patch.object(vwr, "_install_celery_transport_alias") as install_alias:
            vwr.prepare_environment(environ)

        self.assertEqual(
            environ.get("CELERY_BROKER_URL"),
            "redis://localhost:6379/0",
        )
        install_alias.assert_called_once_with()

    def test_registers_aliases_for_user_defined_vercel_broker(self) -> None:
        environ = {"CELERY_BROKER_URL": "vercel://"}

        with patch.object(vwr, "_install_celery_transport_alias") as install_alias:
            vwr.prepare_environment(environ)

        install_alias.assert_called_once_with()

    def test_skips_setup_without_workers_or_vercel_broker(self) -> None:
        with patch.object(vwr, "_install_celery_transport_alias") as install_alias:
            vwr.prepare_environment({})

        install_alias.assert_not_called()


class TestWorkerBootstrapBridge(unittest.TestCase):
    def setUp(self) -> None:
        queue_client._subscriptions.clear()

    def tearDown(self) -> None:
        queue_client._subscriptions.clear()

    @staticmethod
    async def _asgi_request(
        app: Any,
        *,
        headers: list[tuple[bytes, bytes]],
        body: bytes,
    ) -> list[dict[str, Any]]:
        sent: list[dict[str, Any]] = []
        receive_messages = [
            {"type": "http.request", "body": body, "more_body": False}
        ]

        async def receive() -> dict[str, Any]:
            if receive_messages:
                return receive_messages.pop(0)
            return {"type": "http.disconnect"}

        async def send(message: dict[str, Any]) -> None:
            sent.append(message)

        await app(
            {
                "type": "http",
                "method": "POST",
                "path": "/",
                "headers": headers,
            },
            receive,
            send,
        )
        return sent

    @staticmethod
    def _queue_callback_headers(topic: str) -> list[tuple[bytes, bytes]]:
        return [
            (b"content-type", b"application/json"),
            (b"ce-type", b"com.vercel.queue.v2beta"),
            (b"ce-vqsqueuename", topic.encode()),
            (b"ce-vqsconsumergroup", b"consumer"),
            (b"ce-vqsmessageid", b"m"),
            (b"ce-vqsreceipthandle", b"receipt"),
            (b"ce-vqsdeliverycount", b"1"),
            (b"ce-vqscreatedat", b"now"),
        ]

    def test_maybe_bootstrap_worker_service_app_returns_explicit_app(self) -> None:
        module = types.SimpleNamespace(app=object())

        with patch.object(vwr, "_resolve_worker_service_app", return_value=None):
            app = vwr.maybe_bootstrap_worker_service_app(module)

        self.assertIsNone(app)

    def test_maybe_bootstrap_worker_service_app_prefers_worker_integration(self) -> None:
        module = types.SimpleNamespace(app=object(), worker=object())
        expected_app = object()

        with patch.object(vwr, "_resolve_worker_service_app", return_value=expected_app):
            app = vwr.maybe_bootstrap_worker_service_app(module)

        self.assertIs(app, expected_app)

    def test_resolve_worker_service_app_uses_generic_subscriptions(self) -> None:
        expected_app = object()

        with (
            patch.object(vwr, "_bootstrap_celery_worker_app", return_value=None),
            patch.object(vwr, "_bootstrap_dramatiq_worker_app", return_value=None),
            patch.object(vwr, "_bootstrap_django_worker_app", return_value=None),
            patch.object(vwr, "has_subscriptions", return_value=True),
            patch.object(vwr, "get_generic_asgi_app", return_value=expected_app),
        ):
            app = vwr._resolve_worker_service_app(types.SimpleNamespace())

        self.assertIs(app, expected_app)

    def test_resolve_worker_service_app_uses_queue_client_subscriptions(
        self,
    ) -> None:
        client = queue_client.QueueClient(region="sfo1")
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        module = types.SimpleNamespace(client=client)

        with (
            patch.object(vwr, "_bootstrap_celery_worker_app", return_value=None),
            patch.object(vwr, "_bootstrap_dramatiq_worker_app", return_value=None),
            patch.object(vwr, "_bootstrap_django_worker_app", return_value=None),
            patch.object(queue_client.callback, "delete_message") as delete_message,
        ):
            app = vwr._resolve_worker_service_app(module)
            self.assertIsNotNone(app)
            sent = asyncio.run(
                self._asgi_request(
                    cast(Any, app),
                    headers=self._queue_callback_headers("orders"),
                    body=b'{"ok": true}',
                )
            )

        self.assertEqual(sent[0]["status"], 200)
        self.assertEqual(json.loads(sent[1]["body"]), {"ok": True})
        self.assertEqual(calls, [{"ok": True}])
        delete_message.assert_called_once_with("orders", "consumer", "m", "receipt")

    def test_resolve_worker_service_app_uses_async_queue_client_subscriptions(
        self,
    ) -> None:
        client = queue_client.AsyncQueueClient(region="sfo1")
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        async def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        module = types.SimpleNamespace(client=client)

        with (
            patch.object(vwr, "_bootstrap_celery_worker_app", return_value=None),
            patch.object(vwr, "_bootstrap_dramatiq_worker_app", return_value=None),
            patch.object(vwr, "_bootstrap_django_worker_app", return_value=None),
            patch.object(queue_client.callback, "delete_message") as delete_message,
        ):
            app = vwr._resolve_worker_service_app(module)
            self.assertIsNotNone(app)
            sent = asyncio.run(
                self._asgi_request(
                    cast(Any, app),
                    headers=self._queue_callback_headers("orders"),
                    body=b'{"ok": true}',
                )
            )

        self.assertEqual(sent[0]["status"], 200)
        self.assertEqual(json.loads(sent[1]["body"]), {"ok": True})
        self.assertEqual(calls, [{"ok": True}])
        delete_message.assert_called_once_with("orders", "consumer", "m", "receipt")

    def test_bootstrap_worker_service_app_wraps_framework_errors(self) -> None:
        with (
            patch.object(
                vwr,
                "_bootstrap_celery_worker_app",
                side_effect=ValueError("boom"),
            ),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "Celery worker bootstrap failed.",
            ):
                vwr.maybe_bootstrap_worker_service_app(types.SimpleNamespace())
