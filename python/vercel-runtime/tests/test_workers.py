from __future__ import annotations

import os
import sys
import types
import unittest
from unittest.mock import Mock, patch

import vercel_runtime.workers as vrw


def _mock_transport_modules(install_alias: Mock) -> dict[str, types.ModuleType]:
    vercel_module = types.ModuleType("vercel")
    workers_module = types.ModuleType("vercel.workers")
    celery_module = types.ModuleType("vercel.workers.celery")
    transport_module = types.ModuleType("vercel.workers.celery.transport")

    for module in (vercel_module, workers_module, celery_module):
        module.__dict__["__path__"] = []

    vercel_module.__dict__["workers"] = workers_module
    workers_module.__dict__["celery"] = celery_module
    celery_module.__dict__["transport"] = transport_module
    transport_module.__dict__["install_kombu_transport_alias"] = install_alias

    return {
        "vercel": vercel_module,
        "vercel.workers": workers_module,
        "vercel.workers.celery": celery_module,
        "vercel.workers.celery.transport": transport_module,
    }


class TestPrepareCeleryEnvironment(unittest.TestCase):
    def test_defaults_celery_broker_url_for_worker_services(self) -> None:
        install_alias = Mock()

        with (
            patch.dict(
                os.environ,
                {"VERCEL_HAS_WORKER_SERVICES": "1"},
                clear=True,
            ),
            patch.dict(sys.modules, _mock_transport_modules(install_alias)),
        ):
            vrw.prepare_celery_environment()
            self.assertEqual(
                os.environ.get("CELERY_BROKER_URL"),
                vrw.VERCEL_CELERY_BROKER_URL,
            )

        install_alias.assert_called_once_with("vercel")

    def test_does_not_override_user_defined_celery_broker_url(self) -> None:
        install_alias = Mock()

        with (
            patch.dict(
                os.environ,
                {
                    "VERCEL_HAS_WORKER_SERVICES": "1",
                    "CELERY_BROKER_URL": "redis://localhost:6379/0",
                },
                clear=True,
            ),
            patch.dict(sys.modules, _mock_transport_modules(install_alias)),
        ):
            vrw.prepare_celery_environment()
            self.assertEqual(
                os.environ.get("CELERY_BROKER_URL"),
                "redis://localhost:6379/0",
            )

        install_alias.assert_called_once_with("vercel")

    def test_registers_aliases_for_user_defined_vercel_broker(self) -> None:
        install_alias = Mock()

        with (
            patch.dict(
                os.environ,
                {"CELERY_BROKER_URL": vrw.VERCEL_CELERY_BROKER_URL},
                clear=True,
            ),
            patch.dict(sys.modules, _mock_transport_modules(install_alias)),
        ):
            vrw.prepare_celery_environment()

        install_alias.assert_called_once_with("vercel")

    def test_skips_setup_without_workers_or_vercel_broker(self) -> None:
        install_alias = Mock()

        with (
            patch.dict(os.environ, {}, clear=True),
            patch.dict(sys.modules, _mock_transport_modules(install_alias)),
        ):
            vrw.prepare_celery_environment()

        install_alias.assert_not_called()
