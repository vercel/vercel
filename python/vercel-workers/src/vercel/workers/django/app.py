from __future__ import annotations

import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from traceback import format_exception
from typing import Any, cast

try:
    from django.tasks.base import (  # type: ignore[import-untyped, import-not-found]
        TaskContext,
        TaskError,
        TaskResultStatus,
    )
    from django.tasks.signals import (  # type: ignore[import-untyped, import-not-found]
        task_finished,
        task_started,
    )
    from django.utils import timezone as dj_timezone  # type: ignore[import-untyped, import-not-found]
except Exception as e:  # pragma: no cover
    raise RuntimeError(
        "django is required to use vercel.workers.django. "
        "Install it with `pip install 'vercel-workers[django]'` or `pip install Django>=6.0`.",
    ) from e

from .. import callback as queue_callback
from .._internal.queue_api import compose_base_url
from ..asgi import build_asgi_app
from ..client import MessageMetadata, QueueClient
from ..exceptions import InternalServerError
from ..wsgi import build_wsgi_app
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
    return build_wsgi_app(
        lambda raw_body, headers: handle_queue_callback(backend, raw_body, headers)
    )


def get_asgi_app(*, backend_alias: str = "default") -> ASGI:
    """ASGI variant of get_wsgi_app()."""
    backend = _resolve_backend(backend_alias)
    return build_asgi_app(
        lambda raw_body, headers: handle_queue_callback(backend, raw_body, headers)
    )


def _resolve_backend(alias: str) -> VercelQueuesBackend:
    from django.tasks import task_backends  # type: ignore[import-untyped, import-not-found]

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


def _build_queue_client(backend: VercelQueuesBackend) -> QueueClient:
    return QueueClient(
        token=backend._cfg.token,
        base_url=compose_base_url(backend._cfg.base_url, backend._cfg.base_path),
        deployment_id=backend._cfg.deployment_id,
        timeout=backend._cfg.timeout,
    )


def _execute_task_payload(
    backend: VercelQueuesBackend,
    cfg: DjangoTaskWorkerConfig,
    payload: Any,
    metadata: MessageMetadata,
) -> queue_callback.RetryDirective | None:
    if backend.queues and metadata["topicName"] not in backend.queues:
        raise InternalServerError(
            f"Queue {metadata['topicName']!r} is not configured for backend {backend.alias!r}",
        )

    env = _parse_envelope(payload)
    task_info: dict[str, Any] = cast(dict[str, Any], env.get("task") or {})
    run_after_raw = task_info.get("run_after")
    run_after = _parse_iso_datetime(run_after_raw) if isinstance(run_after_raw, str) else None
    if run_after is not None:
        now = _now_utc()
        if run_after > now:
            return {"timeoutSeconds": int(max(0.0, (run_after - now).total_seconds()))}

    task_result = backend._load_or_init_result_from_envelope(
        message_id=metadata["messageId"],
        envelope=env,
    )

    module_path = str(task_info.get("module_path") or "")
    queue_name = str(task_info.get("queue_name") or metadata["topicName"])
    takes_context = bool(task_info.get("takes_context", False))
    priority = int(task_info.get("priority", 0))
    task = backend._task_from_module_path(
        module_path=module_path,
        queue_name=queue_name,
        takes_context=takes_context,
        priority=priority,
        run_after=None,
    )
    object.__setattr__(task_result, "task", task)
    object.__setattr__(task_result, "args", env.get("args") or [])
    object.__setattr__(task_result, "kwargs", env.get("kwargs") or {})

    backend._mark_started(task_result, worker_id=backend.worker_id)
    task_started.send(sender=type(backend), task_result=task_result)

    try:
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
        attempt = len(task_result.worker_ids)
        if attempt < int(cfg.max_attempts):
            exception_type = type(exc)
            task_result.errors.append(
                TaskError(
                    exception_class_path=f"{exception_type.__module__}.{exception_type.__qualname__}",
                    traceback="".join(format_exception(exc)),
                )
            )
            object.__setattr__(task_result, "status", TaskResultStatus.READY)
            object.__setattr__(task_result, "finished_at", None)
            backend._store_result(task_result)
            return {"timeoutSeconds": _retry_delay_seconds(cfg, attempt)}

        backend._mark_failed(task_result, exc)
        task_finished.send(sender=type(backend), task_result=task_result)
        return {"acknowledge": True}

    backend._mark_finished_success(task_result, raw_return_value)
    task_finished.send(sender=type(backend), task_result=task_result)
    return None


def handle_queue_callback(
    backend: VercelQueuesBackend,
    raw_body: bytes,
    headers: dict[str, str],
) -> tuple[int, list[tuple[str, str]], bytes]:
    cfg = DjangoTaskWorkerConfig.from_backend_options(
        backend.options if isinstance(backend.options, dict) else {},
    )
    client = _build_queue_client(backend)
    return queue_callback.handle_callback(
        client,
        raw_body,
        headers,
        lambda payload, metadata: _execute_task_payload(backend, cfg, payload, metadata),
        visibility_timeout_seconds=cfg.visibility_timeout_seconds,
        refresh_interval_seconds=cfg.visibility_refresh_interval_seconds,
        context="vercel.workers.django.handle_queue_callback",
    )
