from __future__ import annotations

import asyncio
import contextvars
import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _RequestTask:
    callback: Callable[[], None]
    min_interval_seconds: float | None
    next_run_at: float = 0
    running: Future[None] | None = None


_tasks: dict[str, _RequestTask] = {}
_tasks_lock = threading.Lock()
_task_executor = ThreadPoolExecutor(
    thread_name_prefix="vercel-request-task",
)


def register_request_task(
    name: str,
    callback: Callable[[], None],
    *,
    min_interval_seconds: float | None = None,
) -> None:
    """Register work to run once request-scoped credentials are available.

    A task without an interval runs once per warm runtime. An interval task is
    eligible again on a later request after the interval has elapsed. Repeated
    registration with the same name is intentionally idempotent.
    """
    if not name:
        msg = "request task name must not be empty"
        raise ValueError(msg)
    if min_interval_seconds is not None and min_interval_seconds <= 0:
        msg = "min_interval_seconds must be greater than zero"
        raise ValueError(msg)

    with _tasks_lock:
        _tasks.setdefault(
            name,
            _RequestTask(
                callback=callback,
                min_interval_seconds=min_interval_seconds,
            ),
        )


def run_request_tasks() -> None:
    """Run due tasks off-thread and wait for their shared completion."""
    for future in _request_task_futures():
        future.result()


async def run_request_tasks_async() -> None:
    """Run due tasks without blocking the caller's asyncio event loop."""
    futures = _request_task_futures()
    if futures:
        await asyncio.gather(
            *(asyncio.wrap_future(future) for future in futures),
        )


def _request_task_futures() -> list[Future[None]]:
    now = time.monotonic()
    futures: list[Future[None]] = []

    with _tasks_lock:
        for name, task in _tasks.items():
            if task.running is not None:
                futures.append(task.running)
                continue
            if task.next_run_at > now:
                continue
            request_context = contextvars.copy_context()
            future = _task_executor.submit(
                _execute_request_task,
                name,
                task,
                request_context,
            )
            task.running = future
            futures.append(future)

    return futures


def _execute_request_task(
    name: str,
    task: _RequestTask,
    request_context: contextvars.Context,
) -> None:
    succeeded = False
    try:
        request_context.run(task.callback)
        succeeded = True
    except Exception:
        logger.exception("Request task %r failed", name)
    finally:
        with _tasks_lock:
            current = _tasks.get(name)
            if current is task:
                task.running = None
                if succeeded and task.min_interval_seconds is None:
                    del _tasks[name]
                elif succeeded:
                    interval = task.min_interval_seconds
                    assert interval is not None
                    task.next_run_at = time.monotonic() + interval
                else:
                    # Retry failures on the next request.
                    task.next_run_at = 0


def _reset_request_tasks() -> None:
    """Clear the process-local registry for tests."""
    with _tasks_lock:
        _tasks.clear()
