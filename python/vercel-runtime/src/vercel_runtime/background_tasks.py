from __future__ import annotations

import asyncio
import contextvars
import logging
import os
import time
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from collections.abc import Callable

_logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT: float = 30.0


def get_timeout() -> float:
    """Return the background-task drain timeout from the environment."""
    raw = os.environ.get("VERCEL_WAIT_UNTIL_TIMEOUT")
    if raw is None:
        return _DEFAULT_TIMEOUT
    try:
        timeout = float(raw)
    except ValueError:
        return _DEFAULT_TIMEOUT
    return timeout if timeout >= 0 else _DEFAULT_TIMEOUT


def _warn_timeout(
    timeout: float,
    entrypoint: str,
    stderr: Callable[[str], None],
) -> None:
    stderr(
        f"The function `{os.path.basename(entrypoint)}` is still "
        f"running background tasks after {timeout}s.\n"
        "(hint: do you have a long-running asyncio.create_task() call?)"
    )


# Per-request set of background tasks created via asyncio.create_task().
_request_tasks: contextvars.ContextVar[set[asyncio.Task[Any]] | None] = (
    contextvars.ContextVar("vercel_background_tasks", default=None)
)


def install_task_factory(loop: asyncio.AbstractEventLoop) -> None:
    """Install a task factory that tracks per-request background tasks.

    The factory records every newly-created task into the
    :class:`BackgroundTaskScope` active in the current context (if any).
    Tasks created outside a request context (e.g. by uvicorn internals
    or the ASGI lifespan) are left untracked.
    """
    original_factory = loop.get_task_factory()

    def _tracking_factory(
        loop: asyncio.AbstractEventLoop,
        coro: object,
        **kwargs: Any,
    ) -> asyncio.Task[Any]:
        if original_factory is not None:
            task: asyncio.Task[Any] = cast(
                "asyncio.Task[Any]",
                original_factory(loop, coro, **kwargs),  # type: ignore[arg-type]
            )
        else:
            task = asyncio.Task(coro, loop=loop, **kwargs)  # type: ignore[arg-type]

        tasks_set = _request_tasks.get()
        if tasks_set is not None:
            tasks_set.add(task)
            task.add_done_callback(tasks_set.discard)
        return task

    loop.set_task_factory(_tracking_factory)


class BackgroundTaskScope:
    """Manages background task tracking for a single ASGI request.

    Activate before dispatching to the user app, then :meth:`drain`
    after the app coroutine returns to wait for any background tasks
    spawned via ``asyncio.create_task()``.
    """

    def __init__(self) -> None:
        self._tasks: set[asyncio.Task[Any]] = set()
        self._token: contextvars.Token[set[asyncio.Task[Any]] | None] | None = (
            None
        )

    def activate(self) -> None:
        """Start tracking tasks for this request."""
        self._token = _request_tasks.set(self._tasks)

    async def drain(
        self,
        entrypoint: str,
        stderr: Callable[[str], None],
    ) -> None:
        """Wait for all tracked background tasks, with timeout."""
        current = asyncio.current_task()
        pending = {t for t in self._tasks if t is not current and not t.done()}
        if not pending:
            return

        timeout = get_timeout()
        deadline = time.monotonic() + timeout

        # Loop to catch tasks spawned by other tasks (nested create_task).
        while pending:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _warn_timeout(timeout, entrypoint, stderr)
                return

            done, _ = await asyncio.wait(pending, timeout=remaining)

            # Log exceptions from completed tasks.
            for task in done:
                if task.cancelled():
                    continue
                exc = task.exception()
                if exc is not None:
                    _logger.exception(
                        "Side Effect (via asyncio.create_task) failed",
                        exc_info=exc,
                    )

            # Check for newly-added tasks (nested create_task).
            pending = {
                t for t in self._tasks if t is not current and not t.done()
            }

        # Final check: log exceptions from any tasks that completed
        # between the last wait() and now.
        for task in self._tasks:
            if task is current or not task.done() or task.cancelled():
                continue
            exc = task.exception()
            if exc is not None:
                _logger.exception(
                    "Side Effect (via asyncio.create_task) failed",
                    exc_info=exc,
                )

    def deactivate(self) -> None:
        """Reset the active background-task context."""
        if self._token is not None:
            _request_tasks.reset(self._token)
            self._token = None


__all__ = [
    "BackgroundTaskScope",
    "get_timeout",
    "install_task_factory",
]
