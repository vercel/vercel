"""Private hooks for Vercel-owned integrations that need request context."""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass
from time import monotonic
from typing import TYPE_CHECKING

# Re-exported: hooks decide takeover eligibility from the routed host.
from .headers import current_forwarded_host

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

__all__ = [
    "attach_due_hooks",
    "current_forwarded_host",
    "run_on_next_invocation",
]

logger = logging.getLogger(__name__)

type _HookCallback = Callable[[], float | None]
type _WaitUntil = Callable[[Awaitable[object]], None]


@dataclass(slots=True)
class _InvocationHook:
    callback: _HookCallback
    repeat_after_seconds: float | None
    next_run_at: float = 0
    running: bool = False
    completed: bool = False
    failures: int = 0


_hooks: dict[str, _InvocationHook] = {}
_hooks_lock = threading.Lock()
_MAX_FAILURE_BACKOFF_SECONDS = 60.0


def run_on_next_invocation(
    name: str,
    callback: _HookCallback,
    *,
    repeat_after_seconds: float | None = None,
) -> None:
    """Run callback once, on an upcoming invocation, off the response path.

    The callback executes in a thread after that invocation's response is
    sent, with the request's context (headers, OIDC, the routed host via
    ``current_forwarded_host``) ambient. Failures are
    logged and retried on later invocations with capped backoff. After the
    first success the hook is done — unless repeat_after_seconds is set, in
    which case it becomes eligible again that long after each success,
    still running only when a request arrives. Never a timer.

    A callback may choose its own next run time by returning a non-negative
    number of seconds; zero means the next invocation. Returning a number
    keeps even a one-shot hook alive: it is the callback's way of saying it
    is not done yet. Returning None keeps the registered cadence.
    """
    if not name:
        msg = "invocation hook name must not be empty"
        raise ValueError(msg)
    if repeat_after_seconds is not None and repeat_after_seconds <= 0:
        msg = "repeat_after_seconds must be greater than zero"
        raise ValueError(msg)

    with _hooks_lock:
        existing = _hooks.get(name)
        if existing is None:
            _hooks[name] = _InvocationHook(
                callback=callback,
                repeat_after_seconds=repeat_after_seconds,
            )
            return
        if (
            existing.callback is not callback
            or existing.repeat_after_seconds != repeat_after_seconds
        ):
            msg = f"invocation hook {name!r} is already registered differently"
            raise ValueError(msg)


def attach_due_hooks(wait_until: _WaitUntil) -> None:
    """Attach whatever hooks are due to the current invocation's drain."""
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
    reschedule_after: float | None = None
    try:
        result = await asyncio.to_thread(hook.callback)
        if isinstance(result, (int, float)) and not isinstance(result, bool):
            reschedule_after = max(0.0, float(result))
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
                    if reschedule_after is not None:
                        hook.next_run_at = monotonic() + reschedule_after
                    elif hook.repeat_after_seconds is None:
                        hook.completed = True
                    else:
                        hook.next_run_at = (
                            monotonic() + hook.repeat_after_seconds
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
