from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from traceback import format_exception
from typing import TYPE_CHECKING, Any, cast

from .. import callback as queue_callback
from ..exceptions import VQSError

if TYPE_CHECKING:
    from .backend import DjangoTaskEnvelope, VercelQueuesBackend

try:
    from django.tasks.base import (  # type: ignore[import-untyped]
        TaskContext,
        TaskError,
        TaskResultStatus,
    )
    from django.tasks.signals import task_finished, task_started  # type: ignore[import-untyped]
    from django.utils import timezone as dj_timezone  # type: ignore[import-untyped]
except Exception as e:
    raise RuntimeError(
        "django is required to use vercel.workers.django.worker. "
        "Install it with `pip install 'vercel-workers[django]'` or `pip install Django>=6.0`.",
    ) from e


__all__ = ["PollingWorker", "PollingWorkerConfig"]


def _now_utc() -> datetime:
    try:
        return dj_timezone.now()
    except Exception:
        return datetime.now(UTC)


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


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


def _retry_delay_seconds(cfg: PollingWorkerConfig, attempt: int) -> int:
    """Compute retry delay with exponential backoff."""
    delay: float
    base = float(cfg.retry_backoff_base_seconds)
    factor = float(cfg.retry_backoff_factor)
    if attempt <= 1:
        delay = base
    else:
        delay = base * math.pow(factor, attempt - 1)
    if not math.isfinite(delay):
        delay = float(cfg.max_retry_delay_seconds)
    return int(max(0, min(float(cfg.max_retry_delay_seconds), delay)))


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

    def stop(self) -> None:
        """Signal the worker to stop after the current poll cycle."""
        self._stop_requested = True

    def run_once(self) -> int:
        """
        Poll for messages and process them.

        Returns the number of messages processed.
        """
        messages = queue_callback.receive_messages(
            self.cfg.queue_name,
            self.cfg.consumer_group,
            limit=self.cfg.limit,
            visibility_timeout_seconds=self.cfg.visibility_timeout_seconds,
            timeout=self.cfg.timeout,
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

    def _process_message(self, msg: queue_callback.ReceivedMessage) -> None:
        message_id = msg["messageId"]
        ticket = msg["ticket"]
        payload = msg["payload"]

        try:
            if self.cfg.debug:
                self._debug_log_received(msg)

            env = self._parse_envelope(payload)
            task_info: dict[str, Any] = env.get("task") or {}
            run_after_raw = task_info.get("run_after")
            run_after = (
                _parse_iso_datetime(run_after_raw) if isinstance(run_after_raw, str) else None
            )

            # Handle run_after delay.
            if run_after is not None:
                now = _now_utc()
                if run_after > now:
                    delay_seconds = int(max(0.0, (run_after - now).total_seconds()))
                    queue_callback.change_visibility(
                        self.cfg.queue_name,
                        self.cfg.consumer_group,
                        message_id,
                        ticket,
                        delay_seconds,
                        timeout=self.cfg.timeout,
                    )
                    if self.cfg.debug:
                        print(
                            f"[django-tasks polling] delaying message {message_id} "
                            f"for {delay_seconds}s (run_after)"
                        )
                    return

            # Load or init TaskResult.
            task_result = self.backend._load_or_init_result_from_envelope(
                message_id=message_id,
                envelope=cast("DjangoTaskEnvelope", env),
            )

            # Reconstruct task.
            module_path = str(task_info.get("module_path") or "")
            queue_name = str(task_info.get("queue_name") or self.cfg.queue_name)
            takes_context = bool(task_info.get("takes_context", False))
            priority = int(task_info.get("priority", 0))
            task = self.backend._task_from_module_path(
                module_path=module_path,
                queue_name=queue_name,
                takes_context=takes_context,
                priority=priority,
                run_after=None,
            )
            object.__setattr__(task_result, "task", task)
            object.__setattr__(task_result, "args", env.get("args") or [])
            object.__setattr__(task_result, "kwargs", env.get("kwargs") or {})

            # Mark started.
            self.backend._mark_started(task_result, worker_id=self.backend.worker_id)
            task_started.send(sender=type(self.backend), task_result=task_result)

            try:
                # Execute task.
                if task.takes_context:
                    raw_return_value = task.call(
                        TaskContext(task_result=task_result),
                        *task_result.args,
                        **task_result.kwargs,
                    )
                else:
                    raw_return_value = task.call(*task_result.args, **task_result.kwargs)
            except KeyboardInterrupt:
                raise
            except BaseException as exc:
                self._handle_task_error(
                    task_result=task_result,
                    exc=exc,
                    message_id=message_id,
                    ticket=ticket,
                )
                return

            # Success: mark finished and ack.
            self.backend._mark_finished_success(task_result, raw_return_value)
            task_finished.send(sender=type(self.backend), task_result=task_result)

            queue_callback.delete_message(
                self.cfg.queue_name,
                self.cfg.consumer_group,
                message_id,
                ticket,
                timeout=self.cfg.timeout,
            )

            if self.cfg.debug:
                print(
                    f"[django-tasks polling] completed task {task_result.task.module_path} "
                    f"(message {message_id})"
                )

        except VQSError as exc:
            # Queue service errors (locked, not found, throttled, etc.)
            if self.cfg.debug:
                print(f"[django-tasks polling] queue service error for {message_id}: {exc!r}")
            # Don't ack on queue errors - let visibility timeout handle retry
            if self.cfg.crash_on_error:
                raise

        except Exception as exc:  # noqa: BLE001
            if self.cfg.debug:
                print(f"[django-tasks polling] error processing message {message_id}: {exc!r}")

            if self.cfg.ack_on_error:
                try:
                    queue_callback.delete_message(
                        self.cfg.queue_name,
                        self.cfg.consumer_group,
                        message_id,
                        ticket,
                        timeout=self.cfg.timeout,
                    )
                except Exception:
                    pass
                return

            if self.cfg.on_error_visibility_timeout_seconds is not None:
                try:
                    queue_callback.change_visibility(
                        self.cfg.queue_name,
                        self.cfg.consumer_group,
                        message_id,
                        ticket,
                        int(self.cfg.on_error_visibility_timeout_seconds),
                        timeout=self.cfg.timeout,
                    )
                except Exception:
                    pass

            if self.cfg.crash_on_error:
                raise

    def _handle_task_error(
        self,
        *,
        task_result: Any,  # TaskResult
        exc: BaseException,
        message_id: str,
        ticket: str,
    ) -> None:
        """Handle task execution error with retry logic."""
        # Record the error.
        exception_type = type(exc)
        task_result.errors.append(
            TaskError(
                exception_class_path=f"{exception_type.__module__}.{exception_type.__qualname__}",
                traceback="".join(format_exception(exc)),
            )
        )

        attempt = len(task_result.worker_ids)

        if attempt < int(self.cfg.max_attempts):
            delay_seconds = _retry_delay_seconds(self.cfg, attempt)
            object.__setattr__(task_result, "status", TaskResultStatus.READY)
            object.__setattr__(task_result, "finished_at", None)
            self.backend._store_result(task_result)

            queue_callback.change_visibility(
                self.cfg.queue_name,
                self.cfg.consumer_group,
                message_id,
                ticket,
                int(delay_seconds),
                timeout=self.cfg.timeout,
            )

            if self.cfg.debug:
                print(
                    f"[django-tasks polling] task failed "
                    f"(attempt {attempt}/{self.cfg.max_attempts}), "
                    f"retrying in {delay_seconds}s: {exc!r}"
                )
        else:
            # Terminal failure.
            self.backend._mark_failed(task_result, exc)
            task_finished.send(sender=type(self.backend), task_result=task_result)

            queue_callback.delete_message(
                self.cfg.queue_name,
                self.cfg.consumer_group,
                message_id,
                ticket,
                timeout=self.cfg.timeout,
            )

            if self.cfg.debug:
                print(
                    f"[django-tasks polling] task failed permanently "
                    f"(attempt {attempt}/{self.cfg.max_attempts}): {exc!r}"
                )

    def _parse_envelope(self, payload: Any) -> dict[str, Any]:
        """Parse and validate the task envelope."""
        if not isinstance(payload, dict):
            raise ValueError("Invalid task payload: expected object")
        vercel_info = payload.get("vercel")
        if not isinstance(vercel_info, dict) or vercel_info.get("kind") != "django-tasks":
            raise ValueError("Invalid task payload: not a django-tasks envelope")
        return payload  # type: ignore[return-value]

    def _debug_log_received(self, msg: queue_callback.ReceivedMessage) -> None:
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
                        "contentType": msg.get("contentType"),
                        "ticket": msg["ticket"],
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
