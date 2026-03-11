from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import vercel_runtime.workers as vrw


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
