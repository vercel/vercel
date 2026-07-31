"""Private hooks for Vercel-owned integrations that need request context."""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass
from time import monotonic
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)

type _HookCallback = Callable[[], None]
type _WaitUntil = Callable[[Awaitable[object]], None]


@dataclass(slots=True)
class _InvocationHook:
    callback: _HookCallback
    min_interval_seconds: float | None
    next_run_at: float = 0
    running: bool = False
    completed: bool = False
    failures: int = 0


_hooks: dict[str, _InvocationHook] = {}
_hooks_lock = threading.Lock()
_MAX_FAILURE_BACKOFF_SECONDS = 60.0


def register_invocation_hook(
    name: str,
    callback: _HookCallback,
    *,
    min_interval_seconds: float | None = None,
) -> None:
    """Register a private integration hook to attach to a later invocation."""
    if not name:
        msg = "invocation hook name must not be empty"
        raise ValueError(msg)
    if min_interval_seconds is not None and min_interval_seconds <= 0:
        msg = "min_interval_seconds must be greater than zero"
        raise ValueError(msg)

    with _hooks_lock:
        existing = _hooks.get(name)
        if existing is None:
            _hooks[name] = _InvocationHook(
                callback=callback,
                min_interval_seconds=min_interval_seconds,
            )
            return
        if (
            existing.callback is not callback
            or existing.min_interval_seconds != min_interval_seconds
        ):
            msg = f"invocation hook {name!r} is already registered differently"
            raise ValueError(msg)


def schedule_invocation_hooks(wait_until: _WaitUntil) -> None:
    now = monotonic()
    due: list[tuple[str, _InvocationHook]] = []
    with _hooks_lock:
        for name, hook in _hooks.items():
            if hook.completed or hook.running or hook.next_run_at > now:
                continue
            hook.running = True
            due.append((name, hook))

    for name, hook in due:
        wait_until(_run_hook(name, hook))


async def _run_hook(name: str, hook: _InvocationHook) -> None:
    succeeded = False
    try:
        await asyncio.to_thread(hook.callback)
        succeeded = True
    except Exception:
        logger.exception("Invocation hook %r failed", name)
    finally:
        with _hooks_lock:
            current = _hooks.get(name)
            if current is hook:
                hook.running = False
                if succeeded:
                    hook.failures = 0
                    if hook.min_interval_seconds is None:
                        hook.completed = True
                    else:
                        hook.next_run_at = (
                            monotonic() + hook.min_interval_seconds
                        )
                else:
                    hook.failures += 1
                    hook.next_run_at = monotonic() + min(
                        2 ** (hook.failures - 1),
                        _MAX_FAILURE_BACKOFF_SECONDS,
                    )


def _reset_invocation_hooks() -> None:  # pyright: ignore[reportUnusedFunction]
    """Clear the process-local registry for tests."""
    with _hooks_lock:
        _hooks.clear()
