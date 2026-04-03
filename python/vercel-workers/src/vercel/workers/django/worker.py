from __future__ import annotations

import json
import time
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Any

from ..client import MessageMetadata, QueueClient, ReceivedMessage
from .app import _build_queue_client, _execute_task_payload

if TYPE_CHECKING:
    from .backend import VercelQueuesBackend


__all__ = ["PollingWorker", "PollingWorkerConfig"]


@dataclass(frozen=True, slots=True)
class PollingWorkerConfig:
    """Configuration for the Django tasks polling worker."""

    queue_name: str
    consumer_group: str = "default"
    limit: int = 1
    visibility_timeout_seconds: int = 60
    poll_interval_seconds: float = 1.0
    on_error_visibility_timeout_seconds: int | None = None
    timeout: float | None = 10.0
    debug: bool = False
    crash_on_error: bool = False
    ack_on_error: bool = False

    # Retry policy (mirrors DjangoTaskWorkerConfig in app.py).
    max_attempts: int = 3
    retry_backoff_base_seconds: int = 5
    retry_backoff_factor: float = 2.0
    max_retry_delay_seconds: int = 60 * 60

    @classmethod
    def from_backend(
        cls,
        backend: VercelQueuesBackend,
        queue_name: str | None = None,
        **overrides: Any,
    ) -> PollingWorkerConfig:
        """
        Create config from backend options with optional overrides.

        If `queue_name` is not provided, uses the first queue from backend.queues.
        """
        resolved_queue_name: str = queue_name or ""
        if not resolved_queue_name:
            if backend.queues:
                resolved_queue_name = next(iter(backend.queues))
            else:
                raise ValueError(
                    "queue_name is required. Pass queue_name=... or configure "
                    "QUEUES in the backend settings."
                )

        opts = backend.options if isinstance(backend.options, dict) else {}

        cfg = cls(queue_name=str(resolved_queue_name))

        # Apply backend options.
        vto = opts.get("visibility_timeout_seconds")
        if isinstance(vto, int) and vto >= 0:
            cfg = replace(cfg, visibility_timeout_seconds=vto)

        timeout = opts.get("timeout")
        if isinstance(timeout, (int, float)):
            cfg = replace(cfg, timeout=float(timeout))

        max_attempts = opts.get("max_attempts")
        if isinstance(max_attempts, int) and max_attempts >= 1:
            cfg = replace(cfg, max_attempts=max_attempts)

        base = opts.get("retry_backoff_base_seconds")
        if isinstance(base, int) and base >= 0:
            cfg = replace(cfg, retry_backoff_base_seconds=base)

        factor = opts.get("retry_backoff_factor")
        if isinstance(factor, (int, float)) and float(factor) >= 0:
            cfg = replace(cfg, retry_backoff_factor=float(factor))

        max_delay = opts.get("max_retry_delay_seconds")
        if isinstance(max_delay, int) and max_delay >= 0:
            cfg = replace(cfg, max_retry_delay_seconds=max_delay)

        # Apply explicit overrides.
        for key, value in overrides.items():
            if hasattr(cfg, key) and value is not None:
                cfg = replace(cfg, **{key: value})

        return cfg


class PollingWorker:
    """
    Long-lived polling worker for consuming Django tasks from Vercel Queues.

    This is intended for local development or non-serverless environments.

    Usage:
        from vercel.workers.django.worker import PollingWorker
        from django.tasks import task_backends

        backend = task_backends["default"]
        worker = PollingWorker(backend, queue_name="tasks")
        worker.start()  # Blocks and polls indefinitely
    """

    def __init__(
        self,
        backend: VercelQueuesBackend,
        *,
        queue_name: str | None = None,
        consumer_group: str = "default",
        limit: int = 1,
        visibility_timeout_seconds: int = 60,
        poll_interval_seconds: float = 1.0,
        on_error_visibility_timeout_seconds: int | None = None,
        timeout: float | None = 10.0,
        debug: bool = False,
        crash_on_error: bool = False,
        ack_on_error: bool = False,
    ) -> None:
        self.backend = backend
        self.cfg = PollingWorkerConfig.from_backend(
            backend,
            queue_name=queue_name,
            consumer_group=consumer_group,
            limit=limit,
            visibility_timeout_seconds=visibility_timeout_seconds,
            poll_interval_seconds=poll_interval_seconds,
            on_error_visibility_timeout_seconds=on_error_visibility_timeout_seconds,
            timeout=timeout,
            debug=debug,
            crash_on_error=crash_on_error,
            ack_on_error=ack_on_error,
        )
        self._stop_requested = False
        self.client: QueueClient = _build_queue_client(backend)

    def stop(self) -> None:
        """Signal the worker to stop after the current poll cycle."""
        self._stop_requested = True

    def run_once(self) -> int:
        """
        Poll for messages and process them.

        Returns the number of messages processed.
        """
        messages = self.client.receive(
            self.cfg.queue_name,
            self.cfg.consumer_group,
            limit=self.cfg.limit,
            visibility_timeout_seconds=self.cfg.visibility_timeout_seconds,
        )

        if not messages:
            time.sleep(max(0.0, float(self.cfg.poll_interval_seconds)))
            return 0

        processed = 0
        for msg in messages:
            self._process_message(msg)
            processed += 1
        return processed

    def start(self) -> None:
        """Start the polling loop. Blocks until stop() is called."""
        while not self._stop_requested:
            self.run_once()

    def _process_message(self, msg: ReceivedMessage) -> None:
        message_id = msg["messageId"]
        receipt_handle = msg["receiptHandle"]
        payload = msg["payload"]

        try:
            if self.cfg.debug:
                self._debug_log_received(msg)
            metadata: MessageMetadata = {
                "messageId": message_id,
                "deliveryCount": msg["deliveryCount"],
                "createdAt": msg["createdAt"],
                "expiresAt": msg.get("expiresAt"),
                "topicName": self.cfg.queue_name,
                "consumerGroup": self.cfg.consumer_group,
                "region": self.client.region,
            }
            outcome = _execute_task_payload(self.backend, self.cfg, payload, metadata)
            if isinstance(outcome, dict) and outcome.get("acknowledge"):
                self.client.acknowledge(
                    self.cfg.queue_name,
                    self.cfg.consumer_group,
                    receipt_handle,
                )
                return

            timeout_seconds = None
            if isinstance(outcome, dict) and "timeoutSeconds" in outcome:
                try:
                    timeout_seconds = int(outcome["timeoutSeconds"])
                except (TypeError, ValueError):
                    timeout_seconds = None

            if timeout_seconds is not None:
                self.client.change_visibility(
                    self.cfg.queue_name,
                    self.cfg.consumer_group,
                    receipt_handle,
                    timeout_seconds,
                )
                if self.cfg.debug:
                    print(
                        f"[django-tasks polling] delaying message {message_id} "
                        f"for {timeout_seconds}s"
                    )
                return

            self.client.acknowledge(
                self.cfg.queue_name,
                self.cfg.consumer_group,
                receipt_handle,
            )
            if self.cfg.debug:
                print(f"[django-tasks polling] completed message {message_id}")

        except Exception as exc:  # noqa: BLE001
            if self.cfg.debug:
                print(f"[django-tasks polling] error processing message {message_id}: {exc!r}")

            if self.cfg.ack_on_error:
                try:
                    self.client.acknowledge(
                        self.cfg.queue_name,
                        self.cfg.consumer_group,
                        receipt_handle,
                    )
                except Exception:
                    pass
                return

            if self.cfg.on_error_visibility_timeout_seconds is not None:
                try:
                    self.client.change_visibility(
                        self.cfg.queue_name,
                        self.cfg.consumer_group,
                        receipt_handle,
                        int(self.cfg.on_error_visibility_timeout_seconds),
                    )
                except Exception:
                    pass

            if self.cfg.crash_on_error:
                raise

    def _debug_log_received(self, msg: ReceivedMessage) -> None:
        """Log received message details for debugging."""
        try:
            print(
                "[django-tasks polling] received message",
                json.dumps(
                    {
                        "queue": self.cfg.queue_name,
                        "consumer": self.cfg.consumer_group,
                        "messageId": msg["messageId"],
                        "deliveryCount": msg.get("deliveryCount"),
                        "createdAt": msg.get("createdAt"),
                        "expiresAt": msg.get("expiresAt"),
                        "contentType": msg.get("contentType"),
                        "receiptHandle": msg["receiptHandle"],
                    },
                    indent=2,
                    default=str,
                ),
            )
        except Exception:
            print(
                "[django-tasks polling] received message (unserialisable)",
                {"messageId": msg["messageId"]},
            )
