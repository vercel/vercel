from __future__ import annotations

import os
import sys
import types
import unittest
from typing import Any, cast
from unittest.mock import Mock, patch

import vercel_runtime.workers as vrw


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


class TestBootstrapQueueServiceApp(unittest.TestCase):
    def test_returns_vercel_queue_asgi_app(self) -> None:
        expected_app = object()
        queue_mod = types.ModuleType("vercel.queue")
        cast("Any", queue_mod).asgi_app = Mock(return_value=expected_app)
        vercel_mod = types.ModuleType("vercel")
        cast("Any", vercel_mod).queue = queue_mod

        with patch.dict(
            sys.modules, {"vercel": vercel_mod, "vercel.queue": queue_mod}
        ):
            app = vrw.bootstrap_queue_service_app()

        self.assertIs(app, expected_app)

    def test_raises_when_vercel_queue_is_missing(self) -> None:
        with (
            patch.dict(sys.modules, {"vercel": None, "vercel.queue": None}),
            self.assertRaisesRegex(
                RuntimeError,
                "Unable to bootstrap queue service because "
                '"vercel-queue" is missing',
            ),
        ):
            vrw.bootstrap_queue_service_app()


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
