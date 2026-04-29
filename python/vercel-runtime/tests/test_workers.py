from __future__ import annotations

import os
import types
import unittest
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
                + '"vercel-workers" is missing',
            ),
        ):
            _ = vrw.maybe_bootstrap_worker_service_app(
                types.SimpleNamespace()
            )
