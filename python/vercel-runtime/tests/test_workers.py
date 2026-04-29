from __future__ import annotations

import contextlib
import os
import unittest
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import patch

import vercel_runtime.workers as vrw

if TYPE_CHECKING:
    from collections.abc import Iterator


class _FakeQueueClient:
    def __init__(
        self,
        *,
        app: object = "client-app",
        has_subscriptions: bool = True,
    ) -> None:
        self.app = app
        self._has_subscriptions = has_subscriptions

    def has_subscriptions(self) -> bool:
        return self._has_subscriptions

    def get_asgi_app(self) -> object:
        return self.app


class _FakeAsyncQueueClient(_FakeQueueClient):
    pass


def _fake_vercel_workers_module(
    *,
    has_subscriptions: bool = False,
) -> SimpleNamespace:
    return SimpleNamespace(
        QueueClient=_FakeQueueClient,
        AsyncQueueClient=_FakeAsyncQueueClient,
        has_subscriptions=lambda: has_subscriptions,
        get_asgi_app=lambda: "global-app",
    )


class TestPrepareCeleryEnvironment(unittest.TestCase):
    def test_defaults_celery_broker_url_for_worker_services(self) -> None:
        with (
            patch.dict(
                os.environ,
                {"VERCEL_HAS_WORKER_SERVICES": "1"},
                clear=True,
            ),
            patch.object(
                vrw, "_install_vercel_celery_transport_alias"
            ) as install_transport_alias,
        ):
            vrw.prepare_celery_environment()
            self.assertEqual(
                os.environ.get("CELERY_BROKER_URL"),
                vrw.VERCEL_CELERY_BROKER_URL,
            )

        install_transport_alias.assert_called_once_with()

    def test_does_not_override_user_defined_celery_broker_url(self) -> None:
        with (
            patch.dict(
                os.environ,
                {
                    "VERCEL_HAS_WORKER_SERVICES": "1",
                    "CELERY_BROKER_URL": "redis://localhost:6379/0",
                },
                clear=True,
            ),
            patch.object(
                vrw, "_install_vercel_celery_transport_alias"
            ) as install_transport_alias,
        ):
            vrw.prepare_celery_environment()
            self.assertEqual(
                os.environ.get("CELERY_BROKER_URL"),
                "redis://localhost:6379/0",
            )

        install_transport_alias.assert_called_once_with()

    def test_registers_aliases_for_user_defined_vercel_broker(self) -> None:
        with (
            patch.dict(
                os.environ,
                {"CELERY_BROKER_URL": vrw.VERCEL_CELERY_BROKER_URL},
                clear=True,
            ),
            patch.object(
                vrw, "_install_vercel_celery_transport_alias"
            ) as install_transport_alias,
        ):
            vrw.prepare_celery_environment()

        install_transport_alias.assert_called_once_with()

    def test_skips_setup_without_workers_or_vercel_broker(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                vrw, "_install_vercel_celery_transport_alias"
            ) as install_transport_alias,
        ):
            vrw.prepare_celery_environment()

        install_transport_alias.assert_not_called()


class TestBootstrapGenericWorkerApp(unittest.TestCase):
    @contextlib.contextmanager
    def _bootstrap_patches(
        self,
        *,
        has_subscriptions: bool = False,
    ) -> Iterator[None]:
        with (
            patch.object(vrw, "CELERY_AVAILABLE", new=False),
            patch.object(vrw, "DRAMATIQ_AVAILABLE", new=False),
            patch.object(vrw, "DJANGO_TASKS_AVAILABLE", new=False),
            patch.object(vrw, "VERCEL_WORKERS_AVAILABLE", new=True),
            patch.object(
                vrw,
                "_import_optional_module",
                return_value=_fake_vercel_workers_module(
                    has_subscriptions=has_subscriptions,
                ),
            ),
        ):
            yield

    def test_bootstraps_exported_queue_client_with_subscriptions(self) -> None:
        module = SimpleNamespace(client=_FakeQueueClient(app="client-app"))

        with self._bootstrap_patches():
            app = vrw.bootstrap_worker_service_app(module)

        self.assertEqual(app, "client-app")

    def test_bootstraps_named_entrypoint_queue_client_first(self) -> None:
        module = SimpleNamespace(
            app=_FakeQueueClient(app="app-client"),
            q=_FakeQueueClient(app="q-client"),
        )

        with self._bootstrap_patches(has_subscriptions=True):
            app = vrw.bootstrap_worker_service_app(module, "q")

        self.assertEqual(app, "q-client")

    def test_detects_exported_queue_client_for_prod_bootstrap(
        self,
    ) -> None:
        module = SimpleNamespace(q=_FakeQueueClient())

        with self._bootstrap_patches():
            has_app = vrw.has_queue_client_worker_app(module, "q")

        self.assertTrue(has_app)

    def test_prefers_module_level_subscriptions(self) -> None:
        module = SimpleNamespace(client=_FakeQueueClient(app="client-app"))

        with self._bootstrap_patches(has_subscriptions=True):
            app = vrw.bootstrap_worker_service_app(module)

        self.assertEqual(app, "global-app")
