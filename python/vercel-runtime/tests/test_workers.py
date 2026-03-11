from __future__ import annotations

import os
import types
import unittest
from unittest.mock import Mock, patch

import vercel_runtime.workers as vrw


class TestPrepareCeleryEnvironment(unittest.TestCase):
    def test_defaults_celery_broker_url_for_worker_services(self) -> None:
        install_alias = Mock()
        transport_module = types.SimpleNamespace(install_kombu_transport_alias=install_alias)

        with (
            patch.dict(
                os.environ,
                {vrw.VERCEL_HAS_WORKER_SERVICES_ENV: "1"},
                clear=True,
            ),
            patch.object(vrw, "_import_optional_module", return_value=transport_module),
        ):
            vrw.prepare_celery_environment()
            self.assertEqual(
                os.environ.get(vrw.CELERY_BROKER_URL_ENV),
                vrw.DEFAULT_CELERY_BROKER_URL,
            )

        install_alias.assert_called_once_with("vercel")

    def test_does_not_override_user_defined_celery_broker_url(self) -> None:
        install_alias = Mock()
        transport_module = types.SimpleNamespace(install_kombu_transport_alias=install_alias)

        with (
            patch.dict(
                os.environ,
                {
                    vrw.VERCEL_HAS_WORKER_SERVICES_ENV: "1",
                    vrw.CELERY_BROKER_URL_ENV: "redis://localhost:6379/0",
                },
                clear=True,
            ),
            patch.object(vrw, "_import_optional_module", return_value=transport_module),
        ):
            vrw.prepare_celery_environment()
            self.assertEqual(
                os.environ.get(vrw.CELERY_BROKER_URL_ENV),
                "redis://localhost:6379/0",
            )

        install_alias.assert_called_once_with("vercel")

    def test_registers_aliases_for_user_defined_vercel_broker(self) -> None:
        install_alias = Mock()
        transport_module = types.SimpleNamespace(install_kombu_transport_alias=install_alias)

        with (
            patch.dict(
                os.environ,
                {vrw.CELERY_BROKER_URL_ENV: vrw.DEFAULT_CELERY_BROKER_URL},
                clear=True,
            ),
            patch.object(vrw, "_import_optional_module", return_value=transport_module),
        ):
            vrw.prepare_celery_environment()

        install_alias.assert_called_once_with("vercel")

    def test_skips_setup_without_workers_or_vercel_broker(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(vrw, "_import_optional_module") as import_optional_module,
        ):
            vrw.prepare_celery_environment()

        import_optional_module.assert_not_called()
