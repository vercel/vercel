from __future__ import annotations

import asyncio
import contextvars
import inspect
import logging
import threading
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

type WaitUntilWork = Awaitable[Any] | Callable[[], Any]
type WaitUntilTarget = Awaitable[Any] | Callable[..., Any]

_logger = logging.getLogger(__name__)


async def _await_awaitable(work: Awaitable[Any]) -> None:
    await work


class WaitUntilState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending = 0
        self._done = threading.Event()
        self._done.set()

    def submit(self, work: WaitUntilWork) -> None:
        context = contextvars.copy_context()
        self._mark_pending()

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is not None:
            context.run(lambda: loop.create_task(self._run_async_work(work)))
            return

        thread = threading.Thread(
            target=lambda: context.run(self._run_sync_work, work),
            daemon=True,
        )
        thread.start()

    async def wait(self) -> None:
        await asyncio.to_thread(self.wait_sync)

    def wait_sync(self) -> None:
        while True:
            self._done.wait()
            with self._lock:
                if self._pending == 0:
                    return

    def _mark_pending(self) -> None:
        with self._lock:
            self._pending += 1
            self._done.clear()

    def _mark_finished(self) -> None:
        with self._lock:
            self._pending -= 1
            if self._pending == 0:
                self._done.set()

    async def _run_async_work(self, work: WaitUntilWork) -> None:
        try:
            result = await self._resolve_async_work(work)
            if inspect.isawaitable(result):
                await result
        except Exception:
            _logger.exception("Side Effect (via waitUntil) failed")
        finally:
            self._mark_finished()

    async def _resolve_async_work(self, work: WaitUntilWork) -> Any:
        if inspect.isawaitable(work):
            return work

        if inspect.iscoroutinefunction(work):
            return work()

        return await asyncio.to_thread(work)

    def _run_sync_work(self, work: WaitUntilWork) -> None:
        try:
            result = work() if callable(work) else work
            if inspect.isawaitable(result):
                asyncio.run(_await_awaitable(result))
        except Exception:
            _logger.exception("Side Effect (via waitUntil) failed")
        finally:
            self._mark_finished()


_wait_until_state: contextvars.ContextVar[WaitUntilState | None] = (
    contextvars.ContextVar(
        "vercel_runtime_wait_until_state",
        default=None,
    )
)


def wait_until(
    work: WaitUntilTarget,
) -> None:
    if not inspect.isawaitable(work) and not callable(work):
        raise TypeError(
            "wait_until() expects an awaitable or zero-argument callable"
        )

    state = _wait_until_state.get()
    if state is None:
        _logger.warning("wait_until() called outside of an active request")
        return

    state.submit(work)


def waitUntil(work: WaitUntilTarget) -> None:  # noqa: N802
    wait_until(work)


def set_wait_until_state(
    state: WaitUntilState,
) -> contextvars.Token[WaitUntilState | None]:
    return _wait_until_state.set(state)


def reset_wait_until_state(
    token: contextvars.Token[WaitUntilState | None],
) -> None:
    _wait_until_state.reset(token)


__all__ = [
    "WaitUntilState",
    "reset_wait_until_state",
    "set_wait_until_state",
    "waitUntil",
    "wait_until",
]
