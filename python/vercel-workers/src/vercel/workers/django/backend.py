from __future__ import annotations

import copy
import json
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from traceback import format_exception
from typing import Any, TypedDict, cast

from ..client import send, send_async

try:
    from django.core.cache import caches  # type: ignore[import-untyped]
    from django.tasks.backends.base import BaseTaskBackend  # type: ignore[import-untyped]
    from django.tasks.base import (  # type: ignore[import-untyped]
        DEFAULT_TASK_PRIORITY,
        Task,
        TaskError,
        TaskResult,
        TaskResultStatus,
    )
    from django.tasks.exceptions import TaskResultDoesNotExist  # type: ignore[import-untyped]
    from django.tasks.signals import task_enqueued  # type: ignore[import-untyped]
    from django.utils import timezone as dj_timezone  # type: ignore[import-untyped]
    from django.utils.crypto import get_random_string  # type: ignore[import-untyped]
    from django.utils.json import normalize_json  # type: ignore[import-untyped]
    from django.utils.module_loading import import_string  # type: ignore[import-untyped]
except Exception as e:
    raise RuntimeError(
        "django is required to use vercel.workers.django. "
        "Install it with `pip install 'vercel-workers[django]'` or `pip install Django>=6.0`.",
    ) from e


__all__ = ["VercelQueuesBackend", "DjangoTaskEnvelope"]


def _now_utc() -> datetime:
    # Prefer Django's timezone utilities when available so USE_TZ is respected.
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
    # Treat naive timestamps as UTC (Django tasks requires aware when USE_TZ).
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


class EnvelopeTask(TypedDict):
    module_path: str
    takes_context: bool
    backend: str
    queue_name: str
    priority: int
    # Always present; None means "no run_after".
    run_after: str | None


class DjangoTaskEnvelope(TypedDict):
    """
    JSON envelope stored in Vercel Queues.

    It intentionally carries only what is required to import and execute the task.
    """

    vercel: dict[str, Any]
    task: EnvelopeTask
    args: list[Any]
    kwargs: dict[str, Any]


StoredTaskRecord = dict[str, Any]


@dataclass(frozen=True, slots=True)
class VercelQueuesBackendOptions:
    """
    Options for `VercelQueuesBackend`, configured via `TASKS[alias]["OPTIONS"]`.
    """

    # Publishing options (passed through to vercel.workers.client.send()).
    token: str | None = None
    base_url: str | None = None
    base_path: str | None = None
    retention_seconds: int | None = None
    deployment_id: str | None = None
    timeout: float | None = 10.0

    # Result storage (Django cache).
    cache_alias: str = "default"
    cache_key_prefix: str = "vercel-workers:django-tasks"
    result_ttl_seconds: int = 24 * 60 * 60

    @classmethod
    def from_options_dict(cls, options: dict[str, Any]) -> VercelQueuesBackendOptions:
        cfg = cls()

        token = options.get("token")
        if isinstance(token, str) and token:
            cfg = replace(cfg, token=token)

        base_url = options.get("base_url")
        if isinstance(base_url, str) and base_url:
            cfg = replace(cfg, base_url=base_url)

        base_path = options.get("base_path")
        if isinstance(base_path, str) and base_path:
            cfg = replace(cfg, base_path=base_path)

        deployment_id = options.get("deployment_id")
        if isinstance(deployment_id, str) and deployment_id:
            cfg = replace(cfg, deployment_id=deployment_id)

        retention = options.get("retention_seconds")
        if isinstance(retention, int):
            cfg = replace(cfg, retention_seconds=retention)

        timeout = options.get("timeout")
        if isinstance(timeout, (int, float)):
            cfg = replace(cfg, timeout=float(timeout))

        cache_alias = options.get("cache_alias")
        if isinstance(cache_alias, str) and cache_alias:
            cfg = replace(cfg, cache_alias=cache_alias)

        cache_key_prefix = options.get("cache_key_prefix")
        if isinstance(cache_key_prefix, str) and cache_key_prefix:
            cfg = replace(cfg, cache_key_prefix=cache_key_prefix)

        result_ttl_seconds = options.get("result_ttl_seconds")
        if isinstance(result_ttl_seconds, int) and result_ttl_seconds > 0:
            cfg = replace(cfg, result_ttl_seconds=result_ttl_seconds)

        return cfg


class VercelQueuesBackend(BaseTaskBackend):
    """
    Django 6.0+ `django.tasks` backend that enqueues tasks into Vercel Queues.

    Execution is performed by an external worker mechanism:
      - on Vercel: queue triggers call a WSGI/ASGI route that you expose via
        `vercel.workers.django.get_wsgi_app()` / `get_asgi_app()`
      - locally: you can still use the Vercel Queue Service API, or use Django's
        ImmediateBackend for synchronous execution.

    This backend stores TaskResults in Django's configured cache so `.get_result()`
    can work across requests/processes (assuming a shared cache like Redis).
    """

    task_class = Task
    supports_defer = True
    supports_async_task = True
    supports_get_result = True
    supports_priority = False

    def __init__(self, alias: str, params: dict[str, Any]):
        super().__init__(alias, params)
        self._cfg = VercelQueuesBackendOptions.from_options_dict(
            self.options if isinstance(self.options, dict) else {},
        )
        # Stable per-process worker id; used for attempts bookkeeping.
        self.worker_id = get_random_string(32)

    def _cache_key(self, result_id: str) -> str:
        # Keep keys short; cache backends may have key length limits.
        return f"{self._cfg.cache_key_prefix}:{self.alias}:{result_id}"

    def _cache(self):
        return caches[self._cfg.cache_alias]

    def _task_from_module_path(
        self,
        *,
        module_path: str,
        queue_name: str,
        takes_context: bool,
        priority: int = DEFAULT_TASK_PRIORITY,
        run_after: datetime | None = None,
    ) -> Task:
        func = import_string(module_path)
        # If it's already a Task instance (from @task decorator), extract the underlying function
        if isinstance(func, Task):
            func = func.func
        if not callable(func):
            raise TypeError(f"Task function is not callable: {module_path!r}")
        return self.task_class(
            priority=int(priority),
            func=func,
            queue_name=queue_name,
            backend=self.alias,
            takes_context=bool(takes_context),
            run_after=run_after,
        )

    def _serialize_result(self, result: TaskResult) -> StoredTaskRecord:
        def _dt(v: datetime | None) -> str | None:
            if v is None:
                return None
            try:
                return v.isoformat()
            except Exception:
                return None

        record: StoredTaskRecord = {
            "version": 1,
            "id": str(result.id),
            "backend_alias": str(result.backend),
            "task_module_path": str(result.task.module_path),
            "task_takes_context": bool(result.task.takes_context),
            "task_queue_name": str(result.task.queue_name),
            "task_priority": int(result.task.priority),
            "status": str(result.status),
            "enqueued_at": _dt(result.enqueued_at),
            "started_at": _dt(result.started_at),
            "finished_at": _dt(result.finished_at),
            "last_attempted_at": _dt(result.last_attempted_at),
            "args": normalize_json(list(result.args)),
            "kwargs": normalize_json(dict(result.kwargs)),
            "worker_ids": list(result.worker_ids),
            "errors": [
                {"exception_class_path": e.exception_class_path, "traceback": e.traceback}
                for e in result.errors
            ],
        }
        # Only store return_value if it's been set (successful execution).
        return_value = getattr(result, "_return_value", None)
        if return_value is not None or result.status == TaskResultStatus.SUCCESSFUL:
            record["return_value"] = normalize_json(return_value)
        return record

    def _deserialize_result(self, record: StoredTaskRecord) -> TaskResult:
        module_path = record.get("task_module_path") or ""
        queue_name = record.get("task_queue_name") or ""
        takes_context = bool(record.get("task_takes_context", False))
        priority = int(record.get("task_priority", DEFAULT_TASK_PRIORITY))
        task = self._task_from_module_path(
            module_path=module_path,
            queue_name=queue_name,
            takes_context=takes_context,
            priority=priority,
            run_after=None,
        )

        status_str = str(record.get("status") or TaskResultStatus.READY)
        try:
            status = TaskResultStatus(status_str)
        except Exception:
            status = TaskResultStatus.READY

        result = TaskResult(
            task=task,
            id=str(record.get("id") or ""),
            status=status,
            enqueued_at=_parse_iso_datetime(record.get("enqueued_at")),
            started_at=_parse_iso_datetime(record.get("started_at")),
            finished_at=_parse_iso_datetime(record.get("finished_at")),
            last_attempted_at=_parse_iso_datetime(record.get("last_attempted_at")),
            args=record.get("args") or [],
            kwargs=record.get("kwargs") or {},
            backend=self.alias,
            errors=[
                TaskError(
                    exception_class_path=e.get("exception_class_path", ""),
                    traceback=e.get("traceback", ""),
                )
                for e in (record.get("errors") or [])
            ],
            worker_ids=list(record.get("worker_ids") or []),
        )
        if "return_value" in record:
            object.__setattr__(result, "_return_value", record.get("return_value"))
        return result

    def _store_result(self, result: TaskResult) -> None:
        record = self._serialize_result(result)
        # Store a JSON string to avoid backend-specific pickling semantics.
        self._cache().set(
            self._cache_key(result.id),
            json.dumps(record, default=str),
            timeout=int(self._cfg.result_ttl_seconds),
        )

    def enqueue(  # type: ignore[override]
        self,
        task: Task,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> TaskResult:
        self.validate_task(task)

        run_after = task.run_after.isoformat() if task.run_after is not None else None
        args_json = cast(list[Any], normalize_json(list(args)))
        kwargs_json = cast(dict[str, Any], normalize_json(dict(kwargs)))
        envelope: DjangoTaskEnvelope = {
            "vercel": {"kind": "django-tasks", "version": 1},
            "task": {
                "module_path": task.module_path,
                "takes_context": bool(task.takes_context),
                "backend": task.backend,
                "queue_name": task.queue_name,
                "priority": int(task.priority),
                "run_after": run_after,
            },
            "args": args_json,
            "kwargs": kwargs_json,
        }

        # Enqueue to the Vercel queue named after Django's queue_name.
        send_result = send(
            task.queue_name,
            envelope,
            retention_seconds=self._cfg.retention_seconds,
            deployment_id=self._cfg.deployment_id,
            token=self._cfg.token,
            base_url=self._cfg.base_url,
            base_path=self._cfg.base_path,
            timeout=self._cfg.timeout,
        )
        message_id = str(send_result["messageId"])

        task_result = TaskResult(
            task=task,
            id=message_id,
            status=TaskResultStatus.READY,
            enqueued_at=_now_utc(),
            started_at=None,
            last_attempted_at=None,
            finished_at=None,
            args=list(args),
            kwargs=kwargs,
            backend=self.alias,
            errors=[],
            worker_ids=[],
        )

        self._store_result(task_result)
        task_enqueued.send(type(self), task_result=task_result)
        # Return a copy so callers don't accidentally share internal list refs.
        return copy.deepcopy(task_result)

    def get_result(self, result_id: str) -> TaskResult:
        raw = self._cache().get(self._cache_key(str(result_id)))
        if raw is None:
            raise TaskResultDoesNotExist(result_id)
        if isinstance(raw, (bytes, bytearray)):
            raw = bytes(raw).decode("utf-8", "replace")
        try:
            record = cast(StoredTaskRecord, json.loads(raw))
        except Exception:
            raise TaskResultDoesNotExist(result_id) from None
        return self._deserialize_result(record)

    async def aenqueue(  # type: ignore[override]
        self,
        task: Task,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> TaskResult:
        """Async variant of enqueue()."""
        self.validate_task(task)

        run_after = task.run_after.isoformat() if task.run_after is not None else None
        args_json = cast(list[Any], normalize_json(list(args)))
        kwargs_json = cast(dict[str, Any], normalize_json(dict(kwargs)))
        envelope: DjangoTaskEnvelope = {
            "vercel": {"kind": "django-tasks", "version": 1},
            "task": {
                "module_path": task.module_path,
                "takes_context": bool(task.takes_context),
                "backend": task.backend,
                "queue_name": task.queue_name,
                "priority": int(task.priority),
                "run_after": run_after,
            },
            "args": args_json,
            "kwargs": kwargs_json,
        }

        # Enqueue using async send.
        send_result = await send_async(
            task.queue_name,
            envelope,
            retention_seconds=self._cfg.retention_seconds,
            deployment_id=self._cfg.deployment_id,
            token=self._cfg.token,
            base_url=self._cfg.base_url,
            base_path=self._cfg.base_path,
            timeout=self._cfg.timeout,
        )
        message_id = str(send_result["messageId"])

        task_result = TaskResult(
            task=task,
            id=message_id,
            status=TaskResultStatus.READY,
            enqueued_at=_now_utc(),
            started_at=None,
            last_attempted_at=None,
            finished_at=None,
            args=list(args),
            kwargs=kwargs,
            backend=self.alias,
            errors=[],
            worker_ids=[],
        )

        self._store_result(task_result)
        task_enqueued.send(type(self), task_result=task_result)
        return copy.deepcopy(task_result)

    async def aget_result(self, result_id: str) -> TaskResult:
        """Async variant of get_result()."""
        # Django's cache doesn't have async API, so we delegate to sync version.
        # For truly async cache access, users could subclass and override.
        return self.get_result(result_id)

    #
    # Internal helpers used by the callback handler
    #
    def _load_or_init_result_from_envelope(
        self,
        *,
        message_id: str,
        envelope: DjangoTaskEnvelope,
    ) -> TaskResult:
        try:
            return self.get_result(message_id)
        except TaskResultDoesNotExist:
            task_info: dict[str, Any] = cast(dict[str, Any], envelope.get("task") or {})
            module_path = str(task_info.get("module_path") or "")
            queue_name = str(task_info.get("queue_name") or "")
            takes_context = bool(task_info.get("takes_context", False))
            priority = int(task_info.get("priority", DEFAULT_TASK_PRIORITY))
            task = self._task_from_module_path(
                module_path=module_path,
                queue_name=queue_name,
                takes_context=takes_context,
                priority=priority,
                run_after=None,
            )
            return TaskResult(
                task=task,
                id=str(message_id),
                status=TaskResultStatus.READY,
                enqueued_at=None,
                started_at=None,
                last_attempted_at=None,
                finished_at=None,
                args=envelope.get("args") or [],
                kwargs=envelope.get("kwargs") or {},
                backend=self.alias,
                errors=[],
                worker_ids=[],
            )

    def _mark_started(self, result: TaskResult, *, worker_id: str) -> TaskResult:
        now = _now_utc()
        object.__setattr__(result, "status", TaskResultStatus.RUNNING)
        object.__setattr__(result, "started_at", now)
        object.__setattr__(result, "last_attempted_at", now)
        result.worker_ids.append(worker_id)
        self._store_result(result)
        return result

    def _mark_finished_success(self, result: TaskResult, return_value: Any) -> TaskResult:
        object.__setattr__(result, "_return_value", normalize_json(return_value))
        object.__setattr__(result, "finished_at", _now_utc())
        object.__setattr__(result, "status", TaskResultStatus.SUCCESSFUL)
        self._store_result(result)
        return result

    def _mark_failed(self, result: TaskResult, exc: BaseException) -> TaskResult:
        exception_type = type(exc)
        result.errors.append(
            TaskError(
                exception_class_path=f"{exception_type.__module__}.{exception_type.__qualname__}",
                traceback="".join(format_exception(exc)),
            )
        )
        object.__setattr__(result, "finished_at", _now_utc())
        object.__setattr__(result, "status", TaskResultStatus.FAILED)
        self._store_result(result)
        return result
