"""Minimal replica of the vercel SDK's wait_until module.

This will be replaced by a dependency on the ``vercel`` package once
the SDK changes are released.
"""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any, TypeAlias

WaitUntilWork: TypeAlias = Awaitable[Any] | Callable[[], Any]
WaitUntilTarget: TypeAlias = Awaitable[Any] | Callable[..., Any]

_cv_wait_until: ContextVar[Callable[[WaitUntilWork], None] | None] = ContextVar(
    "vercel_wait_until", default=None
)


def wait_until(work: WaitUntilTarget) -> None:
    """Enqueue background work that runs after the response is sent."""
    if not inspect.isawaitable(work) and not callable(work):
        raise TypeError("wait_until() expects an awaitable or zero-argument callable")

    callback = _cv_wait_until.get()
    if callback is None:
        return
    callback(work)


@contextmanager
def callback_context(
    callback: Callable[[WaitUntilWork], None],
) -> Iterator[None]:
    """Set the wait_until callback for the current context."""
    token: Token[Callable[[WaitUntilWork], None] | None] = _cv_wait_until.set(callback)
    try:
        yield
    finally:
        _cv_wait_until.reset(token)


__all__ = [
    "WaitUntilWork",
    "WaitUntilTarget",
    "callback_context",
    "wait_until",
]
