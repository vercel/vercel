from __future__ import annotations

import types
import unittest
from unittest.mock import patch

import vercel.workers._runtime as vwr
from vercel.workers import QueueClient


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

    def test_resolve_worker_service_app_uses_named_queue_client(self) -> None:
        expected_app = object()
        queue = QueueClient()

        @queue.subscribe(topic="orders")
        def handle(payload: object) -> None:
            _ = payload

        module = types.SimpleNamespace(queue=queue)

        with patch.object(
            vwr,
            "build_asgi_app_for_subscriptions",
            return_value=expected_app,
        ) as build_app:
            app = vwr._resolve_worker_service_app(module, "queue")

        self.assertIs(app, expected_app)
        build_app.assert_called_once_with(queue.subscriptions)

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
