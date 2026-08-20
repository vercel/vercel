from __future__ import annotations

import asyncio
import contextlib
import contextvars
import inspect
import logging
import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from vercel_runtime.invocation_hooks import attach_due_hooks

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _PendingAwaitable:
    awaitable: Awaitable[object]
    context: contextvars.Context


class WaitUntilCollector:
    """Invocation-scoped collection of post-response work."""

    def __init__(self) -> None:
        self._pending: dict[int, _PendingAwaitable] = {}
        self._closed = False
        self._lock = threading.Lock()

    def wait_until(self, awaitable: Awaitable[object]) -> None:
        if not inspect.isawaitable(awaitable):
            msg = (
                "wait_until can only be called with an awaitable, "
                f"got {type(awaitable).__name__}"
            )
            raise TypeError(msg)

        with self._lock:
            if self._closed:
                _close_coroutine(awaitable)
                msg = "wait_until cannot be called after the invocation ended"
                raise RuntimeError(msg)
            self._pending.setdefault(
                id(awaitable),
                _PendingAwaitable(
                    awaitable=awaitable,
                    context=contextvars.copy_context(),
                ),
            )

        if isinstance(awaitable, asyncio.Future):
            awaitable.add_done_callback(_consume_future_exception)

    async def drain(self) -> None:
        while True:
            with self._lock:
                batch = list(self._pending.values())
                self._pending.clear()
                if not batch:
                    self._closed = True
                    return

            tasks = [
                pending.context.run(
                    asyncio.ensure_future,
                    pending.awaitable,
                )
                for pending in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, asyncio.CancelledError):
                    logger.error("wait_until task was cancelled")
                elif isinstance(result, BaseException):
                    logger.error(
                        "wait_until task failed",
                        exc_info=(
                            type(result),
                            result,
                            result.__traceback__,
                        ),
                    )


def begin_wait_until() -> WaitUntilCollector:
    collector = WaitUntilCollector()
    _set_public_wait_until(collector.wait_until)
    attach_due_hooks(collector.wait_until)
    return collector


async def finish_wait_until_async(collector: WaitUntilCollector) -> None:
    try:
        await collector.drain()
    finally:
        _set_public_wait_until(None)


def finish_wait_until(collector: WaitUntilCollector) -> None:
    try:
        asyncio.run(collector.drain())
    finally:
        clear_wait_until_context()


def clear_wait_until_context() -> None:
    _set_public_wait_until(None)


def _set_public_wait_until(
    callback: Callable[[Awaitable[object]], None] | None,
) -> None:
    with contextlib.suppress(ImportError):
        from vercel.cache.context import (  # noqa: PLC0415  # pyright: ignore[reportMissingTypeStubs]
            get_context,
            set_context,
        )

        set_context(wait_until=callback)
        if callback is None and get_context().wait_until is not None:
            # vercel-cache versions before its UNSET sentinel treated None as
            # "leave unchanged". Replace the completed collector with a
            # stateless no-op so a warm worker cannot retain the invocation.
            set_context(wait_until=_discard_wait_until)


def _consume_future_exception(future: asyncio.Future[Any]) -> None:
    if not future.cancelled():
        with contextlib.suppress(BaseException):
            future.exception()


def _close_coroutine(awaitable: Awaitable[object]) -> None:
    if inspect.iscoroutine(awaitable):
        awaitable.close()


def _discard_wait_until(awaitable: Awaitable[object]) -> None:
    _close_coroutine(awaitable)
