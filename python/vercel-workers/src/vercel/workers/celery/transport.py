from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal

from ..client import send
from .utils import _extract_task_from_kombu_message

try:
    from kombu.transport import TRANSPORT_ALIASES, virtual  # type: ignore[import-untyped]
except Exception as e:
    raise RuntimeError(
        "kombu is required for vercelqueue:// broker support. "
        "Make sure Celery and its dependencies are installed.",
    ) from e


def install_kombu_transport_alias(alias: str = "vercelqueue") -> None:
    """
    Register the Kombu transport alias for this package.

    Celery resolves broker URL schemes using ``kombu.transport.TRANSPORT_ALIASES``.
    Because we cannot ship modules under the ``kombu`` package, we register the alias
    at runtime.

    After calling this, users can set:

        broker_url = "vercelqueue://"
    """

    # Use the actual import path so vendored/relocated packages keep working.
    TRANSPORT_ALIASES[alias] = f"{Transport.__module__}:Transport"


@dataclass
class TransportConfig:
    """
    Transport configuration derived from Kombu connection/client settings.
    """

    # Default idempotency behaviour: use task id when available
    use_task_id_as_idempotency_key: bool = True
    token: str | None = None
    base_url: str | None = None
    base_path: str | None = None
    retention_seconds: int | None = None
    deployment_id: str | None = None
    timeout: float | None = 10.0
    include_raw_message: bool = False
    # Consumption defaults (serverless callback / local polling)
    visibility_timeout_seconds: int = 30
    visibility_refresh_interval_seconds: float = 10.0

    @classmethod
    def from_transport_options(cls, options: dict[str, Any]) -> TransportConfig:
        """
        Create config from Celery's broker transport options.

        Users can set:
            celery_app.conf.broker_transport_options = {
                "use_task_id_as_idempotency_key": True,
                "token": "...",
                "base_url": "https://vercel-queue.com",
                "base_path": "/api/v2/messages",
                "retention_seconds": 86400,
                "deployment_id": "...",
                "timeout": 10.0,
                "include_raw_message": False,
                "visibility_timeout_seconds": 30,
                "visibility_refresh_interval_seconds": 10.0,
            }
        """

        cfg = cls()

        use_task_id = options.get(
            "use_task_id_as_idempotency_key",
            cfg.use_task_id_as_idempotency_key,
        )
        if isinstance(use_task_id, bool):
            cfg.use_task_id_as_idempotency_key = use_task_id

        token = options.get("token")
        if isinstance(token, str) and token:
            cfg.token = token

        base_url = options.get("base_url")
        if isinstance(base_url, str) and base_url:
            cfg.base_url = base_url

        base_path = options.get("base_path")
        if isinstance(base_path, str) and base_path:
            cfg.base_path = base_path

        retention = options.get("retention_seconds")
        if isinstance(retention, int):
            cfg.retention_seconds = retention

        deployment_id = options.get("deployment_id")
        if isinstance(deployment_id, str) and deployment_id:
            cfg.deployment_id = deployment_id

        timeout = options.get("timeout")
        if isinstance(timeout, (int, float)):
            cfg.timeout = float(timeout)

        include_raw_message = options.get("include_raw_message")
        if isinstance(include_raw_message, bool):
            cfg.include_raw_message = include_raw_message

        visibility_timeout_seconds = options.get("visibility_timeout_seconds")
        if isinstance(visibility_timeout_seconds, int) and visibility_timeout_seconds >= 0:
            cfg.visibility_timeout_seconds = visibility_timeout_seconds

        refresh_interval = options.get("visibility_refresh_interval_seconds")
        if isinstance(refresh_interval, (int, float)):
            cfg.visibility_refresh_interval_seconds = float(refresh_interval)

        return cfg


class Channel(virtual.Channel):
    """
    Kombu transport channel for publishing Celery tasks into Vercel Queues.

    Note: In Vercel deployments, task consumption is performed by queue triggers
    (HTTP callbacks) and the callback app returned by
    `vercel.workers.celery.get_wsgi_app(...)` / `vercel.workers.celery.get_asgi_app(...)`,
    not by running `celery worker` to poll the broker.
    """

    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)
        transport_options = getattr(self.connection, "transport_options", {})
        self._cfg = TransportConfig.from_transport_options(transport_options)

    def _put(self, queue: str, message: dict[str, Any], **kwargs: Any) -> None:
        envelope = _extract_task_from_kombu_message(
            message,
            include_raw=self._cfg.include_raw_message,
        )
        task_id = envelope.get("id")

        # Use Celery's task id for idempotency by default.
        idempotency_key = task_id if self._cfg.use_task_id_as_idempotency_key else None

        if os.environ.get("VWC_DEBUG_PUBLISH") not in {None, "", "0", "false", "FALSE"}:
            try:
                print(
                    "[vercelqueue publish] kombu message keys/types:",
                    {k: type(v).__name__ for k, v in message.items()},
                )
                print(
                    "[vercelqueue publish] kombu message headers:",
                    message.get("headers"),
                )
                print(
                    "[vercelqueue publish] kombu message body type:",
                    type(message.get("body")).__name__,
                )
                print(
                    "[vercelqueue publish] envelope:",
                    json.dumps(envelope, indent=2, default=str),
                )
            except Exception:
                print("[vercelqueue publish] debug print failed")

        send(
            queue,
            envelope,
            idempotency_key=idempotency_key,
            retention_seconds=self._cfg.retention_seconds,
            deployment_id=self._cfg.deployment_id,
            token=self._cfg.token,
            base_url=self._cfg.base_url,
            base_path=self._cfg.base_path,
            timeout=self._cfg.timeout,
        )

    def _get(self, queue: str, timeout: float | None = None) -> dict[str, Any]:
        raise NotImplementedError(
            "Vercel Queues consumption is event-driven on Vercel. "
            "Deploy a queue callback route using vercel.workers.celery.get_wsgi_app(app) "
            "or get_asgi_app(app) instead of running 'celery worker' to poll.",
        )

    def _size(self, queue: str) -> Literal[0]:
        return 0

    def _purge(self, queue: str) -> int:
        return 0


class Transport(virtual.Transport):
    Channel = Channel
    driver_type = "vercelqueue"
    driver_name = "vercelqueue"
    default_port = 0


__all__ = [
    "Transport",
    "install_kombu_transport_alias",
]
