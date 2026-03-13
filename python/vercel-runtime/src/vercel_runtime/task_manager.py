from __future__ import annotations

import asyncio
import contextvars
import logging
import time
from typing import Any

_logger = logging.getLogger(__name__)
_DEFAULT_TIMEOUT: float = 30.0

# Per-request set of background tasks created via asyncio.create_task().
_request_tasks: contextvars.ContextVar[set[asyncio.Task[Any]] | None] = (
    contextvars.ContextVar("vc_background_tasks", default=None)
)


def activate_task_manager() -> None:
    """Install the task factory and start tracking for this request.

    Installs a custom task factory (once per event loop) that intercepts
    ``asyncio.create_task()`` calls and records them per-request via a
    :class:`~contextvars.ContextVar`.
    """
    _init_task_factory(asyncio.get_running_loop())
    _request_tasks.set(set())


async def drain_task_manager() -> bool:
    """Wait for all tracked background tasks, with the default timeout."""
    return await drain_task_manager_with_timeout(_DEFAULT_TIMEOUT)


async def drain_task_manager_with_timeout(timeout: float) -> bool:
    """Wait for all tracked background tasks, with an explicit timeout.

    Returns ``True`` if all tasks completed, ``False`` if the
    timeout was reached with tasks still pending.
    """
    tasks = _request_tasks.get()
    if tasks is None:
        return True

    current = asyncio.current_task()
    pending = {t for t in tasks if t is not current and not t.done()}
    if not pending:
        return True

    deadline = time.monotonic() + timeout

    # Loop to catch tasks spawned by other tasks (nested create_task).
    while pending:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False

        done, _ = await asyncio.wait(pending, timeout=remaining)

        # Log exceptions from completed tasks.
        for task in done:
            if task.cancelled():
                continue
            exc = task.exception()
            if exc is not None:
                _logger.exception(
                    "background task failed",
                    exc_info=exc,
                )

        # Check for newly-added tasks (nested create_task).
        pending = {t for t in tasks if t is not current and not t.done()}

    return True


def _init_task_factory(loop: asyncio.AbstractEventLoop) -> None:
    """Install a task factory that tracks per-request background tasks.

    The factory records every newly-created task into the per-request
    set stored in the :data:`_request_tasks` context variable (if any).
    Tasks created outside a request context (e.g. by uvicorn internals
    or the ASGI lifespan) are left untracked.

    This function is idempotent: if a factory is already installed on
    *loop* the call is a no-op.
    """
    if loop.get_task_factory() is not None:
        return

    def _tracking_factory(
        loop: asyncio.AbstractEventLoop,
        coro: object,
        **kwargs: Any,
    ) -> asyncio.Task[Any]:
        task: asyncio.Task[Any] = asyncio.Task(coro, loop=loop, **kwargs)  # type: ignore[arg-type]

        tasks_set = _request_tasks.get()
        if tasks_set is not None:
            tasks_set.add(task)
            task.add_done_callback(tasks_set.discard)
        return task

    loop.set_task_factory(_tracking_factory)


__all__ = [
    "activate_task_manager",
    "drain_task_manager",
    "drain_task_manager_with_timeout",
]
