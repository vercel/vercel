from __future__ import annotations

import json
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from traceback import format_exception
from typing import Any, cast

try:
    from django.tasks.base import (  # type: ignore[import-untyped]
        TaskContext,
        TaskError,
        TaskResultStatus,
    )
    from django.tasks.signals import task_finished, task_started  # type: ignore[import-untyped]
    from django.utils import timezone as dj_timezone  # type: ignore[import-untyped]
except Exception as e:  # pragma: no cover
    raise RuntimeError(
        "django is required to use vercel.workers.django. "
        "Install it with `pip install 'vercel-workers[django]'` or `pip install Django>=6.0`.",
    ) from e

from .. import callback as queue_callback
from ..asgi import build_asgi_app
from ..exceptions import VQSError
from ..wsgi import build_wsgi_app, status_reason
from .backend import DjangoTaskEnvelope, VercelQueuesBackend, _parse_iso_datetime

ASGI = Callable[
    [
        dict[str, Any],
        Callable[[], Awaitable[dict[str, Any]]],
        Callable[[dict[str, Any]], Awaitable[None]],
    ],
    Awaitable[None],
]
WSGI = Callable[[dict[str, Any], Callable[..., Any]], list[bytes]]

__all__ = [
    "DjangoTaskWorkerConfig",
    "get_wsgi_app",
    "get_asgi_app",
    "handle_queue_callback",
]


def _now_utc() -> datetime:
    try:
        return dj_timezone.now()
    except Exception:
        return datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class DjangoTaskWorkerConfig:
    """
    Runtime config used by the callback route.

    This is separate from enqueue-time options; it controls how we receive/lock and retry.
    """

    visibility_timeout_seconds: int = 30
    visibility_refresh_interval_seconds: float = 10.0
    timeout: float | None = 10.0

    # Retry policy for task exceptions.
    max_attempts: int = 3
    retry_backoff_base_seconds: int = 5
    retry_backoff_factor: float = 2.0
    max_retry_delay_seconds: int = 60 * 60

    @classmethod
    def from_backend_options(cls, options: dict[str, Any]) -> DjangoTaskWorkerConfig:
        cfg = cls()
        vto = options.get("visibility_timeout_seconds")
        if isinstance(vto, int) and vto >= 0:
            cfg = replace(cfg, visibility_timeout_seconds=vto)
        vri = options.get("visibility_refresh_interval_seconds")
        if isinstance(vri, (int, float)) and float(vri) >= 0:
            cfg = replace(cfg, visibility_refresh_interval_seconds=float(vri))
        timeout = options.get("timeout")
        if isinstance(timeout, (int, float)):
            cfg = replace(cfg, timeout=float(timeout))
        max_attempts = options.get("max_attempts")
        if isinstance(max_attempts, int) and max_attempts >= 1:
            cfg = replace(cfg, max_attempts=max_attempts)
        base = options.get("retry_backoff_base_seconds")
        if isinstance(base, int) and base >= 0:
            cfg = replace(cfg, retry_backoff_base_seconds=base)
        factor = options.get("retry_backoff_factor")
        if isinstance(factor, (int, float)) and float(factor) >= 0:
            cfg = replace(cfg, retry_backoff_factor=float(factor))
        max_delay = options.get("max_retry_delay_seconds")
        if isinstance(max_delay, int) and max_delay >= 0:
            cfg = replace(cfg, max_retry_delay_seconds=max_delay)
        return cfg


def get_wsgi_app(*, backend_alias: str = "default") -> WSGI:
    """
    Build a WSGI callback app that executes `django.tasks` tasks from Vercel Queue callbacks.

    Usage: configure a Vercel Queue trigger to POST CloudEvents to this route.
    """
    backend = _resolve_backend(backend_alias)
    return build_wsgi_app(lambda raw_body: handle_queue_callback(backend, raw_body))


def get_asgi_app(*, backend_alias: str = "default") -> ASGI:
    """ASGI variant of get_wsgi_app()."""
    backend = _resolve_backend(backend_alias)
    return build_asgi_app(lambda raw_body: handle_queue_callback(backend, raw_body))


def _resolve_backend(alias: str) -> VercelQueuesBackend:
    from django.tasks import task_backends  # type: ignore[import-untyped]

    backend = task_backends[alias]
    if not isinstance(backend, VercelQueuesBackend):
        raise TypeError(
            f"Backend {alias!r} is {backend.__class__.__name__}, expected VercelQueuesBackend."
        )
    return backend


def _retry_delay_seconds(cfg: DjangoTaskWorkerConfig, attempt: int) -> int:
    """
    Compute retry delay with exponential backoff.

    attempt is 1-based.
    """
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


def _parse_envelope(payload: Any) -> DjangoTaskEnvelope:
    if not isinstance(payload, dict):
        raise ValueError("Invalid task payload: expected object")
    vercel_info = payload.get("vercel")
    if not isinstance(vercel_info, dict) or vercel_info.get("kind") != "django-tasks":
        raise ValueError("Invalid task payload: not a django-tasks envelope")
    return cast(DjangoTaskEnvelope, payload)


def handle_queue_callback(
    backend: VercelQueuesBackend,
    raw_body: bytes,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """
    Core callback handler shared by WSGI/ASGI wrappers.

    Returns: (status_code, headers, body_bytes)
    """
    extender: queue_callback.VisibilityExtender | None = None
    cfg = DjangoTaskWorkerConfig.from_backend_options(
        backend.options if isinstance(backend.options, dict) else {},
    )

    try:
        queue_name, consumer_group, message_id = queue_callback.parse_cloudevent(raw_body)

        # Fail fast on unexpected queues to avoid executing arbitrary payloads.
        if backend.queues and queue_name not in backend.queues:
            body = json.dumps(
                {"error": "invalid-queue", "queue": queue_name, "backend": backend.alias}
            ).encode("utf-8")
            return (
                500,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
            )

        payload, delivery_count, created_at, ticket = queue_callback.receive_message_by_id(
            queue_name,
            consumer_group,
            message_id,
            visibility_timeout_seconds=cfg.visibility_timeout_seconds,
            timeout=cfg.timeout,
        )

        # Keep the message locked while executing.
        if ticket:
            extender = queue_callback.VisibilityExtender(
                queue_name,
                consumer_group,
                message_id,
                ticket,
                visibility_timeout_seconds=cfg.visibility_timeout_seconds,
                refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
                timeout=cfg.timeout,
            )
            extender.start()

        env = _parse_envelope(payload)
        task_info: dict[str, Any] = cast(dict[str, Any], env.get("task") or {})
        module_path = str(task_info.get("module_path") or "")
        takes_context = bool(task_info.get("takes_context", False))
        run_after_raw = task_info.get("run_after")
        run_after = _parse_iso_datetime(run_after_raw) if isinstance(run_after_raw, str) else None

        # Support `run_after` by delaying the message when it becomes visible too early.
        if run_after is not None:
            now = _now_utc()
            if run_after > now:
                delay_seconds = int(max(0.0, (run_after - now).total_seconds()))
                if ticket:
                    _finalize_visibility(
                        extender,
                        lambda: queue_callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            ticket,
                            delay_seconds,
                            timeout=cfg.timeout,
                        ),
                    )
                body = json.dumps(
                    {
                        "ok": True,
                        "delayed": True,
                        "timeoutSeconds": delay_seconds,
                        "queue": queue_name,
                        "consumer": consumer_group,
                        "messageId": message_id,
                        "deliveryCount": delivery_count,
                        "createdAt": created_at,
                    }
                ).encode("utf-8")
                return (
                    200,
                    [
                        ("Content-Type", "application/json"),
                        ("Content-Length", str(len(body))),
                    ],
                    body,
                )

        # Load or create TaskResult record.
        task_result = backend._load_or_init_result_from_envelope(
            message_id=message_id,
            envelope=env,
        )

        # (Re)construct Task from the payload. We keep priority/queue_name from the envelope
        # so validation applies consistently.
        env_queue_name = str(task_info.get("queue_name") or queue_name)
        env_priority = int(task_info.get("priority", 0))
        task = backend._task_from_module_path(
            module_path=module_path,
            queue_name=env_queue_name,
            takes_context=takes_context,
            priority=env_priority,
            run_after=None,
        )
        object.__setattr__(task_result, "task", task)
        object.__setattr__(task_result, "args", env.get("args") or [])
        object.__setattr__(task_result, "kwargs", env.get("kwargs") or {})

        # Mark started (counts as an attempt).
        backend._mark_started(task_result, worker_id=backend.worker_id)
        task_started.send(sender=type(backend), task_result=task_result)

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
            # Record the attempt error.
            exception_type = type(exc)
            task_result.errors.append(
                TaskError(
                    exception_class_path=f"{exception_type.__module__}.{exception_type.__qualname__}",
                    traceback="".join(format_exception(exc)),
                )
            )

            attempt = len(task_result.worker_ids)
            if attempt < int(cfg.max_attempts):
                delay_seconds = _retry_delay_seconds(cfg, attempt)
                object.__setattr__(task_result, "status", TaskResultStatus.READY)
                # Don't set finished_at for non-terminal failures.
                object.__setattr__(task_result, "finished_at", None)
                backend._store_result(task_result)
                if ticket:
                    _finalize_visibility(
                        extender,
                        lambda: queue_callback.change_visibility(
                            queue_name,
                            consumer_group,
                            message_id,
                            ticket,
                            int(delay_seconds),
                            timeout=cfg.timeout,
                        ),
                    )
                body = json.dumps(
                    {
                        "ok": True,
                        "delayed": True,
                        "timeoutSeconds": int(delay_seconds),
                        "queue": queue_name,
                        "consumer": consumer_group,
                        "messageId": message_id,
                        "deliveryCount": delivery_count,
                        "createdAt": created_at,
                        "status": str(TaskResultStatus.READY),
                    }
                ).encode("utf-8")
                return (
                    200,
                    [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                    body,
                )

            # Terminal failure: mark FAILED and ack (delete).
            backend._mark_failed(task_result, exc)
            task_finished.send(sender=type(backend), task_result=task_result)
            if ticket:
                _finalize_visibility(
                    extender,
                    lambda: queue_callback.delete_message(
                        queue_name,
                        consumer_group,
                        message_id,
                        ticket,
                        timeout=cfg.timeout,
                    ),
                )
            body = json.dumps(
                {
                    "ok": True,
                    "queue": queue_name,
                    "consumer": consumer_group,
                    "messageId": message_id,
                    "deliveryCount": delivery_count,
                    "createdAt": created_at,
                    "status": str(TaskResultStatus.FAILED),
                }
            ).encode("utf-8")
            return (
                200,
                [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
                body,
            )

        # Success path.
        backend._mark_finished_success(task_result, raw_return_value)
        task_finished.send(sender=type(backend), task_result=task_result)

        if ticket:
            _finalize_visibility(
                extender,
                lambda: queue_callback.delete_message(
                    queue_name,
                    consumer_group,
                    message_id,
                    ticket,
                    timeout=cfg.timeout,
                ),
            )

        body = json.dumps(
            {
                "ok": True,
                "queue": queue_name,
                "consumer": consumer_group,
                "messageId": message_id,
                "deliveryCount": delivery_count,
                "createdAt": created_at,
                "status": str(TaskResultStatus.SUCCESSFUL),
            }
        ).encode("utf-8")
        return (
            200,
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )

    except ValueError as exc:
        err = json.dumps(
            {"error": str(exc), "type": exc.__class__.__name__},
        ).encode("utf-8")
        return (
            400,
            [
                ("Content-Type", "application/json"),
                ("Content-Length", str(len(err))),
            ],
            err,
        )
    except VQSError as exc:
        # Queue service errors (locked, not found, etc.)
        status_code = getattr(exc, "status_code", None) or 500
        err_payload: dict[str, Any] = {"error": str(exc), "type": exc.__class__.__name__}

        retry_after = getattr(exc, "retry_after", None)
        if isinstance(retry_after, int):
            err_payload["retryAfter"] = retry_after

        body = json.dumps(err_payload).encode("utf-8")
        reason = status_reason(int(status_code))
        print(
            f"vercel.workers.django.handle_queue_callback error ({int(status_code)} {reason}):",
            repr(exc),
        )
        return (
            int(status_code),
            [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
            body,
        )
    except Exception as exc:  # noqa: BLE001
        print(
            f"vercel.workers.django.handle_queue_callback error ({500} {status_reason(500)}):",
            repr(exc),
        )
        err = json.dumps({"error": "internal"}).encode("utf-8")
        return (
            500,
            [
                ("Content-Type", "application/json"),
                ("Content-Length", str(len(err))),
            ],
            err,
        )
    finally:
        if extender is not None:
            extender.stop()


def _finalize_visibility(
    extender: queue_callback.VisibilityExtender | None,
    fn: Callable[[], None],
) -> None:
    if extender is not None:
        extender.finalize(fn)
    else:
        fn()
